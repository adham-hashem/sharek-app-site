import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, LocateFixed, MapPin, Navigation, RefreshCw } from 'lucide-react';
import L, { type Map as LeafletMap, type Marker as LeafletMarker, type Polyline as LeafletPolyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistance, haversineDistance, type Language, type MealRequest } from '@/lib/supabase';

type Props = {
  language: Language;
  request: MealRequest;
  userLat: number | null;
  userLng: number | null;
  locationError: string | null;
  onRetryLocation: () => void;
};

type RouteResponse = {
  code?: string;
  routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: Array<[number, number]> } }>;
};

function currentMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'beneficiary-current-icon',
    html: '<span><i></i></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
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

export function BeneficiaryNavigation({ language, request, userLat, userLng, locationError, onRetryLocation }: Props) {
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const currentMarkerRef = useRef<LeafletMarker | null>(null);
  const pickupMarkerRef = useRef<LeafletMarker | null>(null);
  const routeRef = useRef<LeafletPolyline | null>(null);
  const lastRouteOriginRef = useRef<[number, number] | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const [remainingMeters, setRemainingMeters] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const isAr = language === 'ar';
  const destination = useMemo(() => request.pickup_latitude != null && request.pickup_longitude != null ? [request.pickup_latitude, request.pickup_longitude] as [number, number] : null, [request.pickup_latitude, request.pickup_longitude]);

  const copy = {
    title: isAr ? 'طريق استلام وجبتك' : 'Route to your pickup',
    remaining: isAr ? 'متبقي' : 'remaining',
    walking: isAr ? 'مشي تقريبًا' : 'approx. walk',
    returnToMe: isAr ? 'العودة لموقعي' : 'Return to my location',
    noRoute: isAr ? 'تعذر حساب الطريق الآن' : 'Could not calculate the route right now',
    retry: isAr ? 'إعادة المحاولة' : 'Retry',
    location: isAr ? 'فعّل موقعك لبدء الملاحة' : 'Enable your location to start navigation',
    destination: isAr ? 'نقطة الاستلام' : 'Pickup point',
    status: isAr ? 'جاري الاستلام' : 'Pickup in progress',
  };

  const recenter = useCallback(() => {
    if (!mapRef.current || userLat == null || userLng == null) {
      onRetryLocation();
      return;
    }
    setFollowUser(true);
    mapRef.current.flyTo([userLat, userLng], 16, { duration: .45 });
  }, [onRetryLocation, userLat, userLng]);

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
      if (data.code !== 'Ok' || !route || !coordinates || coordinates.length < 2 || !mapRef.current) throw new Error('route_failed');
      const line = coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
      routeRef.current?.removeFrom(mapRef.current);
      routeRef.current = L.polyline(line, { color: '#2f82ff', weight: 7, opacity: .88, lineCap: 'round', lineJoin: 'round' }).addTo(mapRef.current);
      setRemainingMeters(route.distance);
      setDurationSeconds(route.duration);
      lastRouteOriginRef.current = [originLat, originLng];
    } catch {
      setRouteError(true);
    } finally {
      setRouteLoading(false);
    }
  }, [destination]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    const center: L.LatLngExpression = userLat != null && userLng != null ? [userLat, userLng] : [30.0444, 31.2357];
    const map = L.map(mapNodeRef.current, { zoomControl: false, attributionControl: true }).setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    L.control.zoom({ position: isAr ? 'topleft' : 'topright' }).addTo(map);
    map.on('dragstart', () => setFollowUser(false));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [isAr, userLat, userLng]);

  useEffect(() => {
    if (!mapRef.current || !destination) return;
    if (!pickupMarkerRef.current) pickupMarkerRef.current = L.marker(destination, { icon: pickupMarkerIcon(), zIndexOffset: 500 }).addTo(mapRef.current);
    else pickupMarkerRef.current.setLatLng(destination);
  }, [destination]);

  useEffect(() => {
    if (!mapRef.current || userLat == null || userLng == null) return;
    const position: L.LatLngExpression = [userLat, userLng];
    if (!currentMarkerRef.current) currentMarkerRef.current = L.marker(position, { icon: currentMarkerIcon(), zIndexOffset: 1000 }).addTo(mapRef.current);
    else currentMarkerRef.current.setLatLng(position);
    if (followUser) mapRef.current.panTo(position, { animate: true, duration: .35 });
    if (destination) {
      const lastOrigin = lastRouteOriginRef.current;
      const needsNewRoute = !lastOrigin || haversineDistance(lastOrigin[0], lastOrigin[1], userLat, userLng) > .12;
      if (needsNewRoute && !routeLoading) void loadRoute(userLat, userLng);
    }
  }, [destination, followUser, loadRoute, routeLoading, userLat, userLng]);

  const formatDuration = (seconds: number | null): string => {
    if (seconds == null) return '—';
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} ${isAr ? 'د' : 'min'}`;
  };

  return <section className="beneficiary-navigation" dir={isAr ? 'rtl' : 'ltr'}>
    <div className="beneficiary-nav-map" ref={mapNodeRef} />
    <div className="beneficiary-nav-topbar"><button onClick={() => window.history.back()} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={19} /></button><div><span>{copy.status}</span><b>{copy.title}</b></div><span className="nav-status-dot" /></div>
    <div className="beneficiary-nav-summary"><span className="nav-summary-icon"><Navigation size={19} /></span><div><strong>{remainingMeters != null ? formatDistance(remainingMeters / 1000, language) : '—'}</strong><small>{copy.remaining}</small></div><div className="nav-summary-time"><strong>{formatDuration(durationSeconds)}</strong><small>{copy.walking}</small></div></div>
    {routeLoading && <div className="nav-route-loading"><RefreshCw size={14} />{isAr ? 'جارٍ تحديث الطريق...' : 'Updating route...'}</div>}
    {routeError && <div className="nav-route-error"><span>{copy.noRoute}</span><button onClick={() => { if (userLat != null && userLng != null) void loadRoute(userLat, userLng); }}>{copy.retry}</button></div>}
    {locationError && <div className="nav-location-error"><MapPin size={15} /><span>{copy.location}</span><button onClick={onRetryLocation}>{copy.retry}</button></div>}
    {!followUser && <button className="nav-recenter" onClick={recenter}><LocateFixed size={16} />{copy.returnToMe}</button>}
    <div className="beneficiary-nav-bottom"><div className="nav-destination"><span><MapPin size={17} /></span><div><small>{copy.destination}</small><b>{isAr ? 'نقطة الاستلام الخاصة' : 'Private pickup location'}</b></div></div><div className="nav-privacy">{isAr ? 'تظهر التفاصيل للمشاركين في الطلب فقط' : 'Visible only to participants in this request'}</div></div>
  </section>;
}
