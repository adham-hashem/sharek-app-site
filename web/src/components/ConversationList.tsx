import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, MessageCircle, Utensils } from 'lucide-react';
import {App} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';
import { supabase, type Conversation, type Language } from '@/lib/supabase';

type Props = {
  language: Language;
  currentUserId: string;
  userLat: number | null;
  userLng: number | null;
  onBack: () => void;
  onOpenChat: (threadId: string, partnerId: string, partnerName: string, partnerAvatar: string | null, requestId: string | null, requestStatus: string | null) => void;
};

const statusLabels: Record<string, { ar: string; en: string; color: string }> = {
  SEARCHING: { ar: 'جاري البحث', en: 'Searching', color: '#f59e0b' },
  ACCEPTED: { ar: 'تم القبول', en: 'Accepted', color: '#22c55e' },
  WAITING_FOR_PICKUP: { ar: 'في انتظار الاستلام', en: 'Waiting for pickup', color: '#f59e0b' },
  ON_THE_WAY: { ar: 'في الطريق', en: 'On the way', color: '#3b82f6' },
  RECEIVED: { ar: 'تم الاستلام', en: 'Received', color: '#22c55e' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: '#94a3b8' },
  NOT_FOUND: { ar: 'غير موجود', en: 'Not found', color: '#ef4444' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: '#ef4444' },
};

function formatTimeAgo(iso: string | null, language: Language): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return language === 'ar' ? 'الآن' : 'now';
  if (mins < 60) return language === 'ar' ? `قبل ${mins} د` : `${mins}m`;
  if (hrs < 24) return language === 'ar' ? `قبل ${hrs} س` : `${hrs}h`;
  if (days < 7) return language === 'ar' ? `قبل ${days} ي` : `${days}d`;
  return new Date(iso).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' });
}

export function ConversationList({ language, currentUserId, onBack, onOpenChat }: Props) {
  const isAr = language === 'ar';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,setError]=useState(false),active=useRef(true),inFlight=useRef(false),dirty=useRef(false);

  const fetchConversations = useCallback(async () => {
    if(inFlight.current){dirty.current=true;return;}inFlight.current=true;
    try{do{dirty.current=false;
    const { data, error } = await supabase.rpc('get_conversation_list');
    if (error) {
      if(active.current)setError(true);
      return;
    }
    if(active.current){setConversations((data ?? []) as Conversation[]);setError(false);}
    }while(dirty.current&&active.current);}catch{if(active.current)setError(true);}finally{inFlight.current=false;}
  }, []);

  useEffect(() => {
    setLoading(true);
    active.current=true;let timer:number|undefined;
    void fetchConversations().finally(() => setLoading(false));
    const refresh=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>void fetchConversations(),80);};
    const foreground=()=>{if(!document.hidden)refresh();};
    const channel = supabase.channel(`conversations-list-${currentUserId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' },refresh).on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_threads'},refresh).subscribe(status=>{if(status==='SUBSCRIBED')refresh();});
    window.addEventListener('sharek-chat-read',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',foreground);const poll=window.setInterval(foreground,15000);
    const native=Capacitor.isNativePlatform()?App.addListener('appStateChange',state=>{if(state.isActive)refresh();}):null;
    return () => {active.current=false;window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener('sharek-chat-read',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',foreground);void native?.then(listener=>listener.remove()).catch(()=>{});void supabase.removeChannel(channel);};
  }, [fetchConversations,currentUserId]);

  const copy = {
    title: isAr ? 'المحادثات' : 'Chats',
    empty: isAr ? 'لا توجد محادثات بعد' : 'No conversations yet',
    emptySub: isAr ? 'عندما يبدأ طلب أو حجز، ستظهر المحادثة هنا' : 'When a request or reservation starts, the chat will appear here',
    back: isAr ? 'رجوع' : 'Back',
    unknown: isAr ? 'مستخدم SHARek' : 'SHARek user',
    typing: isAr ? 'يكتب...' : 'typing...',
  };

  const sorted = [...conversations].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="conversation-list-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="conversation-list-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <h2>{copy.title}</h2>
      </header>
      {error&&<div role="alert" className="feedback error">{isAr?'تعذر تحديث المحادثات.':'Could not update conversations.'}<button className="text-button" onClick={()=>void fetchConversations()}>{isAr?'إعادة المحاولة':'Retry'}</button></div>}
      {loading ? (
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      ) : sorted.length === 0 ? (
        <div className="conversation-empty">
          <span className="conversation-empty-icon"><MessageCircle size={32} /></span>
          <h3>{copy.empty}</h3>
          <p>{copy.emptySub}</p>
        </div>
      ) : (
        <div className="conversation-items">
          {sorted.map((conv) => {
            const status = conv.request_status ? statusLabels[conv.request_status] : null;
            const lastMsgIsImage = conv.last_message_type === 'image';
            const lastMsgIsLocation = conv.last_message_type === 'location';
            const lastMsgIsSystem = conv.last_message_type === 'system';
            const lastMsgPreview = lastMsgIsImage ? (isAr ? '📷 صورة' : '📷 Photo')
              : lastMsgIsLocation ? (isAr ? '📍 موقع' : '📍 Location')
              : lastMsgIsSystem ? (isAr ? '🔔 تحديث الحالة' : '🔔 Status update')
              : conv.last_message_body ?? '';
            return (
              <button
                key={conv.thread_id}
                className={`conversation-item ${conv.unread_count > 0 ? 'unread' : ''} ${conv.archived ? 'archived' : ''}`}
                onClick={() => onOpenChat(conv.thread_id, conv.partner_id, conv.partner_name ?? copy.unknown, conv.partner_avatar, conv.request_id, conv.request_status)}
              >
                <div className="conversation-avatar-wrap">
                  {conv.partner_avatar ? (
                    <img src={conv.partner_avatar} alt="" className="conversation-avatar" />
                  ) : (
                    <span className="conversation-avatar placeholder"><MessageCircle size={18} /></span>
                  )}
                  {conv.partner_online && <span className="conversation-online-dot" />}
                </div>
                <div className="conversation-body">
                  <div className="conversation-top-row">
                    <span className="conversation-name">
                      {conv.partner_name ?? copy.unknown}
                      {conv.partner_verified && <BadgeCheck size={14} className="conversation-verified" />}
                    </span>
                    <span className="conversation-time">{formatTimeAgo(conv.last_message_at, language)}</span>
                  </div>
                  <div className="conversation-bottom-row">
                    <span className="conversation-preview">
                      {conv.last_message_sender === currentUserId && !lastMsgIsSystem && (isAr ? 'أنت: ' : 'You: ')}
                      {lastMsgPreview}
                    </span>
                    {conv.unread_count > 0 && <span className="conversation-unread-badge">{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>}
                  </div>
                  {(status || conv.meal_name) && (
                    <div className="conversation-meta-row">
                      {conv.meal_name && (
                        <span className="conversation-meal-tag">
                          {conv.meal_photo ? <img src={conv.meal_photo} alt="" /> : <Utensils size={12} />}
                          {conv.meal_name}
                        </span>
                      )}
                      {status && (
                        <span className="conversation-status-tag" style={{ color: status.color }}>
                          <span className="status-dot" style={{ background: status.color }} />
                          {isAr ? status.ar : status.en}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
