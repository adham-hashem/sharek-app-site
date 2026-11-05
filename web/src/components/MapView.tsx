import { mealDeadline, sharingLabel, collectionLabel } from '@/lib/meal-sharing';
import {isActiveHandover} from '@/lib/meal-operations';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, LocateFixed, MapPin, Minus, Plus, Search, Utensils, X, Navigation, MessageCircle, Check, BadgeCheck, Star, Clock, RefreshCw } from 'lucide-react';
import { DirectPickupNavigation } from './DirectPickupNavigation';
import { MealDetail } from '@/components/MealDetail';
import {MealShareButton} from '@/components/MealShareButton';
import L, { type Circle as LeafletCircle, type Map as LeafletMap, type Marker as LeafletMarker, type Polyline as LeafletPolyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase,formatDistance, haversineDistance, type CommunityMeal, type Language, type Meal, type MealRequest, type UserRole } from '@/lib/supabase';
import { locationMessage, validCoordinates } from '@/lib/geo';
import type { ChatOpenResult } from '@/lib/community-chat';

type SelectedRequest = MealRequest | null;
type AcceptResult = { ok: boolean; message: string };

type Props = {
  language: Language;
  role: UserRole;
  requests: MealRequest[];
  availableMeals: CommunityMeal[];
  donorMeals: Meal[];
  userLat: number | null;
  userLng: number | null;
  locationAccuracy: number | null;
  locationError: string | null;
  areaName?: string | null;
  currentUserId?: string;
  focusRequestId?: string | null;
  onMessageDonor?: (mealId: string, donorId: string) => Promise<ChatOpenResult>;
  onRetryLocation: () => void;
  onRequestSelect: (request: MealRequest) => void;
  onAcceptRequest: (request: MealRequest) => Promise<AcceptResult>;
  onRejectRequest?: (request: MealRequest) => Promise<AcceptResult>;
  onReserveMeal: (meal: CommunityMeal, quantity?: number) => Promise<AcceptResult>;
  primaryAction: React.ReactNode;
  receiptFollowups?: React.ReactNode;
  activeHandover?: MealRequest | null;
  onAdvanceRequest?: (request: MealRequest, nextStatus: string) => Promise<AcceptResult>;
  onOpenChat?: (request: MealRequest) => void;
  onCancelRequest?: (request: MealRequest) => Promise<AcceptResult>;
};

type RouteResponse = {
  code?: string;
  routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: Array<[number, number]> } }>;
};


function heartMarkerIcon(active: boolean): L.DivIcon {
  const color = active ? '#f06427' : '#6f8f3c';
  return L.divIcon({
    className: 'leaflet-sharek-marker-wrap',
    html: `<span class="sharek-request-marker ${active ? 'selected' : ''}" style="--marker-color:${color}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.1-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.6A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.3Z"/></svg></span>`,
    iconSize: [48, 58],
    iconAnchor: [24, 58],
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function mealMarkerIcon(meal: CommunityMeal, active: boolean): L.DivIcon {
  const image = meal.photo_url ? `<img src="${escapeHtml(meal.photo_url)}" alt="" />` : '<span class="sharek-meal-marker-fallback"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10h14M7 7h10M7 13h10M9 16h6" /></svg></span>';
  return L.divIcon({
    className: 'leaflet-sharek-meal-wrap',
    html: `<span class="sharek-meal-marker ${active ? 'selected' : ''}">${image}</span>`,
    iconSize: [42, 48],
    iconAnchor: [21, 42],
  });
}

function userLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: 'leaflet-sharek-user-wrap',
    html: '<span class="sharek-user-marker"><span></span></span>',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function pickupMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'beneficiary-pickup-icon',
    html: '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.1-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.6A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.3Z"/></svg></span>',
    iconSize: [46, 55],
    iconAnchor: [23, 55],
  });
}

function roundedCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

function requestDistance(request: MealRequest, userLat: number | null, userLng: number | null): number | null {
  const point = requestPoint(request);
  if (!point || userLat == null || userLng == null) return null;
  return haversineDistance(userLat, userLng, point[0], point[1]);
}

function requestPoint(request: MealRequest): [number, number] | null {
  if (request.status !== 'SEARCHING' && request.pickup_latitude != null && request.pickup_longitude != null)
    return [request.pickup_latitude, request.pickup_longitude];
  if (request.latitude == null || request.longitude == null) return null;
  return [roundedCoordinate(request.latitude), roundedCoordinate(request.longitude)];
}

function mealDistance(meal: CommunityMeal, userLat: number | null, userLng: number | null): number | null {
  if (userLat == null || userLng == null) return null;
  return meal.distance_km;
}

export function MapView({ language, role, requests, availableMeals, donorMeals, userLat, userLng, locationAccuracy, locationError, areaName, currentUserId, focusRequestId, onMessageDonor, onRetryLocation, onRequestSelect, onAcceptRequest, onRejectRequest, onReserveMeal, primaryAction, receiptFollowups, activeHandover:handoverInput, onAdvanceRequest, onOpenChat, onCancelRequest }: Props) {
  const activeHandover=handoverInput&&isActiveHandover(handoverInput)?handoverInput:null;
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const accuracyCircleRef = useRef<LeafletCircle | null>(null);
  const requestMarkersRef = useRef(new Map<string, LeafletMarker>());
  const mealMarkersRef = useRef(new Map<string, LeafletMarker>());
  const pickupMarkerRef = useRef<LeafletMarker | null>(null);
  const routeRef = useRef<LeafletPolyline | null>(null);
  const lastRouteOriginRef = useRef<[number, number] | null>(null);
  const centeredOnUserRef = useRef(false);
  const focusedRequestIdRef = useRef<string | null>(null);
  const followUserRef = useRef(true);
  const currentPositionRef = useRef({ lat: userLat, lng: userLng });
  currentPositionRef.current = { lat: userLat, lng: userLng };
  const [selectedRequest, setSelectedRequest] = useState<SelectedRequest>(null);
  const [requestProfile,setRequestProfile]=useState<{display_name:string|null;avatar_url:string|null}|null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptMessage, setAcceptMessage] = useState('');
  const [donorView, setDonorView] = useState<'meals' | 'requests'>('requests');
  const [selectedMealSnapshot, setSelectedMeal] = useState<CommunityMeal | null>(null);
  const selectedMeal = availableMeals.find(meal => meal.id === selectedMealSnapshot?.id) ?? selectedMealSnapshot;
  const [selectedDonorMeal, setSelectedDonorMeal] = useState<Meal | null>(null);
  const [directNavOpen,setDirectNavOpen] = useState(false);
  const [showMealDetails, setShowMealDetails] = useState(false);
  const [reserving, setReserving] = useState(false);
  const reservingRef = useRef(false);
  const [confirmingReserve, setConfirmingReserve] = useState(false);
  const [reserveMsg, setReserveMsg] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const [remainingMeters, setRemainingMeters] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [proximityAlert, setProximityAlert] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const isAr = language === 'ar';
  const isDonor = role === 'donor';
  useEffect(()=>{
    if(!isDonor||!selectedRequest){setRequestProfile(null);return;}
    let active=true;setRequestProfile(null);
    void supabase.rpc('get_help_request_profile',{p_request_id:selectedRequest.id}).then(({data,error})=>{
      if(active&&!error&&data)setRequestProfile(data as {display_name:string|null;avatar_url:string|null});
    });
    return()=>{active=false;};
  },[isDonor,selectedRequest?.id]);

  const copy = {
    search: isAr ? 'ابحث عن وجبات أو أماكن...' : 'Search meals or places...',
    nearbyRequests: isAr ? 'طلبات قريبة منك' : 'Nearby Requests',
    nearbyArea: isAr ? 'موقع قريب' : 'Nearby area',
    anonymous: isAr ? 'عائلة محتاجة' : 'Nearby family',
    meals: isAr ? 'وجبات' : 'meals',
    urgent: isAr ? 'عاجل' : 'Urgent',
    nearby: isAr ? 'قريب' : 'Nearby',
    empty: isDonor ? (isAr ? 'لا توجد طلبات قريبة حاليًا' : 'No nearby requests right now') : (isAr ? 'لا توجد وجبات متاحة بالقرب منك حاليًا' : 'No meals are available nearby right now'),
    emptySub: isDonor ? (isAr ? 'سنخبرك عندما يحتاج شخص قريب منك إلى وجبة.' : 'We will let you know when someone nearby needs a meal.') : (isAr ? 'يمكنك طلب وجبة وسنبحث عن مساعد قريب.' : 'Request a meal and we will look for a nearby helper.'),
    details: isAr ? 'تفاصيل الطلب' : 'Request details',
    requestTime: isAr ? 'وقت الطلب' : 'Requested',
    status: isAr ? 'الحالة' : 'Status',
    searching: isAr ? 'يبحث عن متبرع' : 'Looking for a donor',
    accept: isAr ? 'قبول الطلب' : 'Accept request',
    close: isAr ? 'إغلاق' : 'Close',
    accepted: isAr ? 'تم قبول الطلب بنجاح' : 'Request accepted successfully',
    rejected: isAr ? 'تم رفض الطلب' : 'Request rejected',
    failed: isAr ? 'لم يعد هذا الطلب متاحًا' : 'This request is no longer available',
    retry: isAr ? 'إعادة المحاولة' : 'Retry',
    noLocation: isAr ? 'فعّل موقعك لرؤية المسافات' : 'Enable location to see distances',
    requestMeal: isAr ? 'اطلب الوجبة' : 'Request meal',
    reserving: isAr ? 'جارٍ الطلب...' : 'Requesting...',
    reserveFailed: isAr ? 'تعذر طلب الوجبة' : 'Could not request meal',
    reserveDone: isAr ? 'تم إرسال الطلب، بانتظار الموافقة' : 'Request sent, awaiting approval',
    confirmRequest: isAr ? 'هل تريد طلب هذه الوجبة؟' : 'Would you like to request this meal?',
    confirm: isAr ? 'تأكيد الطلب' : 'Confirm request',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    available: isAr ? 'متاح' : 'Available',
    distance: isAr ? 'المسافة' : 'Distance',
    remaining: isAr ? 'متبقي' : 'Remaining',
    expiresAt: isAr ? 'ينتهي الساعة' : 'Expires at',
    helper: isAr ? 'مساعد' : 'Helper',
    verified: isAr ? 'موثق' : 'Verified',
    new_: isAr ? 'جديد' : 'New',
    routeTitle: isAr ? 'طريقك إلى الوجبة' : 'Route to your meal',
    routeRemaining: isAr ? 'متبقي' : 'remaining',
    walkApprox: isAr ? 'مشي تقريبًا' : 'approx. walk',
    openChat: isAr ? 'فتح الشات' : 'Open chat',
    cancelReq: isAr ? 'إلغاء الطلب' : 'Cancel request',
    received: isAr ? 'تم الاستلام' : 'Mark received',
    approaching: isAr ? 'اقتربت من موقع استلام الوجبة' : 'You are approaching the pickup point',
    arrived: isAr ? 'لقد وصلت إلى موقع الاستلام' : 'You have arrived at the pickup point',
    routeUpdating: isAr ? 'جارٍ تحديث الطريق...' : 'Updating route...',
    routeFailed: isAr ? 'تعذر حساب الطريق' : 'Could not calculate route',
    cancelConfirm: isAr ? 'هل تريد إلغاء الطلب؟' : 'Cancel this request?',
    cancelDone: isAr ? 'تم إلغاء الطلب' : 'Request cancelled',
    cancelFailed: isAr ? 'تعذر الإلغاء' : 'Could not cancel',
    min: isAr ? 'د' : 'min',
  };

  // The shared feed applies the same 5 / 15 / 50 km discovery policy.
  const sortedMeals = availableMeals;
  const nearbyMeals = useMemo(() => {
    if (userLat == null || userLng == null) return [];
    const distances = sortedMeals.map((meal) => mealDistance(meal, userLat, userLng)).filter((distance): distance is number => distance != null);
    const nearest = distances.length ? Math.min(...distances) : undefined;
    const range = nearest == null || nearest <= 5 ? 5 : nearest <= 15 ? 15 : 50;
    return sortedMeals.filter((meal) => {
      const distance = mealDistance(meal, userLat, userLng);
      return distance != null && distance <= range;
    });
  }, [sortedMeals, userLat, userLng]);
  const sortedRequests = useMemo(() => [...requests].sort((a, b) => {
    const aDistance = requestDistance(a, userLat, userLng) ?? Number.MAX_SAFE_INTEGER;
    const bDistance = requestDistance(b, userLat, userLng) ?? Number.MAX_SAFE_INTEGER;
    const aUrgency = new Date(a.expires_at).getTime() - Date.now();
    const bUrgency = new Date(b.expires_at).getTime() - Date.now();
    return aDistance - bDistance || aUrgency - bUrgency;
  }), [requests, userLat, userLng]);

  // Only show meals that are ACTIVE and not expired
  const visibleMeals = useMemo(() => nearbyMeals.filter((m) => m.status === 'ACTIVE' && new Date(mealDeadline(m)).getTime() > now), [nearbyMeals, now]);

  // Tick for expiry countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const focusRequest = useCallback((request: MealRequest) => {
    followUserRef.current = false;
    setSelectedRequest(request);
    setSelectedMarkerId(request.id);
    setAcceptMessage('');
    onRequestSelect(request);
    const point = requestPoint(request);
    if (mapRef.current && point) mapRef.current.flyTo(point, 15, { duration: .55 });
  }, [onRequestSelect]);

  useEffect(() => {
    if (!focusRequestId || focusedRequestIdRef.current === focusRequestId) return;
    const target = requests.find(item => item.id === focusRequestId);
    if (!target) return;
    focusedRequestIdRef.current = focusRequestId;
    focusRequest(target);
  }, [focusRequest, focusRequestId, requests]);

  const focusMeal = useCallback((meal: CommunityMeal) => {
    followUserRef.current = false;
    setSelectedMeal(meal);
    setSelectedMarkerId(meal.id);
    setReserveMsg('');
    if (mapRef.current && meal.latitude != null && meal.longitude != null) {
      mapRef.current.flyTo([meal.latitude, meal.longitude], 15, { duration: .55 });
    }
  }, []);

  useEffect(() => {
    if (selectedMeal && !visibleMeals.some((meal) => meal.id === selectedMeal.id)) {
      setSelectedMeal(null);
      setShowMealDetails(false);
    }
  }, [selectedMeal, visibleMeals]);

  const recenter = useCallback(() => {
    if (!mapRef.current || userLat == null || userLng == null) {
      onRetryLocation();
      return;
    }
    mapRef.current.flyTo([userLat, userLng], 15, { duration: .55 });
    followUserRef.current = true;
  }, [onRetryLocation, userLat, userLng]);

  const searchPlaces = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || !mapRef.current) return;
    setSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=${language}&q=${encodeURIComponent(query)}`);
      if (!response.ok) return;
      const data: Array<{ lat: string; lon: string }> = await response.json();
      const result = data[0];
      if (result) mapRef.current.flyTo([Number(result.lat), Number(result.lon)], 14, { duration: .65 });
    } finally {
      setSearching(false);
    }
  }, [language, searchQuery]);

  const handleAccept = async () => {
    if (!selectedRequest || accepting) return;
    setAccepting(true);
    const result = await onAcceptRequest(selectedRequest);
    setAccepting(false);
    setAcceptMessage(result.ok ? copy.accepted : result.message || copy.failed);
    if (result.ok) setSelectedRequest(null);
  };

  const handleReject = async () => {
    if (!selectedRequest || !onRejectRequest || accepting) return;
    setAccepting(true);
    const result = await onRejectRequest(selectedRequest);
    setAccepting(false);
    setAcceptMessage(result.ok ? copy.rejected : result.message || copy.failed);
    if (result.ok) setSelectedRequest(null);
  };

  const handleReserveMeal = async () => {
    if (!selectedMeal || reservingRef.current) return;
    reservingRef.current = true;
    setConfirmingReserve(false);
    setReserving(true);
    setReserveMsg('');
    try {
      const result = await onReserveMeal(selectedMeal);
      if (result.ok) {
        setSelectedMeal(null);
        setReserveMsg(selectedMeal.sharing_mode === 'direct' ? (isAr ? 'تم تأكيد الحجز، توجّه لنقطة الاستلام' : 'Reservation confirmed. Head to the pickup point.') : copy.reserveDone);
      } else {
        setReserveMsg(result.message || copy.reserveFailed);
      }
    } catch (error) {
      console.error('map meal reservation failed', error);
      setReserveMsg(copy.reserveFailed);
    } finally {
      reservingRef.current = false;
      setReserving(false);
    }
  };

  // Initialize map
  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    const map = L.map(mapNodeRef.current, { zoomControl: false, attributionControl: true, minZoom: 2 }).fitWorld();
    map.on('dragstart', () => { followUserRef.current = false; });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    L.control.zoom({ position: isAr ? 'topleft' : 'topright' }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [isAr]);

  // Request markers (donor view)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    requestMarkersRef.current.forEach((marker, id) => {
      if (!requests.some((request) => request.id === id)) {
        marker.removeFrom(map);
        requestMarkersRef.current.delete(id);
      }
    });
    requests.forEach((request) => {
      const position = requestPoint(request);
      if (!position) return;
      const icon = heartMarkerIcon(request.id === selectedMarkerId);
      const existing = requestMarkersRef.current.get(request.id);
      if (existing) {
        const previous = existing.getLatLng();
        if (previous.lat !== position[0] || previous.lng !== position[1]) existing.setLatLng(position);
        if ((existing.options.icon as L.DivIcon)?.options.html !== icon.options.html) existing.setIcon(icon);
      } else {
        const marker = L.marker(position, { icon, riseOnHover: true }).addTo(map);
        marker.on('click', () => focusRequest(request));
        requestMarkersRef.current.set(request.id, marker);
      }
    });
  }, [focusRequest, requests, selectedMarkerId]);

  // Meal markers (beneficiary view) — only when no active handover
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeHandover) {
      mealMarkersRef.current.forEach((marker) => marker.removeFrom(map));
      mealMarkersRef.current.clear();
      return;
    }
    mealMarkersRef.current.forEach((marker, id) => {
      if (!visibleMeals.some((m) => m.id === id)) {
        marker.removeFrom(map);
        mealMarkersRef.current.delete(id);
      }
    });
    visibleMeals.forEach((meal) => {
      if (meal.latitude == null || meal.longitude == null) return;
      const position: L.LatLngExpression = [meal.latitude, meal.longitude];
      const icon = mealMarkerIcon(meal, meal.id === selectedMarkerId);
      const existing = mealMarkersRef.current.get(meal.id);
      if (existing) {
        const previous = existing.getLatLng();
        if (previous.lat !== meal.latitude || previous.lng !== meal.longitude) existing.setLatLng(position);
        if ((existing.options.icon as L.DivIcon)?.options.html !== icon.options.html) existing.setIcon(icon);
        existing.off('click').on('click', () => focusMeal(meal));
      } else {
        const marker = L.marker(position, { icon, riseOnHover: true, zIndexOffset: 200 }).addTo(map);
        marker.on('click', () => focusMeal(meal));
        mealMarkersRef.current.set(meal.id, marker);
      }
    });
  }, [activeHandover, focusMeal, visibleMeals, selectedMarkerId]);

  // User location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!validCoordinates(userLat, userLng)) {
      userMarkerRef.current?.remove(); userMarkerRef.current = null;
      accuracyCircleRef.current?.remove(); accuracyCircleRef.current = null;
      centeredOnUserRef.current = false; return;
    }
    const position: L.LatLngExpression = [userLat!, userLng!];
    if (!userMarkerRef.current) userMarkerRef.current = L.marker(position, { icon: userLocationIcon(), zIndexOffset: 1000 }).addTo(map);
    else userMarkerRef.current.setLatLng(position);
    const accuracy = locationAccuracy ?? 0;
    if (!accuracyCircleRef.current) accuracyCircleRef.current = L.circle(position, { radius: accuracy, color: '#1683ff', weight: 1, opacity: .3, fillColor: '#1683ff', fillOpacity: .1 }).addTo(map);
    else accuracyCircleRef.current.setLatLng(position).setRadius(accuracy);
    if (!centeredOnUserRef.current) {
      map.flyTo([userLat!, userLng!], 14, { duration: .7 });
      centeredOnUserRef.current = true;
    } else if (followUserRef.current && map.getCenter().distanceTo(position) > 25) {
      map.panTo(position, { animate: false });
    }
  }, [locationAccuracy, userLat, userLng]);

  // Route rendering when there's an active handover
  const destination = useMemo<[number, number] | null>(() => {
    if (!activeHandover || activeHandover.sharing_mode === 'direct') return null;
    if (activeHandover.pickup_latitude != null && activeHandover.pickup_longitude != null) return [activeHandover.pickup_latitude, activeHandover.pickup_longitude];
    if (activeHandover.latitude != null && activeHandover.longitude != null) return [activeHandover.latitude, activeHandover.longitude];
    return null;
  }, [activeHandover]);

  const loadRoute = useCallback(async (originLat: number, originLng: number) => {
    if (!destination) return;
    setRouteLoading(true);
    setRouteError(false);
    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${originLng},${originLat};${destination[1]},${destination[0]}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('route_failed');
      const data: RouteResponse = await response.json();
      const route = data.routes?.[0];
      const coordinates = route?.geometry?.coordinates;
      if (!validCoordinates(currentPositionRef.current.lat, currentPositionRef.current.lng)) return;
      if (data.code !== 'Ok' || !route || !coordinates || coordinates.length < 2 || !mapRef.current) throw new Error('route_failed');
      const line = coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
      routeRef.current?.removeFrom(mapRef.current);
      routeRef.current = L.polyline(line, { color: '#0f766e', weight: 6, opacity: .85, lineCap: 'round', lineJoin: 'round' }).addTo(mapRef.current);
      setRemainingMeters(route.distance);
      setDurationSeconds(route.duration);
      lastRouteOriginRef.current = [originLat, originLng];
    } catch {
      setRouteError(true);
    } finally {
      setRouteLoading(false);
    }
  }, [destination]);

  // Pickup marker
  useEffect(() => {
    if (!mapRef.current || !destination) return;
    if (!pickupMarkerRef.current) pickupMarkerRef.current = L.marker(destination, { icon: pickupMarkerIcon(), zIndexOffset: 500 }).addTo(mapRef.current);
    else pickupMarkerRef.current.setLatLng(destination);
  }, [destination]);

  // Route loading + live updates
  useEffect(() => {
    if (!destination || userLat == null || userLng == null) {
      routeRef.current?.remove(); routeRef.current = null;
      lastRouteOriginRef.current = null; setRemainingMeters(null); setDurationSeconds(null);
      return;
    }
    const lastOrigin = lastRouteOriginRef.current;
    const needsNewRoute = !lastOrigin || haversineDistance(lastOrigin[0], lastOrigin[1], userLat, userLng) > 0.12;
    if (needsNewRoute && !routeLoading) void loadRoute(userLat, userLng);
  }, [destination, loadRoute, routeLoading, userLat, userLng]);

  // Proximity detection
  useEffect(() => {
    if (!destination || userLat == null || userLng == null || remainingMeters == null) {
      setProximityAlert(null);
      return;
    }
    const dist = haversineDistance(userLat, userLng, destination[0], destination[1]);
    if (dist <= 0.05) setProximityAlert(copy.arrived);
    else if (dist <= 0.2) setProximityAlert(copy.approaching);
    else setProximityAlert(null);
  }, [destination, userLat, userLng, remainingMeters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup route when handover ends
  useEffect(() => {
    if (!activeHandover && routeRef.current && mapRef.current) {
      routeRef.current.removeFrom(mapRef.current);
      routeRef.current = null;
      lastRouteOriginRef.current = null;
      setRemainingMeters(null);
      setDurationSeconds(null);
    }
    if (!activeHandover && pickupMarkerRef.current && mapRef.current) {
      pickupMarkerRef.current.removeFrom(mapRef.current);
      pickupMarkerRef.current = null;
    }
  }, [activeHandover]);

  const formatDuration = (seconds: number | null): string => {
    if (seconds == null) return '—';
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} ${copy.min}`;
  };

  const handleReceived = async () => {
    if (!activeHandover || !onAdvanceRequest || advancing) return;
    setAdvancing(true);
    await onAdvanceRequest(activeHandover, 'RECEIVED');
    setAdvancing(false);
  };

  const handleCancel = async () => {
    if (!activeHandover || !onCancelRequest || cancelling) return;
    if (!confirm(copy.cancelConfirm)) return;
    setCancelling(true);
    await onCancelRequest(activeHandover);
    setCancelling(false);
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

  const expiryTime = (expiresAt: string) => new Date(expiresAt).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="map-container donor-map" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="map-canvas" ref={mapNodeRef} />
      <div className="donor-search-bar">
        <Search size={18} />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchPlaces(); }} placeholder={copy.search} />
        {searching && <span className="map-search-spinner" />}
        {searchQuery && !searching && <button onClick={() => setSearchQuery('')} aria-label={copy.close}><X size={15} /></button>}
      </div>
      <div className="donor-brand-pill"><img src={import.meta.env.BASE_URL+'image.png'} alt="SHARek" /></div>
      <div className="donor-map-actions">
        <button className="map-control-btn" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in"><Plus size={18} /></button>
        <button className="map-control-btn" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out"><Minus size={18} /></button>
      </div>
      <button className="donor-location-btn" onClick={recenter} aria-label="Current location"><LocateFixed size={20} /></button>
      {locationError ? <div className="map-location-error" role="alert"><span>{locationMessage(locationError, isAr)}</span><button onClick={onRetryLocation}>{locationError==='services_off'?(isAr?'تشغيل الموقع':'Turn on location'):locationError==='denied'?(isAr?'السماح بالموقع':'Allow location'):copy.retry}</button></div> : userLat != null && <div className="map-location-error" role="status"><span>{areaName || (isAr ? 'اسم المنطقة غير متاح حاليًا' : 'Area name currently unavailable')}{locationAccuracy != null ? ` · ±${Math.round(locationAccuracy)} ${isAr ? 'م' : 'm'}` : ''}</span></div>}
      <div className="donor-primary-action">{primaryAction}</div>

      {activeHandover?.sharing_mode === 'direct' && <div className="route-info-card"><strong>{isAr ? 'حجز استلام مباشر مؤكد' : 'Confirmed direct pickup'}</strong><p>{isAr ? 'استخدم موقعك أثناء فتح الملاحة لحساب الطريق إلى نقطة الطعام الثابتة عبر خدمة التوجيه.' : 'Use your location while navigation is open to find a walking route to the fixed food pickup point.'}</p><button className="smart-pickup-start-nav" onClick={() => setDirectNavOpen(true)}>{isAr ? 'ابدأ الطريق إلى الوجبة' : 'Start route to the meal'}</button></div>}
      {directNavOpen && activeHandover?.sharing_mode === 'direct' && <DirectPickupNavigation language={language} request={activeHandover} profileId={currentUserId ?? ''} onClose={() => setDirectNavOpen(false)} />}
      {/* Route card for active handover (beneficiary) */}
      {activeHandover && destination && (
        <div className="route-info-card">
          <div className="route-info-header">
            <span className="route-info-icon"><Navigation size={16} /></span>
            <div className="route-info-text">
              <strong>{remainingMeters != null ? formatDistance(remainingMeters / 1000, language) : '—'} · {formatDuration(durationSeconds)}</strong>
              <small>{copy.routeTitle}</small>
            </div>
            <span className="route-info-badge">{activeHandover.sharing_mode === 'direct' ? (isAr ? 'حجز مؤكد' : 'Reserved') : copy.reserveDone}</span>
          </div>
          {routeLoading && <div className="route-info-updating"><RefreshCw size={12} />{copy.routeUpdating}</div>}
          {routeError && <div className="route-info-error"><span>{copy.routeFailed}</span><button onClick={() => { if (userLat != null && userLng != null) void loadRoute(userLat, userLng); }}>{copy.retry}</button></div>}
          <div className="route-info-actions">
            {onOpenChat && <button className="route-info-btn chat" onClick={() => onOpenChat(activeHandover)}><MessageCircle size={16} />{copy.openChat}</button>}
            {onCancelRequest && <button className="route-info-btn cancel" onClick={() => void handleCancel()} disabled={cancelling}>{cancelling ? '...' : copy.cancelReq}</button>}
          </div>
          {proximityAlert && <div className="route-proximity-alert">{proximityAlert}</div>}
          {proximityAlert === copy.arrived && onAdvanceRequest && (
            <button className="route-info-btn received" onClick={() => void handleReceived()} disabled={advancing}>
              <Check size={16} />{advancing ? '...' : copy.received}
            </button>
          )}
        </div>
      )}

      {/* Compact meal bottom sheet (beneficiary, no handover) */}
      {!isDonor && selectedMeal && !activeHandover && (
        <div className="meal-compact-sheet" dir={isAr ? 'rtl' : 'ltr'}>
          <button className="meal-compact-close" onClick={() => setSelectedMeal(null)} aria-label={copy.close}><X size={16} /></button>
          <div className="meal-compact-body">
            <div className="meal-compact-photo">
              {selectedMeal.photo_url ? <img src={selectedMeal.photo_url} alt={selectedMeal.name} /> : <span className="meal-compact-placeholder"><Utensils size={24} /></span>}
            </div>
            <div className="meal-compact-info">
              <h3>{selectedMeal.name}</h3>
              <div className="meal-compact-provider">
                {selectedMeal.donor_avatar ? <img src={selectedMeal.donor_avatar} alt="" /> : <span className="meal-compact-avatar"><Heart size={14} fill="currentColor" /></span>}
                <span>{selectedMeal.donor_name || copy.helper}</span>
                {selectedMeal.donor_verified && <BadgeCheck size={14} className="community-verified" />}
                <span className="meal-compact-rating"><Star size={11} fill="currentColor" />{selectedMeal.donor_rating > 0 ? selectedMeal.donor_rating.toFixed(1) : copy.new_}</span>
              </div>
              <div className="meal-compact-stats">
                <span><strong>{selectedMeal.quantity}</strong> {copy.meals}</span>
                <span><MapPin size={12} /> {mealDistance(selectedMeal, userLat, userLng) != null ? formatDistance(mealDistance(selectedMeal, userLat, userLng)!, language) : userLat == null || userLng == null ? copy.noLocation : (isAr ? 'المسافة غير متاحة' : 'Distance unavailable')}</span>
                <span className="meal-sharing-badge">{sharingLabel(selectedMeal.sharing_mode, language)}</span><span className="meal-compact-countdown"><Clock size={12} /> {timeLeft(mealDeadline(selectedMeal))}</span>
              </div>
              <div className="meal-compact-expiry">{copy.expiresAt} {expiryTime(mealDeadline(selectedMeal))}</div>
            </div>
          </div>
          {reserveMsg && <div className="meal-compact-msg">{reserveMsg}</div>}
          <div className="meal-compact-actions">
            <button className="meal-compact-details" onClick={() => setShowMealDetails(true)}>{isAr ? 'عرض التفاصيل' : 'View details'}</button>
            <button className="meal-compact-reserve" onClick={() => setConfirmingReserve(true)} disabled={reserving || new Date(mealDeadline(selectedMeal)).getTime() <= now}>
              {reserving ? copy.reserving : selectedMeal.sharing_mode === 'direct' ? (isAr ? 'احجز الوجبة للاستلام' : 'Reserve for pickup') : copy.requestMeal}
            </button>
          </div>
        </div>
      )}

      {confirmingReserve && selectedMeal && (
        <div className="modal-overlay" onClick={() => setConfirmingReserve(false)}>
          <div className="modal-card meal-request-confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="meal-request-confirm-cover">
              {selectedMeal.photo_url ? <img src={selectedMeal.photo_url} alt={selectedMeal.name} /> : <Utensils size={28} />}
            </div>
            <h3>{selectedMeal.sharing_mode === 'direct' ? (isAr ? 'تأكيد الحجز بدون انتظار موافقة؟' : 'Confirm reservation without waiting for approval?') : copy.confirmRequest}</h3>
            <strong className="meal-request-confirm-name">{selectedMeal.name}</strong>
            <div className="meal-request-confirm-meta">
              <span>{copy.meals}<b>{selectedMeal.quantity}</b></span>
              <span>{copy.remaining}<b>{timeLeft(mealDeadline(selectedMeal))}</b></span>
              <span>{copy.helper}<b>{selectedMeal.donor_name || copy.helper}</b></span>
            </div>
            <div className="meal-request-confirm-actions">
              <button className="text-button" onClick={() => setConfirmingReserve(false)}>{copy.cancel}</button>
              <button className="primary-button" onClick={() => void handleReserveMeal()}>{copy.confirm}<Check size={16} /></button>
            </div>
          </div>
        </div>
      )}
      {showMealDetails && selectedMeal && <MealDetail language={language} mealId={selectedMeal.id} isOwn={selectedMeal.is_own} currentUserId={currentUserId} userLat={userLat} userLng={userLng} onBack={() => setShowMealDetails(false)} onReserve={onReserveMeal} onMessageDonor={onMessageDonor ? async (id, donorId) => { const result = await onMessageDonor(id, donorId); if (result.ok) setShowMealDetails(false); return result; } : undefined} />}
      {selectedDonorMeal && <MealDetail language={language} mealId={selectedDonorMeal.id} isOwn userLat={userLat} userLng={userLng} onBack={() => setSelectedDonorMeal(null)} />}

      <div className="map-home-content">
        {receiptFollowups}
        {selectedRequest ? (
          <div className="request-detail-view">
            <div className="request-detail-top"><span className="request-detail-label"><Heart size={15} fill="currentColor" />{copy.details}</span><button onClick={() => setSelectedRequest(null)} aria-label={copy.close}><X size={17} /></button></div>
            <h2 className="request-person">{requestProfile?.avatar_url&&<img src={requestProfile.avatar_url} alt=""/>}{requestProfile?.display_name||copy.anonymous}</h2>
            <div className="request-detail-grid">
              <div><b>{selectedRequest.quantity_requested}</b><span>{copy.meals}</span></div>
              <div><b>{requestDistance(selectedRequest, userLat, userLng) != null ? formatDistance(requestDistance(selectedRequest, userLat, userLng)!, language) : '—'}</b><span>{copy.nearby}</span></div>
              <div><b>{copy.nearbyArea}</b><span>{copy.status}</span></div>
            </div>
            <div className="request-detail-row"><ClockIcon /><span>{copy.requestTime}</span><b>{new Date(selectedRequest.requested_time).toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' })}</b></div>
            <div className="request-detail-row"><MapPin size={15} /><span>{copy.status}</span><b>{selectedRequest.status === 'PENDING' ? (isAr ? 'بانتظار الموافقة' : 'Awaiting approval') : selectedRequest.status === 'SEARCHING' ? copy.searching : selectedRequest.sharing_mode === 'direct' ? (isAr ? 'حجز استلام مباشر مؤكد' : 'Confirmed direct pickup') : (isAr ? 'طلب مقبول للاستلام' : 'Accepted for pickup')}</b></div>
            {isDonor && selectedRequest.donor_id === currentUserId && selectedRequest.pickup_latitude != null && selectedRequest.pickup_longitude != null && <button className="request-accept-btn" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedRequest.pickup_latitude},${selectedRequest.pickup_longitude}`, '_blank', 'noopener,noreferrer')}><Navigation size={16} />{isAr ? 'افتح المسار إلى نقطة الاستلام' : 'Open route to pickup point'}</button>}
            {acceptMessage && <div className="request-feedback">{acceptMessage}</div>}
            {isDonor && selectedRequest.status === 'PENDING' && <div className="request-detail-actions"><button className="request-accept-btn" onClick={() => void handleAccept()} disabled={accepting}>{accepting ? '...' : copy.accept}</button>{onRejectRequest && <button className="request-reject-btn" onClick={() => void handleReject()} disabled={accepting}>{accepting ? '...' : (isAr ? 'رفض الطلب' : 'Reject request')}</button>}</div>}
            {isDonor && selectedRequest.status === 'SEARCHING' && <button className="request-accept-btn" onClick={() => void handleAccept()} disabled={accepting}>{accepting ? '...' : copy.accept}</button>}
            <button className="request-close-btn" onClick={() => setSelectedRequest(null)}>{copy.close}</button>
          </div>
        ) : (
          <>
            {isDonor && <div className="donor-view-tabs"><button className={donorView === 'meals' ? 'active' : ''} onClick={() => setDonorView('meals')}>{isAr ? 'وجباتي المنشورة' : 'My published meals'}</button><button className={donorView === 'requests' ? 'active' : ''} onClick={() => setDonorView('requests')}>{isAr ? 'طلبات المساعدة' : 'Help requests'}</button></div>}
            <div className="map-feed-header"><div><span>SHARek community</span><h2>{isDonor && donorView === 'meals' ? (isAr ? 'وجباتي المنشورة' : 'My published meals') : isDonor ? copy.nearbyRequests : (isAr ? 'وجبات متاحة بالقرب منك' : 'Meals available near you')}</h2></div></div>
            {isDonor && donorView === 'meals' ? <div className="donor-request-list">{donorMeals.length === 0 ? <div className="donor-empty-state"><span><Utensils size={21} /></span><h3>{isAr ? 'لم تنشر وجبات بعد' : 'No meals published yet'}</h3><p>{isAr ? 'استخدم زر مشاركة الطعام لإضافة أول وجبة.' : 'Use the share food button to add your first meal.'}</p></div> : donorMeals.map((meal) => <div key={meal.id}><button className="donor-published-meal" onClick={() => setSelectedDonorMeal(meal)}><span className="donor-published-meal-thumb">{meal.photo_url ? <img src={meal.photo_url} alt={meal.name} /> : <Utensils size={18} />}</span><span className="request-card-info"><b>{meal.name}</b><small><i className={`meal-status-dot ${meal.status.toLowerCase()}`} />{new Date(mealDeadline(meal)).getTime() <= now ? (isAr ? 'منتهية' : 'Expired') : meal.status === 'RESERVED' ? (isAr ? 'محجوزة' : 'Reserved') : (isAr ? 'متاحة' : 'Available')} · {timeLeft(mealDeadline(meal))}</small></span><span className="request-card-quantity"><strong>{Math.max(0, meal.quantity - (meal.reserved_quantity ?? 0))}</strong><small>{copy.meals}</small></span></button><MealShareButton mealId={meal.id} language={language}/></div>)}</div> : isDonor ? <div className="donor-request-list">{sortedRequests.length === 0 ? <div className="donor-empty-state"><span><Utensils size={21} /></span><h3>{copy.empty}</h3><p>{copy.emptySub}</p></div> : sortedRequests.map((request) => { const distance = requestDistance(request, userLat, userLng); const urgent = new Date(request.expires_at).getTime() - Date.now() < 30 * 60 * 1000; return <button className={`donor-request-card ${selectedMarkerId === request.id ? 'selected' : ''}`} key={request.id} onClick={() => focusRequest(request)}><span className="request-card-heart"><Heart size={20} fill="currentColor" /></span><span className="request-card-info"><b>{copy.anonymous}</b><small>{copy.nearbyArea}</small><em><MapPin size={12} />{distance != null ? formatDistance(distance, language) : copy.nearby}</em></span><span className="request-card-quantity"><strong>{request.quantity_requested}</strong><small>{copy.meals}</small>{urgent && <i>{copy.urgent}</i>}</span></button>; })}</div> : <div className="donor-request-list">{visibleMeals.length === 0 ? <div className="donor-empty-state"><span><Utensils size={21} /></span><h3>{copy.empty}</h3><p>{copy.emptySub}</p></div> : visibleMeals.map((meal) => <button className={`beneficiary-meal-card ${selectedMarkerId === meal.id ? 'selected' : ''}`} key={meal.id} onClick={() => focusMeal(meal)}>{meal.photo_url ? <img src={meal.photo_url} alt={meal.name} /> : <span className="request-card-heart"><Utensils size={20} /></span>}<span className="request-card-info"><b>{meal.name}</b><small>{sharingLabel(meal.sharing_mode, language)} · {collectionLabel(meal.collection_state, language)}</small><small><MapPin size={12} /> {mealDistance(meal, userLat, userLng) != null ? formatDistance(mealDistance(meal, userLat, userLng)!, language) : (userLat == null || userLng == null ? copy.noLocation : (isAr ? 'المسافة غير متاحة' : 'Distance unavailable'))} · {meal.quantity} {copy.meals}</small><em><Clock size={12} />{copy.remaining} {timeLeft(mealDeadline(meal))}</em></span></button>)}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function ClockIcon() { return <span className="clock-icon" aria-hidden="true" />; }
