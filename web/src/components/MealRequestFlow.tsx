import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock3, Heart, MapPin, Search, Volume2, VolumeX, X } from 'lucide-react';
import { supabase, formatDistance, type Language, type MealRequest, type Profile } from '@/lib/supabase';
import { locationMessage, validCoordinates, type LocationIssue } from '@/lib/geo';
import { resolveLocationAreaInfo } from '@/lib/location-area';
import { RatingModal } from '@/components/RatingModal';
import { RequestPhoneShare } from '@/components/RequestPhoneShare';
import { SmartPickupCard } from '@/components/SmartPickupCard';
import { advanceMealRequest,MEAL_REQUEST_SAVED,isReceived } from '@/lib/meal-operations';
import {requestStatus} from '@/lib/meal-management';

type Props = {
  language: Language;
  profileId: string;
  userLat: number | null;
  userLng: number | null;
  areaName: string | null;
  locationIssue: LocationIssue | null;
  onRetryLocation: () => void;
  onClose: () => void;
  onOpenChat?: (partnerId: string) => void;
  existingRequests?: MealRequest[];
  focusRequestId?: string | null;
  onReserveMeal: (meal: AvailableMeal, quantity: number, requestedTime?: string) => Promise<{ ok: boolean; message: string; request?: MealRequest }>;
};

type FlowMode = 'form' | 'available' | 'searching' | 'pending' | 'accepted' | 'rejected' | 'not_found' | 'completed' | 'cancelled';
type RequestTime = 'now' | 'later';
type AvailableMeal = {
  id: string; donor_id: string; name: string; category: string; description: string | null;
  quantity: number; photo_url: string | null; latitude: number; longitude: number;
  expires_at: string; availability_start: string; status: string;
  sharing_mode: 'request' | 'direct'; pickup_until: string | null;
  donor_name: string | null; distance_km: number;
};

const toneFrequencies: Record<'tick' | 'accepted' | 'notFound', number[]> = {
  tick: [880],
  accepted: [523, 659, 784],
  notFound: [220, 165],
};

function playFeedbackTone(kind: 'tick' | 'accepted' | 'notFound', muted: boolean): void {
  if (muted || typeof window === 'undefined' || !window.AudioContext) return;
  const context = new window.AudioContext();
  const frequencies = toneFrequencies[kind];
  frequencies.forEach((frequency: number, index: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + index * (kind === 'tick' ? 0 : 0.13);
    oscillator.type = kind === 'tick' ? 'square' : 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(kind === 'tick' ? 0.035 : 0.07, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (kind === 'tick' ? 0.07 : 0.18));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + (kind === 'tick' ? 0.08 : 0.2));
  });
  window.setTimeout(() => void context.close(), kind === 'tick' ? 180 : 700);
}

function getRequest(data: MealRequest | MealRequest[] | null): MealRequest | null {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export function MealRequestFlow({ language, profileId, userLat, userLng, areaName, locationIssue, onRetryLocation, onClose, onOpenChat, onReserveMeal, existingRequests=[], focusRequestId=null }: Props) {
  const isAr = language === 'ar';
  const [mode, setMode] = useState<FlowMode>('form');
  const [quantity, setQuantity] = useState(1);
  const [requestTime, setRequestTime] = useState<RequestTime>('now');
  const [laterTime, setLaterTime] = useState('');
  const [request, setRequest] = useState<MealRequest | null>(null);
  const [availableMeals, setAvailableMeals] = useState<AvailableMeal[]>([]);
  const [mealNames,setMealNames]=useState<Record<string,string>>({});
  const [donor, setDonor] = useState<Pick<Profile, 'display_name' | 'avatar_url' | 'is_verified'> | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [muted, setMuted] = useState(() => window.localStorage.getItem('sharek-search-muted') === 'true');
  const [error, setError] = useState('');
  const [showRating, setShowRating] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const handledSoundRef = useRef<Set<string>>(new Set());
  const lastTickRef = useRef<number | null>(null);
  const expireCalledRef = useRef<string | null>(null);
  const ignoredSearchIdsRef = useRef<Set<string>>(new Set());

  const copy = {
    title: isAr ? 'أحتاج وجبة' : 'I need a meal',
    meals: isAr ? 'عدد الوجبات' : 'Number of meals',
    when: isAr ? 'متى تحتاجها؟' : 'When do you need it?',
    now: isAr ? 'الآن' : 'Now',
    later: isAr ? 'لاحقًا' : 'Later',
    location: isAr ? 'سيتم استخدام موقع تقريبي لحماية خصوصيتك' : 'An approximate location protects your privacy',
    start: isAr ? 'ابدأ البحث عن مساعد' : 'Start looking for a helper',
    availableTitle: isAr ? 'وجبات متاحة بالقرب منك' : 'Meals available near you',
    availableSub: isAr ? 'اختر وجبة تناسب العدد المطلوب واحجزها.' : 'Choose a meal that covers your requested quantity and reserve it.',
    reserve: isAr ? 'حجز الوجبة' : 'Reserve meal',
    availableCount: isAr ? 'وجبات متاحة' : 'meals available',
    availabilityChanged: isAr ? 'تغيّر توفر الوجبات؛ سنبحث لك عن مساعد قريب.' : 'Meal availability changed; we will look for a nearby helper.',
    locationRequired: isAr ? 'انتظر تحديد موقع GPS الدقيق أو فعّل صلاحية الموقع.' : 'Wait for a precise GPS fix or enable location permission.',
    searching: isAr ? 'جاري البحث عن مساعد قريب منك...' : 'Looking for a nearby helper...',
    searchingSub: isAr ? 'نبحث عن مساعدين قريبين يمكنهم مساعدتك' : 'We are looking for nearby helpers who can help',
    pending: isAr ? 'طلب الوجبة بانتظار الموافقة' : 'Meal request awaiting approval',
    pendingSub: isAr ? 'سيصلك إشعار عندما يوافق مقدم المساعدة.' : 'You will be notified when the helper responds.',
    accepted: isAr ? 'تم قبول طلبك' : 'Your request was accepted',
    waiting: isAr ? 'في انتظار الاستلام' : 'Waiting for pickup',
    cancelRequest: isAr ? 'إلغاء الطلب' : 'Cancel request',
    cancelled: isAr ? 'تم إلغاء الطلب' : 'Request cancelled',
    rejected: isAr ? 'لم يتم قبول طلب الوجبة' : 'The meal request was not accepted',
    rejectedSub: isAr ? 'يمكنك العودة إلى الوجبات المتاحة وطلب وجبة أخرى.' : 'Return to available meals and request another meal.',
    notFound: isAr ? 'لم يتم العثور على مساعد قريب حاليًا' : 'No nearby helper was found right now',
    notFoundSub: isAr ? 'يمكنك المحاولة مرة أخرى وسنبحث في نطاق أوسع.' : 'Try again and we will search a wider area.',
    retry: isAr ? 'حاول مرة أخرى' : 'Try again',
    mealsBack: isAr ? 'العودة إلى الوجبات' : 'Back to meals',
    close: isAr ? 'إغلاق' : 'Close',
    helper: isAr ? 'المساعد القريب' : 'Nearby helper',
    pickup: isAr ? 'موقع الاستلام محفوظ للمشاركين فقط' : 'Pickup details are private to participants',
    received: isAr ? 'تم الاستلام' : 'Mark as received',
    complete: isAr ? 'إتمام الطلب' : 'Complete request',
    wait: isAr ? 'تأكيد الاستلام' : 'Confirm pickup',
    chat: isAr ? 'فتح المحادثة' : 'Open chat',
  };

  const markSoundHandled = useCallback((key: string, kind: 'accepted' | 'notFound') => {
    if (handledSoundRef.current.has(key)) return;
    handledSoundRef.current.add(key);
    if (!muted) playFeedbackTone(kind, false);
    navigator.vibrate?.(kind === 'accepted' ? [80, 50, 120] : [180, 70, 180]);
  }, [muted]);

  const fetchAvailable = useCallback(async (needed: number, neededAt: string, lat: number, lng: number): Promise<AvailableMeal[]> => {
    const { data, error: matchError } = await supabase.rpc('find_suitable_meals', {
      p_quantity: needed, p_requested_time: neededAt,
      p_latitude: lat, p_longitude: lng,
    });
    if (matchError) throw matchError;
    return ((data ?? []) as AvailableMeal[]).sort((a, b) => a.distance_km - b.distance_km || a.id.localeCompare(b.id));
  }, []);
  const resumeSearchRef = useRef<() => Promise<void>>(async () => {});
  const initialMealCheckRef=useRef(false);

  const expiredRef = useRef<Set<string>>(new Set());
  const receivedRef=useRef(new Map<string,MealRequest>());

  const applyRequestState = useCallback((nextRequest: MealRequest) => {
    if (ignoredSearchIdsRef.current.has(nextRequest.id)) return;
    if (nextRequest.status === 'CANCELLED' && nextRequest.search_resolution === 'meals_available') {
      ignoredSearchIdsRef.current.add(nextRequest.id);
      setRequest(null);
      if (validCoordinates(userLat, userLng)) {
        void fetchAvailable(nextRequest.quantity_requested, nextRequest.requested_time, userLat!, userLng!)
          .then(meals => { if (meals.length) { setAvailableMeals(meals); setMode('available'); }
            else void resumeSearchRef.current(); })
          .catch(() => { setMode('form'); setError(isAr ? 'تعذر تحديث الوجبات المتاحة.' : 'Could not refresh available meals.'); });
      } else { setMode('form'); setError(copy.locationRequired); }
      return;
    }
    if(isReceived(nextRequest))receivedRef.current.set(nextRequest.id,nextRequest);
    else if(receivedRef.current.has(nextRequest.id))nextRequest=receivedRef.current.get(nextRequest.id)!;
    // Never allow a transition back to SEARCHING/PENDING once we've marked a request as expired
    if (expiredRef.current.has(nextRequest.id) && (nextRequest.status === 'SEARCHING' || nextRequest.status === 'PENDING')) {
      return;
    }
    setRequest(nextRequest);
    if (nextRequest.status === 'CANCELLED') setMode('cancelled');
    if (nextRequest.status === 'REJECTED') setMode('rejected');
    if (nextRequest.status === 'PENDING') setMode('pending');
    if (nextRequest.status === 'SEARCHING') setMode('searching');
    if (nextRequest.status === 'ACCEPTED' || nextRequest.status === 'WAITING_FOR_PICKUP' || nextRequest.status === 'ON_THE_WAY' || nextRequest.status === 'ARRIVED') {
      setMode('accepted');
      if (nextRequest.status === 'ACCEPTED') markSoundHandled(`${nextRequest.id}:accepted`, 'accepted');
    }
    if (nextRequest.status === 'NOT_FOUND' || nextRequest.status === 'EXPIRED') {
      expiredRef.current.add(nextRequest.id);
      setMode('not_found');
      markSoundHandled(`${nextRequest.id}:not_found`, 'notFound');
    }
    if (nextRequest.status === 'RECEIVED' || nextRequest.status === 'COMPLETED') { setMode('completed'); setShowRating(true); }
    if (nextRequest.donor_id) {
      void supabase.from('profiles').select('display_name,avatar_url,is_verified').eq('id', nextRequest.donor_id).maybeSingle().then(({ data, error: profileError }) => {
        if (profileError) console.error('helper profile lookup failed', profileError);
        if (data) setDonor(data as Pick<Profile, 'display_name' | 'avatar_url' | 'is_verified'>);
      });
    }
  }, [copy.locationRequired, fetchAvailable, isAr, markSoundHandled, userLat, userLng]);

  const applyStateRef = useRef(applyRequestState);
  applyStateRef.current = applyRequestState;
  useEffect(() => {
    let alive = true;
    const fetchCurrent=focusRequestId
      ? supabase.from('meal_requests').select('*').eq('id',focusRequestId).eq('requester_id',profileId).maybeSingle()
      : supabase.rpc('get_my_current_meal_request');
    void fetchCurrent.then(({ data, error: queryError }) => {
      if (!alive) return;
      if (queryError) setError(isAr ? 'تعذر تحميل حالة طلبك. أعد فتح الطلب عند عودة الاتصال.' : 'Could not load your request. Reopen it when connected.');
      else if (data) applyStateRef.current(data as MealRequest);
      setRestoring(false);
    });
    return () => { alive = false; };
  }, [profileId, isAr,focusRequestId]);

  const mealIdsKey=[...new Set(existingRequests.map(r=>r.pickup_meal_id).filter((id):id is string=>!!id))].sort().join(',');
  useEffect(()=>{if(!mealIdsKey)return;let active=true;void supabase.from('meals').select('id,name').in('id',mealIdsKey.split(',')).then(({data})=>{if(active&&data)setMealNames(Object.fromEntries(data.map(m=>[m.id,m.name])));});return()=>{active=false;};},[mealIdsKey]);

  // Opening "I need a meal" checks the existing matching RPC before showing
  // the helper-search action. No request or timer is created by this read.
  useEffect(()=>{
    if(restoring||mode!=='form'||initialMealCheckRef.current||!validCoordinates(userLat,userLng))return;
    initialMealCheckRef.current=true;
    let alive=true;
    busyRef.current=true;setBusy(true);
    const neededAt=requestTime==='later'&&Date.parse(laterTime)>Date.now()
      ? new Date(laterTime).toISOString():new Date().toISOString();
    void fetchAvailable(quantity,neededAt,userLat!,userLng!).then(meals=>{
      if(!alive)return;
      if(meals.length){setAvailableMeals(meals);setMode('available');}
    }).catch(()=>{if(alive)setError(isAr?'تعذر التحقق من الوجبات. تحقق من الاتصال وحاول مجددًا.':'Could not check available meals. Check the connection and retry.');})
      .finally(()=>{if(alive){busyRef.current=false;setBusy(false);}});
    return()=>{alive=false;busyRef.current=false;};
  },[restoring,mode,userLat,userLng,quantity,requestTime,laterTime,fetchAvailable,isAr]);

  const currentRequestId = request?.id;
  useEffect(()=>{const saved=(event:Event)=>{const row=(event as CustomEvent<MealRequest>).detail;if(row?.id===currentRequestId&&row.requester_id===profileId)applyStateRef.current(row);};window.addEventListener(MEAL_REQUEST_SAVED,saved);return()=>window.removeEventListener(MEAL_REQUEST_SAVED,saved);},[currentRequestId,profileId]);
  useEffect(() => {
    if (!currentRequestId) return;
    const channel = supabase.channel(`meal-request-${currentRequestId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meal_requests', filter: `id=eq.${currentRequestId}` }, (payload) => {
      applyRequestState(payload.new as MealRequest);
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [applyRequestState, currentRequestId]);

  useEffect(() => {
    if (!['searching', 'pending'].includes(mode) || !request) return;
    // If expires_at has already passed, transition to expired immediately
    const expiresAtMs = new Date(request.expires_at).getTime();
    const updateCountdown = (): void => {
      const remaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining > 0 && remaining !== lastTickRef.current) {
        lastTickRef.current = remaining;
        playFeedbackTone('tick', muted);
        navigator.vibrate?.(muted ? 0 : 18);
      }
      if (remaining === 0 && expireCalledRef.current !== request.id) {
        expireCalledRef.current = request.id;
        // Immediately transition UI to expired state — don't wait for RPC
        const expireStatus = request.status === 'PENDING' ? 'EXPIRED' : 'NOT_FOUND';
        applyRequestState({ ...request, status: expireStatus });
        // Sync backend in the background (best-effort)
        const expireFunction = request.status === 'PENDING' ? 'expire_specific_meal_request' : 'expire_meal_request';
        void supabase.rpc(expireFunction, { p_request_id: request.id }).then(({ error: expireError }) => {
          if (expireError) console.error('request expiry sync failed', expireError);
        });
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, request]);

  useEffect(() => {
    if (!request || request.sharing_mode !== 'direct' || mode !== 'accepted') return;
    let pending = false, alive = true;
    const expire = () => {
      if (Date.parse(request.expires_at) > Date.now() || pending) return;
      pending = true;
      void supabase.rpc('refresh_direct_pickups').then(async ({ error }) => {
        if (!error) {
          const { data } = await supabase.rpc('get_my_current_meal_request');
          if (alive && data) applyStateRef.current(data as MealRequest);
        }
        pending = false;
      });
    };
    expire(); const timer = window.setInterval(expire, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [request, mode]);

  const submitRequest = async (): Promise<void> => {
    if (busyRef.current || restoring) return;
    setError('');
    if (requestTime === 'later' && !laterTime) {
      setError(isAr ? 'اختر وقت الحاجة إلى الوجبة' : 'Choose when you need the meal');
      return;
    }
    if (!validCoordinates(userLat, userLng)) {
      setError(locationIssue ? locationMessage(locationIssue, isAr) : copy.locationRequired);
      onRetryLocation();
      return;
    }
    const requestedAtMs = requestTime === 'now' ? Date.now() : Date.parse(laterTime);
    if (!Number.isFinite(requestedAtMs) || (requestTime === 'later' && requestedAtMs <= Date.now())) {
      setError(isAr ? 'اختر وقتًا لاحقًا صحيحًا' : 'Choose a valid future time');
      return;
    }
    const requestedTime = new Date(requestedAtMs).toISOString();
    busyRef.current = true; setBusy(true);
    try {
      const latitude = userLat!, longitude = userLng!;
      const areaLookup = resolveLocationAreaInfo(latitude, longitude, language).catch(() => null);
      const meals = await fetchAvailable(quantity, requestedTime, latitude, longitude);
      if (meals.length) {
        setAvailableMeals(meals);
        setRequest(null);
        setMode('available');
        return;
      }
      // Reverse geocoding can stall on Android. The GPS-backed request should
      // still start promptly; the already resolved area is the fallback.
      const area = await Promise.race([
        areaLookup,
        new Promise<null>(resolve => window.setTimeout(() => resolve(null), 2500)),
      ]);
      const { data, error: createError } = await supabase.rpc('create_meal_request', {
        p_quantity: quantity, p_requested_time: requestedTime,
        p_latitude: latitude, p_longitude: longitude,
        p_area_name: area?.name ?? areaName ?? null, p_address: area?.address ?? null,
      });
      if (createError) throw createError;
      const createdRequest = getRequest(data as MealRequest | MealRequest[] | null);
      if (!createdRequest) {
        const currentMeals = await fetchAvailable(quantity, requestedTime, latitude, longitude);
        if (currentMeals.length) { setAvailableMeals(currentMeals); setMode('available'); }
        else setError(isAr ? 'تغيّر توفر الوجبات. حاول البحث مرة أخرى.' : 'Meal availability changed. Try searching again.');
        return;
      }
      lastTickRef.current = null;
      expireCalledRef.current = null;
      handledSoundRef.current.clear();
      applyRequestState(createdRequest);
    } catch (createError) {
      console.error('meal request search failed', createError);
      setError(isAr ? 'تعذر التحقق من الوجبات أو إنشاء الطلب. تحقق من الاتصال وحاول مجددًا.' : 'Could not check meals or start the request. Check your connection and retry.');
    } finally { busyRef.current = false; setBusy(false); }
  };
  resumeSearchRef.current = submitRequest;

  useEffect(() => {
    if (mode !== 'searching' && mode !== 'available') return;
    let alive = true, checking = false;
    const check = async () => {
      if (!alive || checking || busyRef.current || !validCoordinates(userLat, userLng)) return;
      checking = true;
      try {
        const needed = mode === 'searching' && request ? request.quantity_requested : quantity;
        const neededAt = mode === 'searching' && request ? request.requested_time
          : requestTime === 'now' ? new Date().toISOString() : new Date(laterTime).toISOString();
        const meals = await fetchAvailable(needed, neededAt, userLat!, userLng!);
        if (!alive) return;
        if (mode === 'available') {
          setAvailableMeals(meals);
          if (!meals.length) {
            setMode('form');
            setError(copy.availabilityChanged);
            void resumeSearchRef.current();
          }
        } else if (request && meals.length) {
          const { data, error: cancelError } = await supabase.rpc('cancel_waiting_meal_request', { p_request_id: request.id });
          if (!alive) return;
          if (!cancelError && data) {
            ignoredSearchIdsRef.current.add(request.id);
            setRequest(null);
            setAvailableMeals(meals);
            setMode('available');
          } else {
            const { data: latest } = await supabase.from('meal_requests').select('*').eq('id', request.id).maybeSingle();
            if (!alive) return;
            if (latest?.status === 'CANCELLED' && latest.search_resolution === 'meals_available') {
              ignoredSearchIdsRef.current.add(request.id);
              setRequest(null);
              setAvailableMeals(meals);
              setMode('available');
            } else if (latest) applyStateRef.current(latest as MealRequest);
          }
        }
      } catch (checkError) { console.error('meal search recheck failed', checkError); }
      finally { checking = false; }
    };
    const interval = window.setInterval(() => void check(), 4000);
    const changed = () => void check();
    window.addEventListener('sharek-meal-published', changed);
    return () => { alive = false; window.clearInterval(interval); window.removeEventListener('sharek-meal-published', changed); };
  }, [copy.availabilityChanged, fetchAvailable, laterTime, mode, quantity, request, requestTime, userLat, userLng]);

  const reserveAvailable = async (meal: AvailableMeal): Promise<void> => {
    if (busyRef.current || !validCoordinates(userLat, userLng)) return;
    busyRef.current = true; setBusy(true); setError('');
    let restartSearch = false;
    try {
      const neededAt = requestTime === 'now' ? new Date().toISOString() : new Date(laterTime).toISOString();
      const fresh = await fetchAvailable(quantity, neededAt, userLat!, userLng!);
      setAvailableMeals(fresh);
      if (!fresh.some(candidate => candidate.id === meal.id)) {
        if (!fresh.length) { setMode('form'); restartSearch = true; }
        else setError(isAr ? 'لم تعد هذه الوجبة متاحة. اختر وجبة أخرى.' : 'This meal is no longer available. Choose another.');
        return;
      }
      const result = await onReserveMeal(meal, quantity, neededAt);
      if (!result.ok) {
        setError(result.message);
        const updated = await fetchAvailable(quantity, neededAt, userLat!, userLng!);
        setAvailableMeals(updated);
        if (!updated.length) { setMode('form'); restartSearch = true; }
        return;
      }
      const booked = result.request ?? getRequest((await supabase.rpc('get_my_current_meal_request')).data as MealRequest | MealRequest[] | null);
      if (booked) applyRequestState(booked);
    } catch (reserveError) {
      console.error('meal reservation failed', reserveError);
      setError(isAr ? 'تعذر حجز الوجبة. تحقق من الاتصال وحاول مجددًا.' : 'Could not reserve this meal. Check your connection and retry.');
    } finally {
      busyRef.current = false; setBusy(false);
      if (restartSearch) void resumeSearchRef.current();
    }
  };

  const advance = async (nextStatus: 'WAITING_FOR_PICKUP' | 'ON_THE_WAY' | 'ARRIVED' | 'RECEIVED' | 'COMPLETED'): Promise<void> => {
    if (!request) return;
    const { data, error: advanceError } = await advanceMealRequest(request, nextStatus, profileId);
    if (advanceError||!data) {
      setError(isAr?'تعذر حفظ حالة الاستلام. تحقق من الاتصال وحاول مجددًا.':'Could not save the pickup status. Check your connection and retry.');
      return;
    }
    const updated = getRequest(data as MealRequest | MealRequest[]);
    if (updated) applyRequestState(updated);
  };

  const cancelPendingRequest = async (): Promise<void> => {
    if (!request || busyRef.current) return;
    setConfirmCancel(false); setError('');
    busyRef.current = true; setBusy(true);
    const { data, error: cancelError } = !request.pickup_meal_id && request.donor_id
      ? await supabase.rpc('advance_meal_request', { p_request_id: request.id, p_next_status: 'CANCELLED' })
      : await supabase.rpc(request.pickup_meal_id ? 'cancel_specific_meal_request' : 'cancel_waiting_meal_request', { p_request_id: request.id });
    busyRef.current = false; setBusy(false);
    if (cancelError || !data) {
      setError(isAr ? 'تعذر إلغاء الطلب الآن.' : 'The request could not be cancelled.');
      return;
    }
    applyRequestState(getRequest(data as MealRequest | MealRequest[])!);
  };

  const retry = (): void => {
    setRequest(null);
    setDonor(null);
    setMode('form');
    setError('');
    lastTickRef.current = null;
    expireCalledRef.current = null;
    handledSoundRef.current.clear();
  };

  const toggleMute = (): void => {
    const next = !muted;
    setMuted(next);
    window.localStorage.setItem('sharek-search-muted', String(next));
  };

  const formattedTime = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return <div className="meal-request-overlay" dir={isAr ? 'rtl' : 'ltr'}>
    <div className="meal-request-sheet">
      <button className="modal-close" onClick={onClose} aria-label={copy.close}><X size={18} /></button>
      {restoring && <div className="community-loading"><span>{isAr ? 'جارٍ تحميل حالة الطلب…' : 'Loading request…'}</span></div>}
      {!restoring && mode === 'form' && <>
        <span className="modal-icon orange"><Heart size={23} fill="currentColor" /></span>
        <h2>{copy.title}</h2>
        <p>{isAr ? 'سنبحث عن مساعد قريب يمكنه مشاركتك وجبة.' : 'We will look for a nearby helper who can share a meal.'}</p>
        {existingRequests.length>0&&<div className="meal-request-history"><strong>{isAr?'طلباتي':'My requests'}</strong>{[...existingRequests].sort((a,b)=>Number(['SEARCHING','PENDING','ACCEPTED','WAITING_FOR_PICKUP','ON_THE_WAY','ARRIVED'].includes(b.status))-Number(['SEARCHING','PENDING','ACCEPTED','WAITING_FOR_PICKUP','ON_THE_WAY','ARRIVED'].includes(a.status))||Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,20).map(item=><button key={item.id} type="button" onClick={()=>applyRequestState(item)}><span>{item.pickup_meal_id?mealNames[item.pickup_meal_id]??(isAr?'طلب وجبة':'Meal request'):(isAr?'طلب مساعدة':'Help request')}</span><small>{requestStatus(item.status,isAr)} · {item.quantity_requested} · {new Date(item.created_at).toLocaleDateString(isAr?'ar-EG':'en-GB')}</small></button>)}</div>}
        <label>{copy.meals}<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5+</option></select></label>
        <div className="request-choice-label">{copy.when}</div>
        <div className="request-choice-grid"><button className={requestTime === 'now' ? 'selected' : ''} onClick={() => setRequestTime('now')}><Clock3 size={17} />{copy.now}</button><button className={requestTime === 'later' ? 'selected' : ''} onClick={() => setRequestTime('later')}><Clock3 size={17} />{copy.later}</button></div>
        {requestTime === 'later' && <input className="request-time-input" type="datetime-local" value={laterTime} onChange={(event) => setLaterTime(event.target.value)} />}
        <div className="request-location-note"><MapPin size={16} /><span>{validCoordinates(userLat, userLng) ? copy.location : locationMessage(locationIssue, isAr)}</span></div>
        {error && <div className="feedback error">{error}</div>}
        <button className="primary-button" disabled={busy} onClick={() => void submitRequest()}>{busy ? '…' : copy.start}<Search size={18} /></button>
      </>}
      {!restoring && mode === 'available' && <div className="meal-request-result">
        <span className="modal-icon orange"><Heart size={23} fill="currentColor" /></span>
        <h2>{copy.availableTitle}</h2>
        <p>{copy.availableSub}</p>
        {availableMeals.map(meal => <button key={meal.id} type="button" className="helper-card" disabled={busy}
          onClick={() => void reserveAvailable(meal)}
          aria-label={`${copy.reserve}: ${meal.name}, ${formatDistance(meal.distance_km, language)}`}>
          {meal.photo_url ? <img src={meal.photo_url} alt="" /> : <span className="helper-avatar"><Heart size={19} /></span>}
          <div><strong>{meal.name}</strong><small>{meal.donor_name ?? copy.helper} · {meal.quantity} {copy.availableCount} · {formatDistance(meal.distance_km, language)} · {isAr?'متاحة':'Available'}</small></div>
          <Check size={18} aria-hidden="true" />
        </button>)}
        {error && <div className="feedback error" role="alert">{error}</div>}
        <button className="text-button" disabled={busy} onClick={() => setMode('form')}>{isAr ? 'تعديل عدد الوجبات أو الوقت' : 'Change quantity or time'}</button>
      </div>}
      {mode === 'pending' && <div className="meal-request-search-state">
        <span className="modal-icon orange"><Clock3 size={23} /></span>
        <h2>{copy.pending}</h2>
        <p>{copy.pendingSub}</p>
        <strong className="search-timer">{formattedTime}</strong>
        {request&&<RequestPhoneShare request={request} language={language}/>}
        <div className="search-meta"><span><MapPin size={15} />{copy.location}</span><button disabled={busy} onClick={() => setConfirmCancel(true)}>{copy.cancelRequest}</button></div>
      </div>}
      {mode === 'searching' && <div className="meal-request-search-state">
        <div className="search-radar"><span /><span /><span /><Heart size={26} fill="currentColor" /></div>
        <span className="modal-icon orange"><Search size={23} /></span>
        <h2>{copy.searching}</h2><p>{copy.searchingSub}</p>
        <strong className="search-timer">{formattedTime}</strong>
        <div className="search-meta"><span><MapPin size={15} />{copy.location}</span><button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button></div>
        <button className="secondary-button" disabled={busy} onClick={() => setConfirmCancel(true)}>{copy.cancelRequest}</button>
        <button className="text-button" onClick={onClose}>{copy.mealsBack}</button>
      </div>}
      {mode === 'accepted' && request && <div className="meal-request-result success-result">
        <span className="result-icon success"><Check size={27} /></span>
        <h2>{request.sharing_mode === 'direct' ? (isAr ? 'تم تأكيد حجزك للاستلام المباشر' : 'Your direct pickup is reserved') : copy.accepted}</h2>
        <p>{copy.waiting}</p>
        <SmartPickupCard
          language={language}
          request={request}
          profileId={profileId}
          userLat={userLat}
          userLng={userLng}
          donorName={donor?.display_name || copy.helper}
          donorAvatar={donor?.avatar_url ?? null}
          donorVerified={donor?.is_verified ?? false}
          onAdvance={advance}
          onOpenChat={request.donor_id && onOpenChat ? () => onOpenChat(request.donor_id!) : undefined}
        />
        <button className="secondary-button" disabled={busy} onClick={() => setConfirmCancel(true)}>{copy.cancelRequest}</button>
      </div>}
      {request&&request.pickup_meal_id&&['pending','accepted'].includes(mode)&&<button className="text-button" disabled={busy} onClick={()=>{setRequest(null);setMode('form');setError('');}}>{isAr?'طلب وجبة أخرى':'Request another meal'}</button>}
      {mode === 'rejected' && <div className="meal-request-result"><span className="result-icon warning"><X size={27} /></span><h2>{copy.rejected}</h2><p>{copy.rejectedSub}</p><button className="primary-button" onClick={onClose}>{copy.mealsBack}</button></div>}
      {mode === 'cancelled' && <div className="meal-request-result"><h2>{copy.cancelled}</h2><button className="primary-button" onClick={onClose}>{copy.mealsBack}</button><button className="text-button" onClick={retry}>{copy.retry}</button></div>}
      {mode === 'completed' && <div className="meal-request-result success-result"><span className="result-icon success"><Check size={27} /></span><h2>{isAr ? 'اكتملت مشاركة الوجبة' : 'Meal sharing completed'}</h2><p>{isAr ? 'شكرًا لأنك وثقت بمجتمع SHARek.' : 'Thank you for trusting the SHARek community.'}</p><button className="primary-button" onClick={onClose}>{copy.close}</button></div>}
      {showRating && mode === 'completed' && request && donor && <RatingModal language={language} requestId={request.id} reviewType="beneficiary_to_donor" partnerName={donor.display_name || copy.helper} partnerAvatar={donor.avatar_url} onComplete={() => setShowRating(false)} onSkip={() => setShowRating(false)} />}
      {mode === 'not_found' && <div className="meal-request-result"><span className="result-icon warning"><X size={27} /></span><h2>{copy.notFound}</h2><p>{copy.notFoundSub}</p><button className="primary-button" onClick={retry}>{copy.retry}</button><button className="text-button" onClick={onClose}>{copy.mealsBack}</button></div>}
      {mode === 'not_found' && request && !request.pickup_meal_id && !request.donor_id && <button className="secondary-button" disabled={busy} onClick={() => setConfirmCancel(true)}>{copy.cancelRequest}</button>}
      {mode !== 'form' && error && <div className="feedback error" role="alert">{error}</div>}
      {confirmCancel && <div className="modal-overlay"><div className="modal-card" role="dialog" aria-modal="true" aria-label={copy.cancelRequest}><h3>{isAr ? 'هل تريد إلغاء هذا الطلب؟' : 'Cancel this request?'}</h3><p>{isAr ? 'سيتم إنهاء الطلب ويمكنك طلب وجبة أخرى.' : 'This request will end and you can request another meal.'}</p><button className="primary-button danger" disabled={busy} onClick={() => void cancelPendingRequest()}>{isAr ? 'تأكيد الإلغاء' : 'Confirm cancellation'}</button><button className="text-button" onClick={() => setConfirmCancel(false)}>{isAr ? 'رجوع' : 'Back'}</button></div></div>}
    </div>
  </div>;
}
