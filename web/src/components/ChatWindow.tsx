import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { advanceMealRequest } from '@/lib/meal-operations';
import {
  ArrowLeft, Send, MapPin, Camera, Check, CheckCheck, MoreVertical,
  Copy, Trash2, Flag, Reply, X, BadgeCheck, Star, Utensils, Navigation,
  Clock, AlertCircle, Shield, ChevronDown, Heart, ImagePlus, Users,
} from 'lucide-react';
import {
  supabase, haversineDistance, formatDistance,
  type ChatMessage, type Language, type MealRequest,
} from '@/lib/supabase';
import { MapView } from './MapView';
import { ReportUserSheet } from './ReportUserSheet';
import { BlockUserModal } from './BlockUserModal';
import {CHAT_REACTIONS,chatError,currentChatLocation,mergeChatMessages,sendChatMessage,type ChatReaction} from '@/lib/chat-operations';
import {chooseNativeChatImage,nativeGalleryAvailable,uploadChatImage,validateChatImage} from '@/lib/chat-media';
import {useChatRead} from '@/lib/use-chat-read';
import {ChatImage,ChatImageViewer} from './ChatImage';
import {ChatLocationNavigation} from './ChatLocationNavigation';
import {MarketChatCard} from './MarketChatCard';
import {validCoordinates} from '@/lib/geo';
import {notifyChatBlocksChanged,useChatBlockState} from '@/lib/chat-blocks';

type Props = {
  language: Language;
  threadId: string | null;
  partnerId: string;
  partnerName: string;
  partnerAvatar: string | null;
  currentUserId: string;
  requestId: string | null;
  requestStatus: string | null;
  userLat: number | null;
  userLng: number | null;
  onBack: () => void;
};

type PartnerProfile = {
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  average_rating: number;
  total_meals_shared: number;
};

type QuickMessage = { ar: string; en: string };

const quickMessages: QuickMessage[] = [
  { ar: 'أنا في الطريق', en: "I'm on my way" },
  { ar: 'وصلت', en: "I've arrived" },
  { ar: 'أين نقطة الاستلام؟', en: 'Where is the pickup point?' },
  { ar: 'أنا بانتظارك', en: "I'm waiting for you" },
  { ar: 'سأصل خلال دقائق', en: "I'll arrive in a few minutes" },
  { ar: 'تم استلام الوجبة', en: 'Meal received' },
];

const statusLabels: Record<string, { ar: string; en: string; color: string }> = {
  SEARCHING: { ar: 'جاري البحث', en: 'Searching', color: '#f59e0b' },
  ACCEPTED: { ar: 'تم القبول', en: 'Accepted', color: '#22c55e' },
  WAITING_FOR_PICKUP: { ar: 'في انتظار الاستلام', en: 'Waiting for pickup', color: '#f59e0b' },
  ON_THE_WAY: { ar: 'في الطريق', en: 'On the way', color: '#3b82f6' },
  RECEIVED: { ar: 'تم الاستلام', en: 'Received', color: '#22c55e' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: '#94a3b8' },
  CANCELLED: { ar: 'أُلغي الطلب', en: 'Request cancelled', color: '#94a3b8' },
  NOT_FOUND: { ar: 'انتهى البحث', en: 'Search expired', color: '#94a3b8' },
  EXPIRED: { ar: 'انتهى الطلب', en: 'Request expired', color: '#94a3b8' },
};

function formatTime(iso: string, language: Language): string {
  return new Date(iso).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

function playMessageSound(): void {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.16);
    window.setTimeout(() => void ctx.close(), 250);
  } catch { /* audio not available */ }
}

export function ChatWindow({
  language, threadId, partnerId, partnerName, partnerAvatar,
  currentUserId, requestId, userLat, userLng, onBack,
}: Props) {
  const isAr = language === 'ar';
  const [resolvedThreadId, setResolvedThreadId] = useState<string | null>(threadId);
  const [threadPartner,setThreadPartner]=useState<{threadId:string;partnerId:string}|null>(null);
  const effectivePartnerId=resolvedThreadId&&threadPartner?.threadId===resolvedThreadId
    ?threadPartner.partnerId:threadId?null:partnerId||null;
  const {blockState,blockLoading,refreshBlockState}=useChatBlockState(effectivePartnerId);
  const chatBlocked=blockLoading||!blockState||blockState.blocked_by_me||blockState.blocked_by_other;
  const [unblocking,setUnblocking]=useState(false),[blockNotice,setBlockNotice]=useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [request, setRequest] = useState<MealRequest | null>(null);
  const [threadArchived, setThreadArchived] = useState(false);
  const [mealInfo, setMealInfo] = useState<{ name: string; photo_url: string | null } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerLiveLocation, setPartnerLiveLocation] = useState<{ lat: number; lng: number; expires_at: string; last_updated: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showQuickMessages, setShowQuickMessages] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [actionPos, setActionPos] = useState<{ x: number; y: number } | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [liveLocationSession, setLiveLocationSession] = useState<string | null>(null);
  const [liveLocationExpiry, setLiveLocationExpiry] = useState<number | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{id:string;file:File;preview:string}|null>(null);
  const [viewer,setViewer]=useState<string|null>(null),[chatIssue,setChatIssue]=useState(''),[gettingLocation,setGettingLocation]=useState(false);
  const [navigationTarget,setNavigationTarget]=useState<{latitude:number;longitude:number}|null>(null);
  const [reactions,setReactions]=useState<ChatReaction[]>([]),[reactionDetail,setReactionDetail]=useState<string|null>(null),[hasOlder,setHasOlder]=useState(false),[olderLoading,setOlderLoading]=useState(false);
  const [failedMessages, setFailedMessages] = useState<Set<string>>(new Set());
  const [showRating, setShowRating] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [hasRated, setHasRated] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const typingTimeoutRef = useRef<number | null>(null);
  const lastSoundTimeRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef=useRef<HTMLInputElement>(null),sendingRef=useRef(false),uploadRef=useRef(false),activeThreadRef=useRef(resolvedThreadId);
  const pickerThreadRef=useRef<string|null>(null);
  activeThreadRef.current=resolvedThreadId;
  const pendingIds=useRef(new Set<string>()),longPress=useRef<{timer:number;x:number;y:number}|null>(null),suppressClickUntil=useRef(0);
  const liveLocationIntervalRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const liveSessionRef=useRef<string|null>(null);

  const copy = useMemo(() => ({
    back: isAr ? 'رجوع' : 'Back',
    placeholder: isAr ? 'اكتب رسالة...' : 'Type a message...',
    sending: isAr ? 'جاري الإرسال...' : 'Sending...',
    failed: isAr ? 'فشل الإرسال — إعادة المحاولة' : 'Failed to send — Retry',
    online: isAr ? 'متصل الآن' : 'Online',
    offline: isAr ? 'غير متصل' : 'Offline',
    typing: isAr ? 'يكتب...' : 'typing...',
    quickMessages: isAr ? 'رسائل سريعة' : 'Quick messages',
    copy: isAr ? 'نسخ' : 'Copy',
    deleteForMe: isAr ? 'حذف لدي' : 'Delete for me',
    deleteForAll: isAr ? 'حذف للجميع' : 'Delete for everyone',
    report: isAr ? 'إبلاغ' : 'Report',
    reply: isAr ? 'رد' : 'Reply',
    blockUser: isAr ? 'حظر المستخدم' : 'Block user',
    unblockUser: isAr ? 'إلغاء الحظر' : 'Unblock user',
    reportUser: isAr ? 'الإبلاغ عن المستخدم' : 'Report user',
    blockConfirm: isAr ? 'هل تريد حظر هذا المستخدم؟ لن يتمكن من إرسال رسائل لك.' : 'Block this user? They will not be able to message you.',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    confirm: isAr ? 'تأكيد' : 'Confirm',
    shareLocation: isAr ? 'مشاركة الموقع' : 'Share location',
    currentLocation: isAr ? 'الموقع الحالي' : 'Current location',
    liveLocation: isAr ? 'موقع مباشر' : 'Live location',
    liveLocationActive: isAr ? 'المشاركة المباشرة نشطة' : 'Live sharing active',
    stopSharing: isAr ? 'إيقاف المشاركة' : 'Stop sharing',
    remaining: isAr ? 'متبقي' : 'Remaining',
    mealReady: isAr ? 'الوجبة جاهزة' : 'Mark as ready',
    confirmReceived: isAr ? 'تأكيد الاستلام' : 'Confirm received',
    complete: isAr ? 'إتمام' : 'Complete',
    rateExperience: isAr ? 'قيّم تجربتك' : 'Rate your experience',
    submitRating: isAr ? 'إرسال التقييم' : 'Submit rating',
    thankYou: isAr ? 'شكرًا لتقييمك!' : 'Thank you for your rating!',
    rated: isAr ? 'تم التقييم' : 'Rated',
    you: isAr ? 'أنت' : 'You',
    image: isAr ? 'صورة' : 'Photo',
    location: isAr ? 'موقع' : 'Location',
    unknown: isAr ? 'مستخدم SHARek' : 'SHARek user',
    deleteMsg: isAr ? 'حذف الرسالة' : 'Delete message',
    reportReason: isAr ? 'سبب البلاغ' : 'Report reason',
    details: isAr ? 'تفاصيل إضافية' : 'Additional details',
    detailsPlaceholder: isAr ? 'أخبرنا المزيد...' : 'Tell us more...',
    submitReport: isAr ? 'إرسال البلاغ' : 'Submit report',
    archived: isAr ? 'تم أرشفة هذه المحادثة' : 'This conversation is archived',
    systemMessage: isAr ? 'رسالة نظام' : 'System message',
  }), [isAr]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  // Resolve thread ID if not provided
  useEffect(() => {
    if (threadId) { setResolvedThreadId(threadId); return; }
    if (!partnerId) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc('get_or_create_chat_thread', { p_partner_id: partnerId });
      if (!mounted) return;
      if (error || !data) {if(error)setChatIssue(chatError(error,isAr));setLoading(false);return;}
      setResolvedThreadId(data as string);
    })();
    return () => { mounted = false; };
  }, [threadId, partnerId,isAr]);

  // Load messages
  const loadMessages = useCallback(async (tid: string) => {
    const follow=!scrollRef.current||scrollRef.current.scrollHeight-scrollRef.current.scrollTop-scrollRef.current.clientHeight<100;
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', tid)
      .order('created_at', { ascending: false }).order('id',{ascending:false})
      .limit(200);
    if(activeThreadRef.current!==tid)return;
    if (!error && data) {
      setHasOlder(data.length===200);
      setMessages(previous=>mergeChatMessages(previous,(data as ChatMessage[]).reverse(),pendingIds.current));
      if(follow)scrollToBottom();
    }else if(error)setChatIssue(chatError(error,isAr));
    setLoading(false);
  }, [scrollToBottom,isAr]);
  const readConfirmed=useCallback((rows:Pick<ChatMessage,'id'|'read_at'|'status'>[])=>{const map=new Map(rows.map(row=>[row.id,row]));setMessages(previous=>previous.map(m=>map.has(m.id)?{...m,...map.get(m.id)}:m));setChatIssue('');},[]);
  const readFailed=useCallback(()=>setChatIssue(isAr?'تعذر حفظ قراءة الرسائل. ستتم إعادة المحاولة عند عودة الاتصال.':'Could not save read receipts. Retrying when connected.'),[isAr]);
  useChatRead(scrollRef,resolvedThreadId,currentUserId,messages,readConfirmed,readFailed,!loading&&!viewer&&!showReportModal&&!showBlockModal&&!showLocationPicker&&!reactionDetail&&!actionMessage);
  const loadReactions=useCallback(async(tid:string)=>{const {data,error}=await supabase.rpc('get_chat_reactions',{p_thread_id:tid});if(activeThreadRef.current===tid){if(!error)setReactions(data??[]);else setChatIssue(chatError(error,isAr));}},[isAr]);
  const react=async(message:ChatMessage,emoji:string|null)=>{if(message.status==='sending')return;const {error}=await supabase.rpc('set_chat_reaction',{p_message_id:message.id,p_emoji:emoji});if(error)setChatIssue(chatError(error,isAr));else await loadReactions(message.thread_id);setActionMessage(null);};
  const loadOlder=async()=>{if(!resolvedThreadId||olderLoading||!messages.length)return;setOlderLoading(true);const oldest=messages.find(m=>m.status!=='sending');if(!oldest){setOlderLoading(false);return;}const height=scrollRef.current?.scrollHeight??0;
   const {data,error}=await supabase.from('chat_messages').select('*').eq('thread_id',resolvedThreadId).or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);
   if(error)setChatIssue(chatError(error,isAr));else{setMessages(previous=>mergeChatMessages(previous,(data??[]).reverse(),pendingIds.current));setHasOlder(data?.length===200);requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight-height;});}setOlderLoading(false);
  };

  // Load partner profile, meal info, and request info
  useEffect(() => {
    if (!resolvedThreadId) return;
    let mounted = true;
    (async () => {
      const [profileRes, threadRes] = await Promise.all([
        supabase.rpc('get_chat_partner_profile', { p_thread_id: resolvedThreadId }),
        supabase.from('chat_threads').select('participant_a,participant_b,request_id,meal_id,archived').eq('id', resolvedThreadId).maybeSingle(),
      ]);
      if (!mounted) return;
      if (profileRes.data) {
        const p = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
        if (p) setPartner(p as PartnerProfile);
      }
      if(threadRes.data){
        setThreadArchived(threadRes.data.archived === true);
        const other=threadRes.data.participant_a===currentUserId?threadRes.data.participant_b:
          threadRes.data.participant_b===currentUserId?threadRes.data.participant_a:null;
        if(other)setThreadPartner({threadId:resolvedThreadId,partnerId:other});
      }
      if (threadRes.data?.meal_id) {
        const { data: mealData } = await supabase.from('meals').select('name,photo_url').eq('id', threadRes.data.meal_id).maybeSingle();
        if (mounted && mealData) setMealInfo({ name: mealData.name, photo_url: mealData.photo_url });
      }
      if (threadRes.data?.request_id && !requestId) {
        const { data: reqData } = await supabase.from('meal_requests').select('*').eq('id', threadRes.data.request_id).maybeSingle();
        if (mounted && reqData) setRequest(reqData as MealRequest);
      }
    })();
    return () => { mounted = false; };
  }, [resolvedThreadId, requestId,currentUserId]);

  // Load request info if requestId provided (also fetch meal info)
  useEffect(() => {
    if (!requestId) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase.from('meal_requests').select('*').eq('id', requestId).maybeSingle();
      if (!mounted) return;
      if (data) {
        setRequest(data as MealRequest);
        if (data.pickup_meal_id) {
          const { data: mealData } = await supabase.from('meals').select('name,photo_url').eq('id', data.pickup_meal_id).maybeSingle();
          if (mounted && mealData) setMealInfo({ name: mealData.name, photo_url: mealData.photo_url });
        }
      }
    })();
    return () => { mounted = false; };
  }, [requestId]);

  // Subscribe to realtime messages
  useEffect(()=>{setMessages([]);setLoading(true);setChatIssue('');setReactions([]);pendingIds.current.clear();setFailedMessages(new Set());setPendingImage(null);setViewer(null);setReplyTo(null);setActionMessage(null);setReactionDetail(null);setShowLocationPicker(false);setInput('');setPartner(null);setMealInfo(null);setRequest(null);setThreadArchived(false);setLiveLocationSession(null);setLiveLocationExpiry(null);},[resolvedThreadId,currentUserId]);
  useEffect(() => {
    if (!resolvedThreadId) return;
    void loadMessages(resolvedThreadId);
    void loadReactions(resolvedThreadId);

    void supabase.rpc('clear_stale_typing');

    const channel = supabase.channel(`chat-rt-${resolvedThreadId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${resolvedThreadId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          const follow=!scrollRef.current||scrollRef.current.scrollHeight-scrollRef.current.scrollTop-scrollRef.current.clientHeight<100;
          setMessages((prev) => mergeChatMessages(prev,[msg],pendingIds.current));
          if(follow)scrollToBottom();
          if (msg.sender_id !== currentUserId && msg.message_type !== 'system') {
            const now = Date.now();
            if (now - lastSoundTimeRef.current > 800) {
              playMessageSound();
              lastSoundTimeRef.current = now;
            }
            navigator.vibrate?.(30);
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${resolvedThreadId}` },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m));
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_typing', filter: `thread_id=eq.${resolvedThreadId}` },
        (payload) => {
          const typing = payload.new as { user_id: string; is_typing: boolean; updated_at: string };
          if (typing.user_id !== currentUserId) {
            setIsTyping(typing.is_typing && Date.now() - new Date(typing.updated_at).getTime() < 5000);
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_presence' },
        (payload) => {
          const presence = payload.new as { user_id: string; is_online: boolean };
          if (presence.user_id === effectivePartnerId) setPartnerOnline(presence.is_online);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'location_sessions', filter: `thread_id=eq.${resolvedThreadId}` },
        (payload) => {
          const loc = payload.new as { user_id: string; latitude: number; longitude: number; expires_at: string; last_updated: string; is_active: boolean };
          if (loc.user_id !== currentUserId && loc.is_active && new Date(loc.expires_at) > new Date()) {
            setPartnerLiveLocation({ lat: loc.latitude, lng: loc.longitude, expires_at: loc.expires_at, last_updated: loc.last_updated });
          } else if (loc.user_id !== currentUserId && !loc.is_active) {
            setPartnerLiveLocation(null);
          }
        }
      )
      .on('postgres_changes',{event:'*',schema:'public',table:'chat_message_reactions'},()=>void loadReactions(resolvedThreadId))
      .subscribe(status=>{if(status==='SUBSCRIBED'){void loadMessages(resolvedThreadId);void loadReactions(resolvedThreadId);}});
    const refresh=()=>{if(!document.hidden){void loadMessages(resolvedThreadId);void loadReactions(resolvedThreadId);}};
    const poll=window.setInterval(refresh,30000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);

    return () => {window.clearInterval(poll);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);void supabase.removeChannel(channel);};
  }, [resolvedThreadId, currentUserId, effectivePartnerId, loadMessages,loadReactions, scrollToBottom]);
  useEffect(()=>()=>{if(pendingImage)URL.revokeObjectURL(pendingImage.preview);},[pendingImage]);
  const closeViewer=useCallback(()=>setViewer(null),[]);
  useEffect(()=>{window.addEventListener('sharek-close-image',closeViewer);return()=>window.removeEventListener('sharek-close-image',closeViewer);},[closeViewer]);

  // Subscribe to request updates
  useEffect(() => {
    if (!requestId) return;
    const channel = supabase.channel(`chat-request-${requestId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meal_requests', filter: `id=eq.${requestId}` },
        (payload) => setRequest(payload.new as MealRequest)
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [requestId]);

  // Check if already rated
  useEffect(() => {
    if (!requestId || !currentUserId) return;
    let mounted = true;
    (async () => {
      const isReq = request?.requester_id === currentUserId;
      const reviewType = isReq ? 'beneficiary_to_donor' : 'donor_to_beneficiary';
      const { data } = await supabase.rpc('get_my_review_for_request', { p_request_id: requestId, p_review_type: reviewType });
      if (!mounted) return;
      if (data && Array.isArray(data) && data.length > 0) setHasRated(true);
    })();
    return () => { mounted = false; };
  }, [requestId, currentUserId, request?.requester_id]);

  // Typing indicator management
  const updateTyping = useCallback((typing: boolean) => {
    if (!resolvedThreadId||chatBlocked) return;
    void supabase.from('chat_typing').upsert({
      thread_id: resolvedThreadId,
      user_id: currentUserId,
      is_typing: typing,
      updated_at: new Date().toISOString(),
    });
  }, [resolvedThreadId, currentUserId,chatBlocked]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    updateTyping(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => updateTyping(false), 3000);
  };

  // Presence heartbeat
  useEffect(() => {
    const heartbeat = () => {
      void supabase.from('chat_presence').upsert({
        user_id: currentUserId,
        is_online: true,
        last_active_at: new Date().toISOString(),
      });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 30000);
    const onUnload = () => {
      void supabase.from('chat_presence').upsert({
        user_id: currentUserId,
        is_online: false,
        last_active_at: new Date().toISOString(),
      });
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', onUnload);
      onUnload();
    };
  }, [currentUserId]);

  // The message UUID survives retries and is also the backend idempotency key.
  const transmit = async (message:ChatMessage):Promise<boolean> => {
    if(chatBlocked||sendingRef.current||message.thread_id!==resolvedThreadId||activeThreadRef.current!==message.thread_id)return false;
    sendingRef.current=true;setSending(true);pendingIds.current.add(message.id);setChatIssue('');
    setMessages(previous=>mergeChatMessages(previous,[message],pendingIds.current));scrollToBottom();
    try{
      await sendChatMessage(message);
      if(activeThreadRef.current===message.thread_id){setFailedMessages(previous=>{const next=new Set(previous);next.delete(message.id);return next;});setMessages(previous=>mergeChatMessages(previous,[{...message,status:'sent'}],pendingIds.current));}
      pendingIds.current.delete(message.id);return true;
    }catch(error){if(activeThreadRef.current===message.thread_id){setFailedMessages(previous=>new Set(previous).add(message.id));setChatIssue(chatError(error,isAr));}return false;}
    finally{sendingRef.current=false;setSending(false);}
  };
  const sendMessage = async (body:string,messageType:'text'|'image'|'location'='text',extra?:Partial<ChatMessage>):Promise<boolean> => {
    if(chatBlocked||!resolvedThreadId||activeThreadRef.current!==resolvedThreadId||sendingRef.current||(uploadRef.current&&messageType!=='image')||(!body.trim()&&messageType==='text'))return false;
    const message:ChatMessage={id:extra?.id??crypto.randomUUID(),thread_id:resolvedThreadId,sender_id:currentUserId,body:body.trim()||(messageType==='image'?'📷':'📍'),created_at:new Date().toISOString(),read_at:null,message_type:messageType,status:'sending',media_url:extra?.media_url??null,reply_to_id:replyTo?.id??null,edited_at:null,deleted_by:[],deleted_for_everyone:false,location_lat:extra?.location_lat??null,location_lng:extra?.location_lng??null,location_live:extra?.location_live??false,location_expires_at:extra?.location_expires_at??null,system_event:null};
    setInput('');updateTyping(false);setReplyTo(null);return transmit(message);
  };
  const retrySend = (id:string) => {const message=messages.find(m=>m.id===id);if(message&&!chatBlocked&&!sendingRef.current)void transmit(message);};

  const handleImageSelect = (event:React.ChangeEvent<HTMLInputElement>) => {
    const file=event.target.files?.[0];event.target.value='';if(chatBlocked||!file||!resolvedThreadId||uploadRef.current||(pickerThreadRef.current&&pickerThreadRef.current!==resolvedThreadId))return;
    try{validateChatImage(file);setChatIssue('');setPendingImage({id:crypto.randomUUID(),file,preview:URL.createObjectURL(file)});}catch(error){setChatIssue(chatError(error,isAr));}
  };
  const chooseGallery=async()=>{if(chatBlocked)return;const target=resolvedThreadId;pickerThreadRef.current=target;if(!nativeGalleryAvailable()){galleryInputRef.current?.click();return;}setImageUploading(true);try{const file=await chooseNativeChatImage();if(file&&activeThreadRef.current===target&&!chatBlocked)setPendingImage({id:crypto.randomUUID(),file,preview:URL.createObjectURL(file)});}catch(error){if(activeThreadRef.current===target)setChatIssue(chatError(error,isAr));}finally{setImageUploading(false);}};
  const sendImage = async () => {
    if(chatBlocked||!pendingImage||!resolvedThreadId||uploadRef.current||sendingRef.current)return;
    uploadRef.current=true;setImageUploading(true);setChatIssue('');const image=pendingImage,tid=resolvedThreadId;
    try{const media=await uploadChatImage(image.file,currentUserId,tid,image.id);if(activeThreadRef.current!==tid)return;setPendingImage(null);await sendMessage('','image',{id:image.id,media_url:media});}
    catch(error){setChatIssue(chatError(error,isAr));}
    finally{uploadRef.current=false;setImageUploading(false);}
  };

  const shareCurrentLocation = async () => {
    if(chatBlocked||gettingLocation||sendingRef.current)return;setGettingLocation(true);setChatIssue('');
    try{const position=await currentChatLocation();if(activeThreadRef.current!==resolvedThreadId)return;setShowLocationPicker(false);await sendMessage('','location',{location_lat:position.coords.latitude,location_lng:position.coords.longitude,location_live:false});}
    catch(error){setChatIssue(chatError(error,isAr));}finally{setGettingLocation(false);}
  };

  const startLiveLocation = async () => {
    if (chatBlocked||!resolvedThreadId||gettingLocation||liveLocationSession) return;
    setGettingLocation(true);setChatIssue('');
    let position:GeolocationPosition;try{position=await currentChatLocation();}catch(error){setChatIssue(chatError(error,isAr));setGettingLocation(false);return;}
    if(activeThreadRef.current!==resolvedThreadId){setGettingLocation(false);return;}
    const latitude=position.coords.latitude,longitude=position.coords.longitude;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    setShowLocationPicker(false);
    const { data, error } = await supabase.from('location_sessions').insert({
      thread_id: resolvedThreadId,
      user_id: currentUserId,
      latitude,
      longitude,
      expires_at: expiresAt,
      is_active: true,
    }).select().single();
    if(activeThreadRef.current!==resolvedThreadId){if(data)void supabase.rpc('stop_location_sharing',{p_session_id:data.id});setGettingLocation(false);return;}
    setGettingLocation(false);
    if (error || !data){setChatIssue(chatError(error,isAr));return;}
    setLiveLocationSession(data.id);
    liveSessionRef.current=data.id;
    const sent=await sendMessage('', 'location', { location_lat: latitude, location_lng: longitude, location_live: true, location_expires_at: expiresAt });
    if(activeThreadRef.current!==resolvedThreadId){void supabase.rpc('stop_location_sharing',{p_session_id:data.id});return;}
    if(!sent){await supabase.rpc('stop_location_sharing',{p_session_id:data.id});setLiveLocationSession(null);liveSessionRef.current=null;return;}

    // Start watching position
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          void supabase.rpc('update_live_location', {
            p_session_id: data.id,
            p_latitude: pos.coords.latitude,
            p_longitude: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    // Countdown timer
    liveLocationIntervalRef.current = window.setInterval(() => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        stopLiveLocation();
      } else {
        setLiveLocationExpiry(Math.floor(remaining / 1000));
      }
    }, 1000);
  };

  const stopLiveLocation = useCallback(() => {
    if (liveSessionRef.current) {
      void supabase.rpc('stop_location_sharing', { p_session_id: liveSessionRef.current });
    }
    liveSessionRef.current=null;
    setLiveLocationSession(null);
    setLiveLocationExpiry(null);
    if (liveLocationIntervalRef.current) { window.clearInterval(liveLocationIntervalRef.current); liveLocationIntervalRef.current = null; }
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
  },[]);

  // Auto-stop live location on completion
  useEffect(() => {
    if (request?.status === 'COMPLETED' && liveLocationSession) stopLiveLocation();
  }, [request?.status, liveLocationSession,stopLiveLocation]);
  useEffect(()=>{if(chatBlocked&&liveLocationSession)stopLiveLocation();},[chatBlocked,liveLocationSession,stopLiveLocation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if(liveSessionRef.current)void supabase.rpc('stop_location_sharing',{p_session_id:liveSessionRef.current});liveSessionRef.current=null;
      if (liveLocationIntervalRef.current) window.clearInterval(liveLocationIntervalRef.current);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [resolvedThreadId]);

  // Message actions
  const handleMessageLongPress = (msg: ChatMessage, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setActionMessage(msg);
    suppressClickUntil.current=Date.now()+800;
    setActionPos({ x: Math.max(8,Math.min(rect.left,innerWidth-280)), y: Math.max(8,Math.min(rect.top,innerHeight-310)) });
  };

  const copyMessage = (msg: ChatMessage) => {
    if (msg.body) navigator.clipboard?.writeText(msg.body);
    setActionMessage(null);
  };

  const deleteForMe = async (msg: ChatMessage) => {
    void supabase.rpc('soft_delete_message_for_me', { p_message_id: msg.id });
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, deleted_by: [...m.deleted_by, currentUserId] } : m));
    setActionMessage(null);
  };

  const deleteForAll = async (msg: ChatMessage) => {
    const { data } = await supabase.rpc('delete_message_for_everyone', { p_message_id: msg.id });
    if (data) {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, deleted_for_everyone: true, body: '', media_url: null } : m));
    }
    setActionMessage(null);
  };

  const handleBlockDone = () => {
    setBlockNotice('');
    void refreshBlockState();
  };
  const handleUnblock=async()=>{
    if(unblocking||!effectivePartnerId||!blockState?.blocked_by_me)return;
    setUnblocking(true);setChatIssue('');
    const {error}=await supabase.rpc('unblock_user',{p_blocked_user_id:effectivePartnerId});
    setUnblocking(false);
    if(error){setChatIssue(isAr?'تعذر إلغاء الحظر. حاول مجددًا.':'Could not unblock this user. Please retry.');return;}
    notifyChatBlocksChanged();
    await refreshBlockState();
    setBlockNotice(isAr?'تم إلغاء الحظر. يمكنكما التواصل حسب صلاحيات الشات.':'User unblocked. Messaging is available under normal chat permissions.');
  };

  // Rating submission
  const submitRating = async () => {
    if (ratingValue < 1 || !requestId) return;
    setRatingSubmitting(true);
    const isRequester = request?.requester_id === currentUserId;
    const reviewType = isRequester ? 'beneficiary_to_donor' : 'donor_to_beneficiary';
    const { error } = await supabase.rpc('submit_review', {
      p_request_id: requestId,
      p_rating: ratingValue,
      p_comment: null,
      p_review_type: reviewType,
    });
    setRatingSubmitting(false);
    if (!error) {
      setHasRated(true);
      setShowRating(false);
    }
  };

  // Advance request status
  const advanceRequest = async (nextStatus: 'WAITING_FOR_PICKUP' | 'RECEIVED' | 'COMPLETED') => {
    if (!request) return;
    const { data, error } = await advanceMealRequest(request, nextStatus, currentUserId);
    if (!error && data) setRequest(data);
  };

  const isCompleted = request?.status === 'COMPLETED' || request?.status === 'RECEIVED';
  const isArchived = threadArchived;
  const canRate = isCompleted && !hasRated && request && (request.requester_id === currentUserId || request.donor_id === currentUserId);
  const isDonor = request?.donor_id === currentUserId;
  const isRequester = request?.requester_id === currentUserId;

  const displayName = partner?.display_name ?? partnerName ?? copy.unknown;
  const displayAvatar = partner?.avatar_url ?? partnerAvatar;
  const statusInfo = request?.status ? statusLabels[request.status] : null;
  const canDeleteForAll = (msg: ChatMessage) => msg.sender_id === currentUserId && Date.now() - new Date(msg.created_at).getTime() < 5 * 60 * 1000;

  const renderMessageStatus = (msg: ChatMessage) => {
    if (msg.sender_id !== currentUserId) return null;
    if (msg.status === 'read' || msg.read_at) return <CheckCheck size={13} className="msg-status-read" />;
    if (msg.status === 'delivered') return <CheckCheck size={13} className="msg-status-delivered" />;
    if (msg.status === 'sent') return <Check size={13} className="msg-status-sent" />;
    if (msg.status === 'sending') return <Clock size={12} className="msg-status-sending" />;
    return null;
  };

  const renderMessage = (msg: ChatMessage) => {
    if (msg.deleted_for_everyone) {
      return (
        <div key={msg.id} className={`chat-bubble ${msg.sender_id === currentUserId ? 'own' : 'other'} deleted`}>
          <p className="deleted-text"><Trash2 size={13} /> {isAr ? 'تم حذف هذه الرسالة' : 'This message was deleted'}</p>
          <span>{formatTime(msg.created_at, language)}</span>
        </div>
      );
    }
    if (msg.deleted_by.includes(currentUserId)) return null;
    if (msg.message_type === 'system') {
      return (
        <div key={msg.id} className="chat-system-message" ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}>
          <span>{msg.body}</span>
        </div>
      );
    }
    const isOwn = msg.sender_id === currentUserId;
    const isFailed = failedMessages.has(msg.id);
    const replyMsg = msg.reply_to_id ? messages.find((m) => m.id === msg.reply_to_id) : null;

    return (
      <div
        key={msg.id}
        data-message-id={msg.id}
        ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}
        className={`chat-bubble ${isOwn ? 'own' : 'other'} ${msg.message_type !== 'text' ? `type-${msg.message_type}` : ''}`}
        onContextMenu={(e) => handleMessageLongPress(msg, e)}
        onPointerDown={e=>{if(e.button!==0||(e.target as HTMLElement).closest('.msg-retry-btn,.chat-reactions'))return;const rect=e.currentTarget.getBoundingClientRect();longPress.current={x:e.clientX,y:e.clientY,timer:window.setTimeout(()=>{suppressClickUntil.current=Date.now()+800;setActionMessage(msg);setActionPos({x:Math.max(8,Math.min(rect.left,innerWidth-280)),y:Math.max(8,Math.min(rect.top,innerHeight-310))});},450)};}}
        onPointerMove={e=>{const current=longPress.current;if(current&&Math.hypot(e.clientX-current.x,e.clientY-current.y)>10){window.clearTimeout(current.timer);longPress.current=null;}}}
        onPointerUp={()=>{if(longPress.current)window.clearTimeout(longPress.current.timer);longPress.current=null;}}
        onPointerCancel={()=>{if(longPress.current)window.clearTimeout(longPress.current.timer);longPress.current=null;}}
        onClickCapture={e=>{if(Date.now()<suppressClickUntil.current){e.preventDefault();e.stopPropagation();}}}
        tabIndex={0} onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();setActionMessage(msg);setActionPos({x:Math.max(8,Math.min(rect.left,innerWidth-280)),y:Math.max(8,Math.min(rect.top,innerHeight-310))});}}}
      >
        {replyMsg && (
          <div className="chat-reply-preview" onClick={() => {
            const el = messageRefs.current.get(replyMsg.id);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('highlight'); setTimeout(() => el.classList.remove('highlight'), 1500); }
          }}>
            <span className="reply-bar" />
            <span className="reply-text">
              <strong>{replyMsg.sender_id === currentUserId ? copy.you : displayName}</strong>
              <small>{replyMsg.body || (replyMsg.message_type === 'image' ? copy.image : copy.location)}</small>
            </span>
          </div>
        )}
        {msg.message_type === 'image' && msg.media_url && (
          <ChatImage media={msg.media_url} language={language} onOpen={()=>setViewer(msg.media_url)}/>
        )}
        {msg.message_type === 'location' && msg.location_lat != null && msg.location_lng != null && (
          <div className="chat-location-msg">
            <MapView
              language={language}
              role="beneficiary"
              requests={[]}
              availableMeals={[]}
              donorMeals={[]}
              userLat={msg.location_lat}
              userLng={msg.location_lng}
              locationAccuracy={null}
              locationError={null}
              onRetryLocation={() => {}}
              onRequestSelect={() => {}}
              onAcceptRequest={async () => ({ ok: false, message: '' })}
              onReserveMeal={async () => ({ ok: false, message: '' })}
              primaryAction={null}
            />
            <span className="chat-location-label">
              <MapPin size={12} />
              {msg.location_live
                ? (isAr ? 'موقع مباشر' : 'Live location')
                : (isAr ? 'الموقع الحالي' : 'Current location')}
            </span>
            <button className="chat-location-open" onClick={()=>{const lat=msg.location_live&&partnerLiveLocation&&Date.parse(partnerLiveLocation.expires_at)>Date.now()?partnerLiveLocation.lat:msg.location_lat!;const lng=msg.location_live&&partnerLiveLocation&&Date.parse(partnerLiveLocation.expires_at)>Date.now()?partnerLiveLocation.lng:msg.location_lng!;if(!validCoordinates(lat,lng)){setChatIssue(isAr?'الموقع المرسل غير صالح.':'The shared location is invalid.');return;}setNavigationTarget({latitude:lat,longitude:lng});}}>{isAr?'الملاحة إلى الموقع':'Navigate to location'}</button>
          </div>
        )}
        {msg.marketplace_card&&<MarketChatCard card={msg.marketplace_card} language={language}/>}
        {msg.body && !msg.marketplace_card && msg.message_type !== 'image' && msg.message_type !== 'location' && (
          <p>{msg.body}</p>
        )}
        <div className="chat-bubble-footer">
          {isFailed && <button className="msg-retry-btn" onClick={() => retrySend(msg.id)}><AlertCircle size={13} /> {copy.failed}</button>}
          {!isFailed && <>
            {renderMessageStatus(msg)}
            <span>{formatTime(msg.created_at, language)}</span>
          </>}
        </div>
        {reactions.some(r=>r.message_id===msg.id)&&<div className="chat-reactions">{CHAT_REACTIONS.map(emoji=>{const group=reactions.filter(r=>r.message_id===msg.id&&r.emoji===emoji);return group.length?<button key={emoji} className={group.some(r=>r.user_id===currentUserId)?'own-reaction':''} onClick={()=>{setReactionDetail(msg.id);if(group.some(r=>r.user_id===currentUserId))void react(msg,null);}} aria-label={`${emoji} ${group.length}`}>{emoji} {group.length}</button>:null;})}<button onClick={()=>setReactionDetail(msg.id)} aria-label={isAr?'من تفاعل مع الرسالة':'Who reacted'}><Users size={13}/></button></div>}
      </div>
    );
  };

  if (loading) {
    return <div className="chat-window" dir={isAr ? 'rtl' : 'ltr'}><div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div></div>;
  }

  return (
    <div className="chat-window" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="chat-header-enhanced">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <div className="chat-header-info" onClick={() => {}}>
          <div className="chat-header-avatar-wrap">
            {displayAvatar ? <img src={displayAvatar} alt="" className="chat-header-avatar" /> : <span className="chat-header-avatar placeholder"><Heart size={18} fill="currentColor" /></span>}
            {partnerOnline && <span className="chat-header-online-dot" />}
          </div>
          <div className="chat-header-text">
            <span className="chat-header-name">
              {displayName}
              {partner?.is_verified && <BadgeCheck size={15} className="chat-header-verified" />}
            </span>
            <span className="chat-header-status">
              {isTyping ? <em className="typing-indicator">{copy.typing}</em>
                : partnerOnline ? copy.online
                : partner?.average_rating && partner.average_rating > 0
                  ? <><Star size={11} fill="currentColor" /> {partner.average_rating.toFixed(1)}</>
                  : copy.offline}
            </span>
          </div>
        </div>
        <button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"><MoreVertical size={20} /></button>
        {menuOpen && (
          <>
            <div className="chat-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="chat-menu">
              {statusInfo && (
                <div className="chat-menu-status">
                  <span className="status-dot" style={{ background: statusInfo.color }} />
                  {isAr ? statusInfo.ar : statusInfo.en}
                </div>
              )}
              {effectivePartnerId&&blockState?.blocked_by_me
                ? <button disabled={unblocking} onClick={() => { setMenuOpen(false); void handleUnblock(); }}><Shield size={16} /> {copy.unblockUser}</button>
                : effectivePartnerId&&<button onClick={() => { setMenuOpen(false); setShowBlockModal(true); }}><Shield size={16} /> {copy.blockUser}</button>}
              <button onClick={() => { setMenuOpen(false); setShowReportModal(true); }}><Flag size={16} /> {copy.reportUser}</button>
            </div>
          </>
        )}
      </header>

      {/* Meal/Request info bar */}
      {request && statusInfo && (
        <div className="chat-request-bar" style={{ borderColor: statusInfo.color + '33' }}>
          {mealInfo?.photo_url && <img src={mealInfo.photo_url} alt="" className="chat-request-bar-img" />}
          <div className="chat-request-bar-info">
            <span className="chat-request-bar-status" style={{ color: statusInfo.color }}>
              <span className="status-dot" style={{ background: statusInfo.color }} />
              {isAr ? statusInfo.ar : statusInfo.en}
            </span>
            {mealInfo?.name && <span className="chat-request-bar-meal"><Utensils size={12} /> {mealInfo.name}</span>}
          </div>
          {/* Pickup flow actions */}
          {!isArchived && (
            <div className="chat-request-bar-actions">
              {isDonor && request.status === 'ACCEPTED' && (
                <button className="chat-action-btn" onClick={() => void advanceRequest('WAITING_FOR_PICKUP')}>
                  <Utensils size={14} /> {copy.mealReady}
                </button>
              )}
              {isRequester && request.status === 'WAITING_FOR_PICKUP' && (
                <button className="chat-action-btn primary" onClick={() => void advanceRequest('RECEIVED')}>
                  <Check size={14} /> {copy.confirmReceived}
                </button>
              )}
              {request.status === 'RECEIVED' && (
                <button className="chat-action-btn primary" onClick={() => void advanceRequest('COMPLETED')}>
                  <Check size={14} /> {copy.complete}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rating prompt after completion */}
      {canRate && !showRating && (
        <div className="chat-rating-prompt">
          <Star size={16} fill="currentColor" />
          <span>{copy.rateExperience}</span>
          <button onClick={() => setShowRating(true)}>{isAr ? 'قيّم الآن' : 'Rate now'}</button>
        </div>
      )}
      {showRating && (
        <div className="chat-rating-bar">
          <span>{copy.rateExperience}</span>
          <div className="rating-stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                className={`star-btn ${(ratingHover || ratingValue) >= star ? 'active' : ''}`}
                onMouseEnter={() => setRatingHover(star)}
                onMouseLeave={() => setRatingHover(0)}
                onClick={() => setRatingValue(star)}
              >
                <Star size={22} fill={(ratingHover || ratingValue) >= star ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <button className="chat-action-btn primary" disabled={ratingValue < 1 || ratingSubmitting} onClick={() => void submitRating()}>
            {ratingSubmitting ? '...' : copy.submitRating}
          </button>
          <button className="chat-action-btn" onClick={() => setShowRating(false)}>{copy.cancel}</button>
        </div>
      )}
      {hasRated && (
        <div className="chat-rated-notice">
          <Check size={15} /> {copy.rated}
        </div>
      )}

      {/* Messages */}
      {chatIssue&&<div role="alert" className="chat-operation-error">{chatIssue}<button onClick={()=>setChatIssue('')} aria-label={copy.cancel}><X size={14}/></button></div>}
      {blockNotice&&<div role="status" className="chat-archived-notice">{blockNotice}</div>}
      {chatBlocked&&!blockLoading&&<div role="status" className="chat-archived-notice"><Shield size={14}/>{blockState?.blocked_by_me?(isAr?'لقد حظرت هذا المستخدم. ألغِ الحظر للتواصل معه.':'You blocked this user. Unblock them to message again.'):blockState?.blocked_by_other?(isAr?'المراسلة غير متاحة بين هذين الحسابين.':'Messaging is unavailable between these accounts.'):(isAr?'تعذر التحقق من حالة الحظر. أعد المحاولة عند عودة الاتصال.':'Could not check the block status. Retry when online.')}</div>}
      <div className="chat-messages" ref={scrollRef} onScroll={()=>{if(longPress.current)window.clearTimeout(longPress.current.timer);longPress.current=null;}}>
        {hasOlder&&<button className="text-button" disabled={olderLoading} onClick={()=>void loadOlder()}>{isAr?'عرض رسائل أقدم':'Load older messages'}</button>}
        {messages.length === 0 && <div className="chat-empty">{isAr ? 'ابدأ المحادثة' : 'Start the conversation'}</div>}
        {messages.map(renderMessage)}
        {isArchived && <div className="chat-archived-notice"><AlertCircle size={14} /> {copy.archived}</div>}
      </div>

      {/* Quick messages bar */}
      {showQuickMessages && !isArchived && !chatBlocked && (
        <div className="quick-messages-bar">
          {quickMessages.map((qm, i) => (
            <button key={i} className="quick-msg-chip" onClick={() => { setShowQuickMessages(false); void sendMessage(isAr ? qm.ar : qm.en); }}>
              {isAr ? qm.ar : qm.en}
            </button>
          ))}
        </div>
      )}

      {/* Live location indicator */}
      {liveLocationSession && (
        <div className="live-location-bar">
          <Navigation size={15} className="live-pulse" />
          <span>{copy.liveLocationActive}</span>
          {liveLocationExpiry != null && <span className="live-timer">{copy.remaining}: {Math.floor(liveLocationExpiry / 60)}:{String(liveLocationExpiry % 60).padStart(2, '0')}</span>}
          <button onClick={stopLiveLocation}><X size={14} /> {copy.stopSharing}</button>
        </div>
      )}

      {/* Partner live location display */}
      {partnerLiveLocation && (
        <div className="partner-live-location-bar">
          <Navigation size={15} className="live-pulse" />
          <span>{isAr ? 'موقع الطرف الآخر مباشر' : "Partner's live location"}</span>
          {userLat != null && userLng != null && (
            <small>{formatDistance(haversineDistance(userLat, userLng, partnerLiveLocation.lat, partnerLiveLocation.lng), language)}</small>
          )}
        </div>
      )}

      {/* Image preview */}
      {pendingImage && (
        <div className="image-preview-bar">
          <img src={pendingImage.preview} alt={copy.image} />
          <div className="image-preview-actions">
            <button disabled={imageUploading} onClick={() => setPendingImage(null)}><X size={16} /> {copy.cancel}</button>
            <button className="primary" disabled={imageUploading} onClick={() => void sendImage()}><Send size={16} /> {isAr ? 'إرسال' : 'Send'}</button>
          </div>
        </div>
      )}

      {/* Location picker */}
      {navigationTarget&&<ChatLocationNavigation language={language} latitude={navigationTarget.latitude} longitude={navigationTarget.longitude} onClose={()=>setNavigationTarget(null)}/>}
      {showLocationPicker && (
        <div className="location-picker-overlay" onClick={() => setShowLocationPicker(false)}>
          <div className="location-picker" onClick={(e) => e.stopPropagation()}>
            <h3>{copy.shareLocation}</h3>
            {gettingLocation&&<p role="status">{isAr?'جارٍ تحديد موقعك الحقيقي…':'Getting a fresh GPS fix…'}</p>}
            <button className="location-picker-option" disabled={gettingLocation} onClick={()=>void shareCurrentLocation()}>
              <MapPin size={20} />
              <span><strong>{copy.currentLocation}</strong><small>{isAr ? 'إرسال موقعك الحالي مرة واحدة' : 'Send your current location once'}</small></span>
            </button>
            <button className="location-picker-option" disabled={gettingLocation||!!liveLocationSession} onClick={()=>void startLiveLocation()}>
              <Navigation size={20} />
              <span><strong>{copy.liveLocation}</strong><small>{isAr ? 'مشاركة موقعك المباشر لمدة 30 دقيقة' : 'Share your live location for 30 minutes'}</small></span>
            </button>
            <button className="location-picker-cancel" onClick={() => setShowLocationPicker(false)}>{copy.cancel}</button>
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="reply-bar-compose">
          <span className="reply-bar" />
          <div className="reply-preview-compose">
            <strong>{replyTo.sender_id === currentUserId ? copy.you : displayName}</strong>
            <small>{replyTo.body || (replyTo.message_type === 'image' ? copy.image : copy.location)}</small>
          </div>
          <button onClick={() => setReplyTo(null)}><X size={16} /></button>
        </div>
      )}

      {/* Input bar */}
      {!isArchived && !chatBlocked && (
        <div className="chat-input-bar-enhanced">
          <button className="chat-input-icon-btn" onClick={() => setShowQuickMessages(!showQuickMessages)} aria-label={copy.quickMessages}>
            <ChevronDown size={20} className={showQuickMessages ? 'rotated' : ''} />
          </button>
          <button className="chat-input-icon-btn" onClick={() => {pickerThreadRef.current=resolvedThreadId;fileInputRef.current?.click();}} disabled={imageUploading} aria-label={copy.image}>
            <Camera size={20} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} style={{ display: 'none' }} />
          <button className="chat-input-icon-btn" onClick={()=>void chooseGallery()} disabled={imageUploading} aria-label={isAr?'اختيار صورة من المعرض':'Choose photo from gallery'}><ImagePlus size={20}/></button>
          <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} style={{display:'none'}}/>
          <button className="chat-input-icon-btn" disabled={imageUploading||sending} onClick={() => setShowLocationPicker(true)} aria-label={copy.shareLocation}>
            <MapPin size={20} />
          </button>
          <input
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
            onBlur={() => updateTyping(false)}
            placeholder={copy.placeholder}
            disabled={sending||imageUploading}
          />
          <button className="chat-send-btn" onClick={() => void sendMessage(input)} disabled={!input.trim() || sending||imageUploading} aria-label={isAr ? 'إرسال' : 'Send'}>
            <Send size={18} />
          </button>
        </div>
      )}

      {/* Action menu (long-press) */}
      {actionMessage && actionPos && (
        <>
          <div className="chat-action-backdrop" onClick={() => setActionMessage(null)} />
          <div className="chat-action-menu" style={{ top: actionPos.y, left: actionPos.x }}>
            {actionMessage.status!=='sending'&&<div className="chat-quick-reactions">{CHAT_REACTIONS.map(emoji=><button key={emoji} aria-label={emoji} onClick={()=>void react(actionMessage,reactions.some(r=>r.message_id===actionMessage.id&&r.user_id===currentUserId&&r.emoji===emoji)?null:emoji)}>{emoji}</button>)}</div>}
            <button onClick={() => { setReplyTo(actionMessage); setActionMessage(null); }}><Reply size={16} /> {copy.reply}</button>
            {actionMessage.body && <button onClick={() => copyMessage(actionMessage)}><Copy size={16} /> {copy.copy}</button>}
            <button onClick={() => deleteForMe(actionMessage)}><Trash2 size={16} /> {copy.deleteForMe}</button>
            {canDeleteForAll(actionMessage) && <button onClick={() => deleteForAll(actionMessage)}><Trash2 size={16} /> {copy.deleteForAll}</button>}
            {actionMessage.sender_id !== currentUserId && <button onClick={() => { setShowReportModal(true); setActionMessage(null); }}><Flag size={16} /> {copy.report}</button>}
          </div>
        </>
      )}
      {reactionDetail&&<div className="location-picker-overlay" onClick={()=>setReactionDetail(null)}><div className="location-picker" role="dialog" aria-label={isAr?'التفاعلات':'Reactions'} onClick={e=>e.stopPropagation()}><h3>{isAr?'التفاعلات':'Reactions'}</h3>{reactions.filter(r=>r.message_id===reactionDetail).map(r=><div key={r.user_id} className="chat-reaction-person"><span>{r.emoji} {r.user_id===currentUserId?copy.you:r.display_name}</span>{r.user_id===currentUserId&&<button className="text-button" onClick={()=>{const msg=messages.find(m=>m.id===reactionDetail);if(msg)void react(msg,null);}}>{isAr?'إزالة':'Remove'}</button>}</div>)}<button className="text-button" onClick={()=>setReactionDetail(null)}>{isAr?'إغلاق':'Close'}</button></div></div>}
      {viewer&&<ChatImageViewer media={viewer} language={language} onClose={closeViewer}/>}

      {/* Block modal */}
      {showBlockModal && effectivePartnerId && (
        <BlockUserModal
          language={language}
          blockedUserId={effectivePartnerId}
          blockedUserName={displayName}
          onClose={() => setShowBlockModal(false)}
          onBlocked={handleBlockDone}
        />
      )}

      {/* Report sheet */}
      {showReportModal && effectivePartnerId && (
        <ReportUserSheet
          language={language}
          reporterId={currentUserId}
          reportedUserId={effectivePartnerId}
          reportedUserName={displayName}
          threadId={resolvedThreadId}
          requestId={request?.id ?? requestId}
          mealId={request?.pickup_meal_id ?? null}
          onClose={() => setShowReportModal(false)}
          onBlockOption={() => setShowBlockModal(true)}
        />
      )}
    </div>
  );
}

