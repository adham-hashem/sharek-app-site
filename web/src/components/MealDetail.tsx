import { mealDeadline, sharingLabel, collectionLabel } from '@/lib/meal-sharing';
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Check as CheckIcon, Clock, Flag, Heart, MapPin, MessageCircle, MoreVertical, Star, Trash2, Utensils, X } from 'lucide-react';
import { supabase, formatDistance, type CommunityMeal, type Language, type Meal, type MealPhoto } from '@/lib/supabase';
import { PickupMap } from './PickupMap';
import { validCoordinates } from '@/lib/geo';
import { distanceKm } from '@/lib/geo';
import { resolveLocationAreaInfo, type AreaInfo } from '@/lib/location-area';
import { ReportUserSheet } from './ReportUserSheet';
import {MealShareButton} from './MealShareButton';
import type { ChatOpenResult } from '@/lib/community-chat';

const mealAreaCache = new Map<string, AreaInfo>();
function cachedMealArea(key:string):AreaInfo|undefined{
 const current=mealAreaCache.get(key);if(current)return current;
 try{
  const stored=JSON.parse(localStorage.getItem(`sharek-meal-area:${key}`)??'null') as {info:AreaInfo;savedAt:number}|null;
  if(stored&&Date.now()-stored.savedAt<30*24*60*60*1000&&typeof stored.info?.name==='string'){
   mealAreaCache.set(key,stored.info);return stored.info;
  }
 }catch{/* A storage failure must not hide meal details. */}
 return undefined;
}

type Props = {
  language: Language;
  mealId: string;
  isOwn?: boolean;
  currentUserId?: string;
  userLat?: number | null;
  userLng?: number | null;
  onBack: () => void;
  onReserve?: (meal: CommunityMeal, quantity?: number) => Promise<{ ok: boolean; message: string }>;
  onMessageDonor?: (mealId: string, donorId: string) => Promise<ChatOpenResult>;
};

export function MealDetail({ language, mealId, isOwn, currentUserId, userLat = null, userLng = null, onBack, onReserve, onMessageDonor }: Props) {
  const isAr = language === 'ar';
  const [meal, setMeal] = useState<CommunityMeal | null>(null);
  const [photos, setPhotos] = useState<MealPhoto[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState(false);
  const [bookingQuantity, setBookingQuantity] = useState(1);
  const [reserving, setReserving] = useState(false);
  const reservingRef = useRef(false);
  const [messaging, setMessaging] = useState(false);
  const messagingRef = useRef(false);
  const fetchVersion = useRef(0);
  const [confirmingReserve, setConfirmingReserve] = useState(false);
  const [reserveMsg, setReserveMsg] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [area, setArea] = useState<{key:string;info:AreaInfo}|null>(null);
  const mealLocationKey = validCoordinates(meal?.latitude,meal?.longitude)
    ? `${language}:${meal!.latitude!.toFixed(4)}:${meal!.longitude!.toFixed(4)}` : '';
  const areaInfo = area?.key === mealLocationKey ? area.info : cachedMealArea(mealLocationKey);
  const distance = validCoordinates(userLat,userLng) && validCoordinates(meal?.latitude,meal?.longitude)
    ? distanceKm(userLat!,userLng!,meal!.latitude!,meal!.longitude!) : null;
  const distanceLabel = distance != null && Number.isFinite(distance)
    ? formatDistance(distance,language)
    : !validCoordinates(meal?.latitude,meal?.longitude)
      ? (isAr ? 'موقع الوجبة غير متاح' : 'Meal location unavailable')
      : (isAr ? 'فعّل الموقع لعرض المسافة' : 'Enable location to see distance');

  useEffect(()=>{
    if(!mealLocationKey || areaInfo?.name)return;
    let active=true;
    void resolveLocationAreaInfo(meal!.latitude!,meal!.longitude!,language)
      .then(info=>{if(!active)return;if(info.name){mealAreaCache.set(mealLocationKey,info);try{localStorage.setItem(`sharek-meal-area:${mealLocationKey}`,JSON.stringify({info,savedAt:Date.now()}));}catch{/* optional cache */}}setArea({key:mealLocationKey,info});})
      .catch(()=>{if(active)setArea({key:mealLocationKey,info:{name:null}});});
    return()=>{active=false;};
  },[mealLocationKey,language,areaInfo?.name]);

  const copy = {
    back: isAr ? 'رجوع' : 'Back',
    from: isAr ? 'من' : 'From',
    available: isAr ? 'المتاح' : 'Available',
    distance: isAr ? 'المسافة' : 'Distance',
    availableUntil: isAr ? 'متاح حتى' : 'Available until',
    description: isAr ? 'الوصف' : 'Description',
    reserve: meal?.sharing_mode === 'direct' ? (isAr ? 'احجز الوجبة للاستلام' : 'Reserve for pickup') : (isAr ? 'اطلب الوجبة' : 'Request meal'),
    confirmTitle: meal?.sharing_mode === 'direct' ? (isAr ? 'تأكيد الحجز بدون انتظار موافقة؟' : 'Confirm reservation without waiting for approval?') : (isAr ? 'هل تريد طلب هذه الوجبة؟' : 'Would you like to request this meal?'),
    confirm: isAr ? 'تأكيد الطلب' : 'Confirm request',
    dismiss: isAr ? 'إلغاء' : 'Cancel',
    remaining: isAr ? 'الوقت المتبقي' : 'Time remaining',
    messageDonor: isAr ? 'راسل المقدم' : 'Message donor',
    yourMeal: isAr ? 'وجبتك المنشورة' : 'Your published meal',
    cancel: isAr ? 'إلغاء المشاركة' : 'Cancel meal',
    meals: isAr ? 'وجبات' : 'meals',
    unknown: isAr ? 'مساعد' : 'Helper',
    verified: isAr ? 'موثق' : 'Verified',
    cancelConfirm: isAr ? 'هل تريد إلغاء هذه المشاركة؟' : 'Cancel this meal share?',
    cancelDone: isAr ? 'تم إلغاء المشاركة' : 'Meal cancelled',
    cancelError: isAr ? 'تعذر الإلغاء' : 'Could not cancel',
    photo: isAr ? 'صورة' : 'photo',
    of: isAr ? 'من' : 'of',
    noDescription: isAr ? 'لا يوجد وصف' : 'No description',
  };

  const fetchData = useCallback(async () => {
    const version=++fetchVersion.current;
    const [photosRes,detailRes]=await Promise.all([
      supabase.from('meal_photos').select('*').eq('meal_id', mealId).order('position', { ascending: true }),
      isOwn ? supabase.from('meals').select('*').eq('id', mealId).maybeSingle()
        : supabase.rpc('get_community_meal', { p_meal_id: mealId }),
    ]);
    if(version!==fetchVersion.current)return;
    if (!photosRes.error) setPhotos(photosRes.data as MealPhoto[]);
    if (isOwn) {
      const ownMeal=detailRes.data as Meal|null,ownMealError=detailRes.error;
      const { data: donor } = ownMeal?.donor_id
        ? await supabase.from('profiles').select('display_name,avatar_url,is_verified').eq('id', ownMeal.donor_id).maybeSingle()
        : { data: null };
      if(version!==fetchVersion.current)return;
      if (ownMealError) setLoadError(true);
      else if (ownMeal) {
        setLoadError(false);
        const { data: currentRows } = await supabase.rpc('get_community_meal', { p_meal_id: mealId });
        const current = Array.isArray(currentRows) ? currentRows[0] : currentRows;
        setMeal({
          ...(ownMeal as CommunityMeal),
          quantity: Math.max(0, ownMeal.quantity - (ownMeal.reserved_quantity ?? 0)),
          collection_state: current?.collection_state ?? (ownMeal.status === 'COMPLETED' ? 'received' : Date.parse(mealDeadline(ownMeal)) <= Date.now() ? 'expired' : ownMeal.status === 'RESERVED' || ownMeal.quantity <= (ownMeal.reserved_quantity ?? 0) ? 'fully_reserved' : ownMeal.status === 'ACTIVE' ? 'available' : 'unavailable'),
          donor_name: donor?.display_name ?? null,
          donor_avatar: donor?.avatar_url ?? null,
          donor_verified: Boolean(donor?.is_verified),
          donor_rating: 0,
          donor_badges: [],
          distance_km: null,
          is_own: true,
          photo_count: photosRes.data?.length ?? 0,
        });
      }
    } else {
      if (detailRes.error) setLoadError(true);
      else {setLoadError(false);setMeal((Array.isArray(detailRes.data) ? detailRes.data[0] : detailRes.data) as CommunityMeal ?? null);}
    }
    setLoading(false);
  }, [isOwn, mealId]);

  useEffect(() => {
    void fetchData();
    const channel = supabase.channel(`meal-detail-${mealId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'meals', filter: `id=eq.${mealId}` }, () => { void fetchData(); }).subscribe();
    return () => { fetchVersion.current++; void supabase.removeChannel(channel); };
  }, [fetchData, mealId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleReserve = async () => {
    if (!meal || !onReserve || reservingRef.current) return;
    reservingRef.current = true;
    setConfirmingReserve(false);
    setReserving(true);
    setReserveMsg('');
    try {
      const result = await onReserve(meal, Math.min(bookingQuantity, meal.quantity, 5));
      setReserveMsg(result.ok ? (isAr ? 'تم الحجز' : 'Reserved') : result.message);
      if (result.ok) onBack(); // The existing request flow must be visible above the meal page.
    } catch (error) {
      console.error('meal reservation failed', error);
      setReserveMsg(isAr ? 'تعذر إرسال الطلب. تحقق من الاتصال وحاول مجددًا.' : 'Could not send the request. Check your connection and try again.');
    } finally {
      reservingRef.current = false;
      setReserving(false);
    }
  };

  const handleMessage = async () => {
    if (!meal || !onMessageDonor || messagingRef.current) return;
    messagingRef.current = true; setMessaging(true); setReserveMsg('');
    const failure = isAr ? 'تعذر فتح المحادثة. تحقق من الاتصال وحاول مرة أخرى.' : 'Could not open the conversation. Check your connection and retry.';
    try {
      const result = await onMessageDonor(meal.id, meal.donor_id);
      if (!result.ok) setReserveMsg(result.message || failure);
    } catch { setReserveMsg(failure); }
    finally { messagingRef.current = false; setMessaging(false); }
  };

  const handleCancel = async () => {
    if (!confirm(copy.cancelConfirm)) return;
    setCancelling(true);
    const { error } = await supabase.from('meals').update({ status: 'CANCELLED' }).eq('id', mealId).eq('donor_id', meal?.donor_id ?? '');
    setCancelling(false);
    if (error) { setReserveMsg(copy.cancelError); return; }
    setReserveMsg(copy.cancelDone);
    onBack();
  };

  const timeLeft = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return isAr ? 'منتهي' : 'Expired';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const expiryTime = new Date(meal ? mealDeadline(meal) : Date.now()).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  const availabilityTime = new Date(meal?.availability_start ?? Date.now()).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  const statusLabel = meal?.collection_state ? collectionLabel(meal.collection_state, language) : meal?.status === 'ACTIVE' ? (isAr ? 'متاحة' : 'Available') : meal?.status === 'RESERVED' ? (isAr ? 'محجوزة' : 'Reserved') : (isAr ? 'غير متاحة' : 'Unavailable');
  if (loading) return <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>;
  if (!meal) return <div className="community-empty"><h3>{loadError?(isAr?'تعذر تحميل تفاصيل الوجبة':'Could not load meal details'):(isAr ? 'الوجبة لم تعد متاحة' : 'Meal is no longer available')}</h3>{loadError&&<button className="secondary-button" onClick={()=>void fetchData()}>{isAr?'إعادة المحاولة':'Retry'}</button>}<button className="text-button" onClick={onBack}>{copy.back}</button></div>;

  const displayPhotos = photos.length > 0 ? photos.map((p) => p.url) : (meal.photo_url ? [meal.photo_url] : []);
  const movePhoto = (direction: 1 | -1): void => {
    setPhotoIndex((index) => displayPhotos.length === 0 ? 0 : (index + direction + displayPhotos.length) % displayPhotos.length);
  };
  const handleGalleryTouchStart = (event: TouchEvent<HTMLDivElement>): void => setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  const handleGalleryTouchEnd = (event: TouchEvent<HTMLDivElement>): void => {
    if (touchStartX == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    if (Math.abs(delta) > 40 && displayPhotos.length > 1) movePhoto(delta < 0 ? 1 : -1);
    setTouchStartX(null);
  };

  return (
    <div className="meal-detail-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="meal-detail-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        {!isOwn && !meal?.is_own && (
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"><MoreVertical size={20} /></button>
            {menuOpen && (
              <>
                <div className="chat-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="chat-menu" style={{ [isAr ? 'left' : 'right']: 0 } as React.CSSProperties}>
                  <button onClick={() => { setMenuOpen(false); setShowReport(true); }}><Flag size={16} /> {isAr ? 'الإبلاغ عن المستخدم' : 'Report user'}</button>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      <div className="meal-detail-gallery" onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd}>
        {displayPhotos.length > 0 ? (
          <>
            <img src={displayPhotos[photoIndex]} alt={meal.name} className="meal-detail-cover" />
            {displayPhotos.length > 1 && (
              <>
                <button className="gallery-nav prev" onClick={() => movePhoto(-1)}><ArrowLeft size={22} /></button>
                <button className="gallery-nav next" onClick={() => movePhoto(1)}><ArrowRight size={22} /></button>
                <span className="gallery-counter">{photoIndex + 1} {copy.of} {displayPhotos.length}</span>
              </>
            )}
          </>
        ) : (
          <div className="meal-detail-cover-placeholder"><Utensils size={40} /></div>
        )}
      </div>

      <div className="meal-detail-body">
        <h2>{meal.name}</h2>
        <div className="meal-detail-provider">
          {meal.donor_avatar ? <img src={meal.donor_avatar} alt="" /> : <span className="community-provider-avatar placeholder"><Heart size={18} fill="currentColor" /></span>}
          <span>{meal.donor_name || copy.unknown}</span>
          {meal.donor_verified && <BadgeCheck size={16} className="community-verified" />}
          <span className="community-rating"><Star size={13} fill="currentColor" />{meal.donor_rating > 0 ? meal.donor_rating.toFixed(1) : (isAr ? 'جديد' : 'New')}</span>
        </div>

        <div className="meal-detail-stats">
          <div><strong>{meal.quantity}</strong><span>{copy.meals}</span></div>
          <div><strong>{distanceLabel}</strong><span>{copy.distance}</span></div>
          <div className="meal-detail-countdown"><strong>{timeLeft(mealDeadline(meal))}</strong><span>{isAr ? 'متبقي' : 'Remaining'}</span></div>
        </div>

        <div className="meal-detail-expiry"><Clock size={15} /><span>{isAr ? 'يختفي الساعة' : 'Disappears at'} {expiryTime}</span></div>
        <div className="meal-detail-info-grid">
          <span><b>{isAr ? 'النوع' : 'Category'}</b><strong>{meal.category}</strong></span>
          <span><b>{isAr ? 'متاح من' : 'Available from'}</b><strong>{availabilityTime}</strong></span>
          <span><b>{isAr ? 'الحالة' : 'Status'}</b><strong>{statusLabel}</strong></span>
          <span><b>{isAr ? 'الموقع' : 'Location'}</b><strong><MapPin size={13} />{areaInfo?.name || (validCoordinates(meal.latitude,meal.longitude) ? (areaInfo ? (isAr ? 'اسم المنطقة غير متاح' : 'Area name unavailable') : (isAr ? 'جارٍ تحديد منطقة الوجبة' : 'Finding meal area')) : (isAr ? 'موقع الوجبة غير متاح' : 'Meal location unavailable'))}</strong>{areaInfo?.address&&<small>{areaInfo.address}</small>}</span>
          <span><b>{copy.distance}</b><strong>{distanceLabel}</strong></span>
        </div>
        <span className="meal-sharing-badge">{sharingLabel(meal.sharing_mode, language)}</span>
        {meal.pickup_instructions && <div className="meal-detail-desc"><h4>{isAr ? 'تعليمات الاستلام' : 'Pickup instructions'}</h4><p>{meal.pickup_instructions}</p></div>}
        {validCoordinates(meal.latitude, meal.longitude) && <PickupMap key={`${meal.latitude}:${meal.longitude}`} language={language} point={{ latitude: meal.latitude!, longitude: meal.longitude!, source: 'pin', accuracy: null, timestamp: 0 }} />}
        {meal.description && <div className="meal-detail-desc"><h4>{copy.description}</h4><p>{meal.description}</p></div>}

        {reserveMsg && <div className="feedback error"><X size={16} />{reserveMsg}</div>}

        {isOwn ? (
          <>
            <div className="meal-detail-own-badge">{copy.yourMeal}</div>
            <MealShareButton mealId={meal.id} language={language}/>
            <button className="primary-button danger" onClick={() => void handleCancel()} disabled={cancelling || (meal.status !== 'ACTIVE' && !(meal.sharing_mode === 'direct' && meal.status === 'RESERVED'))}>
              {cancelling ? '...' : copy.cancel}<Trash2 size={17} />
            </button>
          </>
        ) : (
          <div className="meal-detail-actions">
            {onMessageDonor && !meal.is_own && (
              <button className="secondary-button" disabled={messaging} onClick={() => void handleMessage()}>
                <MessageCircle size={18} /> {copy.messageDonor}
              </button>
            )}
            {onReserve && !meal.is_own && meal.quantity > 0 && meal.status === 'ACTIVE' && new Date(mealDeadline(meal)).getTime() > now && <button className="primary-button" onClick={() => setConfirmingReserve(true)} disabled={reserving}>
              {reserving ? '...' : copy.reserve}<Heart size={18} fill="currentColor" />
            </button>}
          </div>
        )}
      </div>

      {confirmingReserve && meal && (
        <div className="modal-overlay" onClick={() => setConfirmingReserve(false)}>
          <div className="modal-card meal-request-confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="meal-request-confirm-cover">
              {displayPhotos[0] ? <img src={displayPhotos[0]} alt={meal.name} /> : <Utensils size={28} />}
            </div>
            <h3>{copy.confirmTitle}</h3>
            <strong className="meal-request-confirm-name">{meal.name}</strong>
            <div className="meal-request-confirm-meta">
              <span>{copy.available}<b>{meal.quantity} {copy.meals}</b></span>
              <span>{copy.remaining}<b>{timeLeft(mealDeadline(meal))}</b></span>
              <span>{copy.from}<b>{meal.donor_name || copy.unknown}</b></span>
            </div>
            {meal.sharing_mode === 'direct' && <label className="share-field-label">{isAr ? 'الكمية المطلوبة' : 'Quantity to reserve'}<select aria-label={isAr ? 'الكمية المطلوبة' : 'Quantity to reserve'} value={bookingQuantity} onChange={e => setBookingQuantity(Number(e.target.value))}>{Array.from({length: Math.min(5, meal.quantity)}, (_,i) => i+1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
            <div className="meal-request-confirm-actions">
              <button className="text-button" onClick={() => setConfirmingReserve(false)}>{copy.dismiss}</button>
              <button className="primary-button" onClick={() => void handleReserve()}>{copy.confirm}<CheckIcon /></button>
            </div>
          </div>
        </div>
      )}

      {showReport && meal && (
        <ReportUserSheet
          language={language}
          reporterId={currentUserId ?? meal.donor_id}
          reportedUserId={meal.donor_id}
          reportedUserName={meal.donor_name}
          mealId={meal.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
