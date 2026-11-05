import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import type { Language } from '@/lib/supabase';
import {useNativePush} from '@/lib/use-native-push';
import {nativePushSupported} from '@/lib/native-push';
import type {NativePushState} from '@/lib/native-push-core';
import {validNativeAction,type NativeAction} from '@/lib/native-push-core';

export type NotificationType =
  | 'MEAL_REQUEST_CREATED' | 'MEAL_REQUEST_ACCEPTED' | 'MEAL_REQUEST_REJECTED'
  | 'MEAL_REQUEST_EXPIRED' | 'MEAL_REQUEST_CANCELLED'
  | 'MEAL_READY_FOR_PICKUP' | 'HELPER_ON_THE_WAY' | 'HELPER_ARRIVED'
  | 'MEAL_RECEIVED' | 'MEAL_COMPLETED'
  | 'NEW_CHAT_MESSAGE' | 'NEW_NEARBY_MEAL'
  | 'NEW_ACHIEVEMENT' | 'GENERAL_SHAReK_NOTIFICATION';

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  related_id: string | null;
  related_type: string | null;
  language: string;
  priority: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

export type DeepLinkAction = {
  type: string;
  id: string | null;
  notificationId?:string;
  actionType?:'accept_help';
  requesterId?:string;
};

type NotificationContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteNotifications: (ids: string[]) => Promise<void>;
  getAllNotificationIds: () => Promise<string[]>;
  error: boolean;
  loadMore: () => void;
  hasMore: boolean;
  registerToken: (token: string) => void;
  unregisterToken: (token: string) => void;
  requestPermission: () => Promise<void>;
  hasPermission: boolean;
  nativePushState:NativePushState;
  toasts: AppNotification[];
  dismissToast: (id: string) => void;
  deepLink: DeepLinkAction | null;
  clearDeepLink: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

export function NotificationProvider({ children, userId }: { children: ReactNode; userId: string | null; language: Language }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [webPermission, setWebPermission] = useState(false);
  const [deepLink, setDeepLink] = useState<DeepLinkAction | null>(null);
  const [error,setError]=useState(false),[limit,setLimit]=useState(50),[hasMore,setHasMore]=useState(false);
  const refreshRef=useRef<()=>Promise<void>>(async()=>{}),permissionRef=useRef(webPermission);permissionRef.current=webPermission;
  const native=useNativePush(userId,action=>{
    if(action.action_type==='accept_help')localStorage.setItem('sharek-pending-help-action',JSON.stringify({action,savedAt:Date.now()}));
    setDeepLink({type:action.related_type,id:action.related_id,notificationId:action.notification_id,actionType:action.action_type,requesterId:action.requester_id});
  },()=>void refreshRef.current());
  useEffect(()=>{
    if(!userId)return;
    try{
      const saved=JSON.parse(localStorage.getItem('sharek-pending-help-action')??'null') as {action:NativeAction;savedAt:number}|null;
      if(saved&&Date.now()-saved.savedAt<24*60*60*1000&&validNativeAction(saved.action,userId)){
        setDeepLink({type:saved.action.related_type,id:saved.action.related_id,notificationId:saved.action.notification_id,actionType:saved.action.action_type,requesterId:saved.action.requester_id});
      }else if(saved)localStorage.removeItem('sharek-pending-help-action');
    }catch{localStorage.removeItem('sharek-pending-help-action');}
  },[userId]);
  const nativeRequestPermission=native.requestPermission;
  const hasPermission=nativePushSupported()?native.granted:webPermission;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if(nativePushSupported()){await nativeRequestPermission();return;}
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      setWebPermission(true);
      return;
    }
    const result = await Notification.requestPermission();
    setWebPermission(result === 'granted');
  }, [nativeRequestPermission]);

  // Browser Web Push is separate from native Android FCM device registration.
  const registerToken = useCallback((token: string) => {
    if (!userIdRef.current || !token) return;
    void supabase.rpc('register_notification_token', { p_token: token, p_platform: 'web' });
  }, []);

  const unregisterToken = useCallback((token: string) => {
    if (!token) return;
    void supabase.rpc('unregister_notification_token', { p_token: token });
  }, []);

  // Re-read the authoritative count, including rows outside the visible page.
  // Never increment/decrement locally: duplicate Realtime events and read retries are idempotent.
  useEffect(()=>{setNotifications([]);setUnreadCount(0);setToasts([]);setError(false);setLimit(50);},[userId]);
  useEffect(() => {
    if (!userId) {
      refreshRef.current=async()=>{};
      return;
    }
    let alive=true,dirty=false,running:Promise<void>|null=null,timer:number|undefined;
    const seen=new Set<string>();
    const refresh=():Promise<void>=>{
      if(running){dirty=true;return running;}
      running=(async()=>{do{dirty=false;
        const [rows,count]=await Promise.all([
          supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(limit+1),
          supabase.rpc('get_unread_notification_count'),
        ]);
        if(!alive)return;
        if(rows.error||count.error){setError(true);return;}
        const unique=Array.from(new Map((rows.data as AppNotification[]??[]).map(n=>[n.id,n])).values());
        unique.forEach(n=>seen.add(n.id));setHasMore(unique.length>limit);setNotifications(unique.slice(0,limit));setUnreadCount(Number(count.data)||0);setError(false);
      }while(dirty&&alive);})().catch(()=>{if(alive)setError(true);}).finally(()=>{running=null;});return running;
    };
    refreshRef.current=refresh;
    const schedule=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>void refresh(),120);};
    const channel = supabase
      .channel(`notifications-realtime-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const notif = payload.new as AppNotification;
        schedule();if(!alive||seen.has(notif.id)||notif.user_id!==userId)return;seen.add(notif.id);
        // Show in-app toast
        setToasts((prev) => prev.some(n=>n.id===notif.id)?prev:[...prev, notif]);
        // Vibrate if supported
        if(!Capacitor.isNativePlatform())navigator.vibrate?.(notif.priority === 'high' ? [90, 60, 90] : [60]);
        // If app is in background, show system notification
        if (!Capacitor.isNativePlatform() && document.hidden && permissionRef.current && 'Notification' in window) {
          new Notification(notif.title, {
            body: notif.body,
            icon: import.meta.env.BASE_URL+'image.png',
            tag: notif.id,
            data: { click_action: notif.related_type ? `${notif.related_type}:${notif.related_id}` : 'home' },
          });
        }
        // Server-side DB trigger (on_notification_created_push) calls the
        // send-fcm edge function automatically — no client-side fetch needed.
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },schedule)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' },schedule)
      .subscribe(status=>{if(status==='SUBSCRIBED')schedule();});
    void refresh();const poll=window.setInterval(()=>void refresh(),30000);
    const foreground=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',foreground);window.addEventListener('online',foreground);
    return () => { alive=false;window.clearInterval(poll);window.clearTimeout(timer);document.removeEventListener('visibilitychange',foreground);window.removeEventListener('online',foreground);void supabase.removeChannel(channel); };
  }, [userId,limit]);

  // Service worker registration for background push
  useEffect(() => {
    if (Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(import.meta.env.BASE_URL+'firebase-messaging-sw.js').catch(() => {});
  }, []);

  // Listen for service worker postMessage (notification click when app is open)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.action) {
        const [type, id] = event.data.action.split(':');
        setDeepLink({ type, id: id || null });
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  // Check URL for deep link on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action) {
      const [type, id] = action.split(':');
      setDeepLink({ type, id: id || null });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const markAsRead = useCallback(async(id: string) => {
    const {error}=await supabase.rpc('mark_notification_read',{p_notification_id:id});if(error)throw error;await refreshRef.current();
  }, []);

  const markAllAsRead = useCallback(async() => {
    const {error}=await supabase.rpc('mark_all_notifications_read');if(error)throw error;await refreshRef.current();
  }, []);

  const deleteNotification = useCallback(async(id: string) => {
    const {error}=await supabase.rpc('delete_notification',{p_notification_id:id});if(error)throw error;await refreshRef.current();
  }, []);

  const getAllNotificationIds = useCallback(async (): Promise<string[]> => {
    const id = userIdRef.current;
    if (!id) return [];
    const ids: string[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('notifications').select('id').eq('user_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
      if (error) throw error;
      ids.push(...(data ?? []).map(row => row.id));
      if (!data || data.length < 500) return ids;
    }
  }, []);

  const deleteNotifications = useCallback(async (ids: string[]) => {
    try {
      for (let offset = 0; offset < ids.length; offset += 20) {
        const results = await Promise.all(ids.slice(offset, offset + 20).map(id => supabase.rpc('delete_notification', { p_notification_id: id })));
        const failed = results.find(result => result.error);
        if (failed?.error) throw failed.error;
      }
    } finally {
      await refreshRef.current();
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearDeepLink = useCallback(() => {localStorage.removeItem('sharek-pending-help-action');setDeepLink(null);}, []);

  // Auto-dismiss toasts after 6 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((prev) => prev.slice(1)), 6000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, deleteNotifications, getAllNotificationIds,
      error,hasMore,loadMore:()=>setLimit(n=>n+50),
      registerToken, unregisterToken, requestPermission, hasPermission,
      toasts, dismissToast, deepLink, clearDeepLink,
      nativePushState:native.state,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}
