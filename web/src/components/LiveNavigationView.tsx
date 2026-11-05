import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LocateFixed, MapPin, Minus, Navigation, Plus, RefreshCw, X } from 'lucide-react';
import L, { type Circle as LeafletCircle, type Map as LeafletMap, type Marker as LeafletMarker, type Polyline as LeafletPolyline } from 'leaflet';
import { haversineDistance, formatDistance, supabase, type Language, type MealRequest, type PickupLocation } from '@/lib/supabase';

type Props = {
  language: Language;
  request: MealRequest;
  profileId: string;
  userLat: number | null;
  userLng: number | null;
  pickupLat: number;
  pickupLng: number;
  onClose: () => void;
  onProximity?: (nearby: boolean, distanceM: number | null) => void;
};

type RouteResponse = {
  code?: string;
  routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: Array<[number, number]> } }>;
};

const PROXIMITY_RADIUS_M = 100;
const APPROACH_RADIUS_M = 200;
const OFF_ROUTE_THRESHOLD_M = 50;
const REROUTE_INTERVAL_MS = 8000;
const WALKING_SPEED_MPS = 1.4;
const MARKER_INTERP_MS = 800;

function activationSound(): void {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  const muted = window.localStorage.getItem('sharek-search-muted') === 'true';
  if (muted) return;
  const ctx = new window.AudioContext();
  const freqs = [659, 784, 1047];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.09;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.24);
  });
  window.setTimeout(() => void ctx.close(), 800);
}

function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function nearestPointOnRoute(routePoints: [number, number][], lat: number, lng: number): { index: number; dist: number } {
  let minDist = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < routePoints.length; i++) {
    const d = haversineDistance(lat, lng, routePoints[i][0], routePoints[i][1]) * 1000;
    if (d < minDist) { minDist = d; nearestIdx = i; }
  }
  return { index: nearestIdx, dist: minDist };
}

export function LiveNavigationView({ language, request, profileId, userLat, userLng, pickupLat, pickupLng, onClose, onProximity }: Props) {
  const isAr = language === 'ar';
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const accuracyCircleRef = useRef<LeafletCircle | null>(null);
  const pickupMarkerRef = useRef<LeafletMarker | null>(null);
  const partnerMarkerRef = useRef<LeafletMarker | null>(null);
  const routeFullRef = useRef<LeafletPolyline | null>(null);
  const routeRemainingRef = useRef<LeafletPolyline | null>(null);
  const routeCompletedRef = useRef<LeafletPolyline | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastRerouteRef = useRef<number>(0);
  const soundPlayedRef = useRef(false);
  const autoFollowRef = useRef(true);
  const userInteractedRef = useRef(false);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const routePointsRef = useRef<[number, number][]>([]);
  const interpAnimRef = useRef<number | null>(null);
  const lastUploadRef = useRef<number>(0);
  const proximityFiredRef = useRef(false);
  const approachFiredRef = useRef(false);

  const [navActive, setNavActive] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);
  const [remainingM, setRemainingM] = useState<number | null>(null);
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const [proximityAlert, setProximityAlert] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'ok' | 'denied' | 'searching' | 'weak'>('searching');
  const [autoFollow, setAutoFollow] = useState(true);
  const [partnerLocation, setPartnerLocation] = useState<PickupLocation | null>(null);

  const isDonor = request.donor_id === profileId;
  const partnerId = isDonor ? request.requester_id : request.donor_id;

  const copy = {
    title: isAr ? 'التنقل المباشر' : 'Live navigation',
    remaining: isAr ? 'متبقي' : 'remaining',
    min: isAr ? 'دقائق' : 'min',
    searchingLocation: isAr ? 'جاري تحديد موقعك...' : 'Locating you...',
    locationDenied: isAr ? 'تم رفض إذن الموقع' : 'Location permission denied',
    locationWeak: isAr ? 'إشارة GPS ضيفة' : 'Weak GPS signal',
    routeFailed: isAr ? 'تعذر حساب الطريق' : 'Could not calculate route',
    retry: isAr ? 'إعادة' : 'Retry',
    approaching: isAr ? 'اقتربت من نقطة الاستلام' : 'Approaching pickup point',
    nearby: isAr ? 'أنت بالقرب من نقطة الاستلام' : 'You are near the pickup point',
    backToMe: isAr ? 'العودة إلى موقعي' : 'Back to my location',
    close: isAr ? 'إغلاق' : 'Close',
    pickup: isAr ? 'نقطة الاستلام' : 'Pickup point',
    you: isAr ? 'أنت' : 'You',
    helper: isAr ? 'المساعد' : 'Helper',
    updating: isAr ? 'جارٍ تحديث الطريق...' : 'Updating route...',
    rerouting: isAr ? 'إعادة حساب الطريق...' : 'Rerouting...',
    locUpdateFail: isAr ? 'تعذر تحديث الموقع مؤقتًا' : 'Location update temporarily unavailable',
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    const startLat = userLat ?? pickupLat;
    const startLng = userLng ?? pickupLng;
    const map = L.map(mapNodeRef.current, { zoomControl: false, attributionControl: true, dragging: true, minZoom: 3 }).setView([startLat, startLng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

    // Stop auto-follow when user drags
    map.on('dragstart', () => { userInteractedRef.current = true; setAutoFollow(false); autoFollowRef.current = false; });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [userLat, userLng, pickupLat, pickupLng]);

  // Pickup marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const icon = L.divIcon({
      className: 'live-nav-pickup-icon',
      html: '<span class="live-nav-pickup-pin"><svg viewBox="0 0 24 24"><path d="M20.8 8.6c0 5.1-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.6A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.3Z" fill="#f06427"/></svg></span>',
      iconSize: [40, 48],
      iconAnchor: [20, 48],
    });
    if (!pickupMarkerRef.current) pickupMarkerRef.current = L.marker([pickupLat, pickupLng], { icon, zIndexOffset: 500 }).addTo(map);
    else pickupMarkerRef.current.setLatLng([pickupLat, pickupLng]);
  }, [pickupLat, pickupLng]);

  // Subscribe to partner location
  useEffect(() => {
    if (!partnerId) return;
    const channel = supabase.channel(`live-nav-partner-${request.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_locations', filter: `request_id=eq.${request.id}` }, (payload) => {
        const loc = payload.new as PickupLocation;
        if (loc.user_id === partnerId && loc.is_active) setPartnerLocation(loc);
        else if (loc.user_id === partnerId && !loc.is_active) setPartnerLocation(null);
      })
      .subscribe();
    void supabase.from('pickup_locations').select('*').eq('request_id', request.id).eq('user_id', partnerId).eq('is_active', true).order('last_updated', { ascending: false }).limit(1).maybeSingle().then(({ data }) => { if (data) setPartnerLocation(data as PickupLocation); });
    return () => { void supabase.removeChannel(channel); };
  }, [request.id, partnerId]);

  // Update partner marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !partnerLocation) {
      if (partnerMarkerRef.current && map) { partnerMarkerRef.current.removeFrom(map); partnerMarkerRef.current = null; }
      return;
    }
    const icon = L.divIcon({
      className: 'live-nav-partner-icon',
      html: '<span class="live-nav-partner-pin"><svg viewBox="0 0 24 24"><circle cx="12" cy="10" r="6" fill="#6e9343"/><path d="M12 4v2M12 14v6" stroke="#6e9343" stroke-width="2"/></svg></span>',
      iconSize: [32, 40],
      iconAnchor: [16, 36],
    });
    if (!partnerMarkerRef.current) partnerMarkerRef.current = L.marker([partnerLocation.latitude, partnerLocation.longitude], { icon, zIndexOffset: 400 }).addTo(map);
    else partnerMarkerRef.current.setLatLng([partnerLocation.latitude, partnerLocation.longitude]);
  }, [partnerLocation]);

  // Calculate route via OSRM
  const calculateRoute = useCallback(async (originLat: number, originLng: number) => {
    setRouteLoading(true);
    setRouteError(false);
    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${originLng},${originLat};${pickupLng},${pickupLat}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('route_failed');
      const data: RouteResponse = await response.json();
      const route = data.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (data.code !== 'Ok' || !route || !coords || coords.length < 2 || !mapRef.current) throw new Error('route_failed');
      const points: [number, number][] = coords.map(([lng, lat]) => [lat, lng]);
      routePointsRef.current = points;

      // Clear old polylines
      routeFullRef.current?.removeFrom(mapRef.current);
      routeRemainingRef.current?.removeFrom(mapRef.current);
      routeCompletedRef.current?.removeFrom(mapRef.current);

      // Full route (dim background)
      routeFullRef.current = L.polyline(points, { color: '#d4c4b8', weight: 5, opacity: 0.4, lineCap: 'round', lineJoin: 'round' }).addTo(mapRef.current);
      // Remaining route (prominent)
      routeRemainingRef.current = L.polyline(points, { color: '#f06427', weight: 6, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(mapRef.current);
      // Completed route (traveled portion)
      routeCompletedRef.current = L.polyline([], { color: '#6e9343', weight: 5, opacity: 0.5, lineCap: 'round', lineJoin: 'round', dashArray: '8 6' }).addTo(mapRef.current);

      setRemainingM(Math.round(route.distance));
      setEtaMin(Math.max(1, Math.round(route.duration / 60)));

      // Fit bounds to show route
      if (autoFollowRef.current) {
        const bounds = L.latLngBounds(points);
        mapRef.current.fitBounds(bounds, { padding: [60, 120] });
      }
    } catch {
      setRouteError(true);
    } finally {
      setRouteLoading(false);
    }
  }, [pickupLat, pickupLng]);

  // Update route progress (split completed vs remaining)
  const updateRouteProgress = useCallback((lat: number, lng: number) => {
    const routePoints = routePointsRef.current;
    if (routePoints.length < 2 || !routeRemainingRef.current || !routeCompletedRef.current || !mapRef.current) return;

    const nearest = nearestPointOnRoute(routePoints, lat, lng);
    const idx = nearest.index;

    // Split route at nearest point
    const completedPoints = routePoints.slice(0, idx + 1);
    const remainingPoints = routePoints.slice(idx);

    // Update current position to nearest route point (snap to road)
    if (nearest.dist < 15) {
      routeRemainingRef.current.setLatLngs(remainingPoints);
      routeCompletedRef.current.setLatLngs(completedPoints);
    } else {
      // User is off-route — keep showing full remaining from their position
      routeRemainingRef.current.setLatLngs([[lat, lng], ...remainingPoints]);
      routeCompletedRef.current.setLatLngs(completedPoints);
    }

    // Recalculate remaining distance along route
    let remDist = 0;
    const effectiveRemaining = nearest.dist < 15 ? remainingPoints : [[lat, lng] as [number, number], ...remainingPoints];
    for (let i = 1; i < effectiveRemaining.length; i++) {
      remDist += haversineDistance(effectiveRemaining[i - 1][0], effectiveRemaining[i - 1][1], effectiveRemaining[i][0], effectiveRemaining[i][1]) * 1000;
    }
    setRemainingM(Math.round(remDist));
    setEtaMin(Math.max(1, Math.round(remDist / WALKING_SPEED_MPS / 60)));
  }, []);

  // Smooth marker interpolation
  const animateMarker = useCallback((marker: LeafletMarker, fromLat: number, fromLng: number, toLat: number, toLng: number) => {
    if (interpAnimRef.current) window.cancelAnimationFrame(interpAnimRef.current);
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / MARKER_INTERP_MS);
      // ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const lat = fromLat + (toLat - fromLat) * eased;
      const lng = fromLng + (toLng - fromLng) * eased;
      marker.setLatLng([lat, lng]);
      if (t < 1) interpAnimRef.current = window.requestAnimationFrame(animate);
    };
    interpAnimRef.current = window.requestAnimationFrame(animate);
  }, []);

  // Start geolocation watch
  useEffect(() => {
    if (!navigator.geolocation) { setLocationStatus('denied'); return; }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const map = mapRef.current;
        if (!map) return;

        setLocationStatus(accuracy > 50 ? 'weak' : 'ok');
        if (accuracy > 50) {
          // Still use the position but show weak indicator
        }

        // Play activation sound once
        if (!soundPlayedRef.current) {
          soundPlayedRef.current = true;
          activationSound();
          navigator.vibrate?.([60, 40, 80]);
        }

        // Create or update user marker
        if (!userMarkerRef.current) {
          const icon = L.divIcon({
            className: 'live-nav-user-icon',
            html: '<span class="live-nav-user-dot"><span class="live-nav-user-pulse"></span></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          userMarkerRef.current = L.marker([newLat, newLng], { icon, zIndexOffset: 1000 }).addTo(map);
        } else {
          const current = userMarkerRef.current.getLatLng();
          animateMarker(userMarkerRef.current, current.lat, current.lng, newLat, newLng);
        }
        currentPosRef.current = { lat: newLat, lng: newLng };

        // Accuracy circle
        const accRadius = Math.max(15, accuracy ?? 50);
        if (!accuracyCircleRef.current) accuracyCircleRef.current = L.circle([newLat, newLng], { radius: accRadius, color: '#2563eb', weight: 1, opacity: 0.25, fillColor: '#2563eb', fillOpacity: 0.08 }).addTo(map);
        else accuracyCircleRef.current.setLatLng([newLat, newLng]).setRadius(accRadius);

        // Auto-follow camera
        if (autoFollowRef.current) {
          map.panTo([newLat, newLng], { animate: true, duration: 0.8 });
        }

        // Upload to backend (throttled)
        const now = Date.now();
        if (now - lastUploadRef.current > 5000) {
          lastUploadRef.current = now;
          void supabase.rpc('update_pickup_location', { p_request_id: request.id, p_latitude: newLat, p_longitude: newLng, p_heading: pos.coords.heading ?? null });
        }

        // Update route progress
        if (routePointsRef.current.length > 1) {
          updateRouteProgress(newLat, newLng);
        }

        // Off-route detection + rerouting
        if (routePointsRef.current.length > 1) {
          const nearest = nearestPointOnRoute(routePointsRef.current, newLat, newLng);
          if (nearest.dist > OFF_ROUTE_THRESHOLD_M && now - lastRerouteRef.current > REROUTE_INTERVAL_MS) {
            lastRerouteRef.current = now;
            void calculateRoute(newLat, newLng);
          }
        }

        // Proximity detection
        const directDistM = haversineDistance(newLat, newLng, pickupLat, pickupLng) * 1000;
        if (directDistM <= PROXIMITY_RADIUS_M && !proximityFiredRef.current) {
          proximityFiredRef.current = true;
          setProximityAlert(copy.nearby);
          navigator.vibrate?.([100, 50, 100]);
          onProximity?.(true, Math.round(directDistM));
        } else if (directDistM <= APPROACH_RADIUS_M && directDistM > PROXIMITY_RADIUS_M && !approachFiredRef.current) {
          approachFiredRef.current = true;
          setProximityAlert(copy.approaching);
          onProximity?.(false, Math.round(directDistM));
        } else if (directDistM > APPROACH_RADIUS_M + 50) {
          proximityFiredRef.current = false;
          approachFiredRef.current = false;
          setProximityAlert(null);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationStatus('denied');
        else setLocationStatus('searching');
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
    );

    return () => {
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      void supabase.rpc('deactivate_pickup_location', { p_request_id: request.id });
    };
  }, [request.id, pickupLat, pickupLng, animateMarker, calculateRoute, updateRouteProgress, onProximity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial route calculation
  useEffect(() => {
    const startLat = currentPosRef.current?.lat ?? userLat;
    const startLng = currentPosRef.current?.lng ?? userLng;
    if (startLat != null && startLng != null) {
      void calculateRoute(startLat, startLng);
      setNavActive(true);
    } else if (userLat != null && userLng != null) {
      void calculateRoute(userLat, userLng);
      setNavActive(true);
    }
  }, [calculateRoute, userLat, userLng]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    const pos = currentPosRef.current;
    if (!map) return;
    if (pos) {
      map.flyTo([pos.lat, pos.lng], 16, { duration: 0.6 });
      setAutoFollow(true);
      autoFollowRef.current = true;
      userInteractedRef.current = false;
    }
  }, []);

  const handleRetryRoute = useCallback(() => {
    const pos = currentPosRef.current;
    const lat = pos?.lat ?? userLat;
    const lng = pos?.lng ?? userLng;
    if (lat != null && lng != null) void calculateRoute(lat, lng);
  }, [calculateRoute, userLat, userLng]);

  return (
    <div className="live-nav-overlay" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="live-nav-map" ref={mapNodeRef} />

      {/* Top bar */}
      <div className="live-nav-topbar">
        <button className="live-nav-close" onClick={onClose} aria-label={copy.close}><X size={20} /></button>
        <div className="live-nav-title">
          <Navigation size={16} />
          <span>{copy.title}</span>
        </div>
        <div className="live-nav-zoom-controls">
          <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in"><Plus size={18} /></button>
          <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out"><Minus size={18} /></button>
        </div>
      </div>

      {/* Location status messages */}
      {locationStatus === 'denied' && (
        <div className="live-nav-status-msg error"><MapPin size={16} />{copy.locationDenied}</div>
      )}
      {locationStatus === 'searching' && navActive && !userMarkerRef.current && (
        <div className="live-nav-status-msg info"><RefreshCw size={16} className="spin" />{copy.searchingLocation}</div>
      )}
      {locationStatus === 'weak' && (
        <div className="live-nav-status-msg warning"><MapPin size={16} />{copy.locationWeak}</div>
      )}

      {/* Route loading / error */}
      {routeLoading && (
        <div className="live-nav-route-status"><RefreshCw size={14} className="spin" />{copy.updating}</div>
      )}
      {routeError && !routeLoading && (
        <div className="live-nav-route-error"><span>{copy.routeFailed}</span><button onClick={handleRetryRoute}>{copy.retry}</button></div>
      )}

      {/* Bottom info card */}
      <div className="live-nav-info-card">
        <div className="live-nav-info-row">
          <div className="live-nav-info-distance">
            <MapPin size={18} />
            <strong>{remainingM != null ? formatDistance(remainingM / 1000, language) : '—'}</strong>
          </div>
          {etaMin != null && remainingM != null && remainingM > PROXIMITY_RADIUS_M && (
            <div className="live-nav-info-eta">
              <span>{etaMin} {copy.min}</span>
            </div>
          )}
        </div>

        {proximityAlert && (
          <div className={`live-nav-proximity ${proximityAlert === copy.nearby ? 'near' : 'approach'}`}>
            <MapPin size={15} />
            <span>{proximityAlert}</span>
          </div>
        )}

        {!autoFollow && (
          <button className="live-nav-recenter-btn" onClick={handleRecenter}>
            <LocateFixed size={16} />{copy.backToMe}
          </button>
        )}
      </div>

      {/* Recenter floating button (when not following) */}
      {!autoFollow && (
        <button className="live-nav-float-recenter" onClick={handleRecenter} aria-label={copy.backToMe}>
          <LocateFixed size={22} />
        </button>
      )}
    </div>
  );
}
