import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Compass, Footprints, MapPin, Navigation, Navigation2, Timer } from 'lucide-react';
import { supabase, haversineDistance, formatDistance, type Language, type MealRequest, type PickupLocation } from '@/lib/supabase';
import { DirectPickupNavigation } from './DirectPickupNavigation';
import { LiveNavigationView } from '@/components/LiveNavigationView';
import {isActiveHandover} from '@/lib/meal-operations';

type Props = {
  language: Language;
  request: MealRequest;
  profileId: string;
  userLat: number | null;
  userLng: number | null;
  donorName: string;
  donorAvatar: string | null;
  donorVerified: boolean;
  onAdvance: (status: 'ON_THE_WAY' | 'ARRIVED' | 'RECEIVED' | 'COMPLETED') => void | Promise<void>;
  onOpenChat?: () => void;
};

const PROXIMITY_RADIUS_M = 100;
const WALKING_SPEED_MPS = 1.4;

function compassDirection(bearing: number, isAr: boolean): string {
  const dirs = isAr
    ? ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب']
    : ['North', 'NE', 'East', 'SE', 'South', 'SW', 'West', 'NW'];
  return dirs[Math.round(bearing / 45) % 8];
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function SmartPickupCard({ language, request, profileId, userLat, userLng, donorName, donorAvatar, donorVerified, onAdvance, onOpenChat }: Props) {
  const isAr = language === 'ar';
  const [partnerLocation, setPartnerLocation] = useState<PickupLocation | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [proximityTriggered, setProximityTriggered] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [showLiveNav, setShowLiveNav] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastUploadRef = useRef<number>(0);
  const proximityFiredRef = useRef(false);

  const direct = request.sharing_mode === 'direct';
  const isDonor = request.donor_id === profileId;
  const partnerId = isDonor ? request.requester_id : request.donor_id;

  const copy = {
    pickupPoint: isAr ? 'نقطة الاستلام' : 'Pickup point',
    away: isAr ? 'على بُعد' : 'away',
    direction: isAr ? 'الاتجاه' : 'Direction',
    eta: isAr ? 'الوصول المتوقع' : 'ETA',
    minutes: isAr ? 'دقائق' : 'min',
    onMyWay: isAr ? 'أنا في الطريق' : "I'm on my way",
    arrived: isAr ? 'وصلت' : 'I arrived',
    arrivedMsg: isAr ? 'تم الوصول إلى نقطة الاستلام' : 'Arrived at pickup point',
    received: isAr ? 'تم الاستلام' : 'Mark as received',
    confirmPickup: isAr ? 'تأكيد الاستلام' : 'Confirm pickup',
    nearby: isAr ? 'أنت بالقرب من نقطة الاستلام' : 'You are near the pickup point',
    partnerOnWay: isAr ? 'المساعد في الطريق إليك' : 'Helper is on the way to you',
    partnerArrived: isAr ? 'وصل المساعد إلى نقطة الاستلام' : 'Helper arrived at pickup point',
    waitingPartner: isAr ? 'في انتظار وصول المساعد' : 'Waiting for helper to arrive',
    locationDenied: isAr ? 'تم رفض إذن الموقع. المسافة قد لا تكون دقيقة.' : 'Location permission denied. Distance may be inaccurate.',
    chat: isAr ? 'فتح المحادثة' : 'Open chat',
    helper: isAr ? 'المساعد' : 'Helper',
    verified: isAr ? 'موثّق' : 'Verified',
  };

  // Subscribe to partner's pickup location changes
  useEffect(() => {
    if (!partnerId || direct) return;
    const channel = supabase.channel(`pickup-loc-${request.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pickup_locations',
        filter: `request_id=eq.${request.id}`,
      }, (payload) => {
        const loc = payload.new as PickupLocation;
        if (loc.user_id === partnerId && loc.is_active) {
          setPartnerLocation(loc);
        } else if (loc.user_id === partnerId && !loc.is_active) {
          setPartnerLocation(null);
        }
      })
      .subscribe();

    // Also fetch existing partner location on mount
    void supabase.from('pickup_locations')
      .select('*')
      .eq('request_id', request.id)
      .eq('user_id', partnerId)
      .eq('is_active', true)
      .order('last_updated', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPartnerLocation(data as PickupLocation);
      });

    return () => { void supabase.removeChannel(channel); };
  }, [request.id, partnerId, direct]);

  // Start geolocation watch for the current user
  useEffect(() => {
    // Direct pickup uses the same validated, fresh GPS fix as the community feed.
    if (direct) return;
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }

    const startWatch = () => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setLocationError(false);
          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;
          setMyLocation({ lat: newLat, lng: newLng });
          if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
            setHeading(pos.coords.heading);
          }

          // Upload to backend at most every 5 seconds
          const now = Date.now();
          if (!direct && now - lastUploadRef.current > 5000) {
            lastUploadRef.current = now;
            void supabase.rpc('update_pickup_location', {
              p_request_id: request.id,
              p_latitude: newLat,
              p_longitude: newLng,
              p_heading: pos.coords.heading ?? null,
            }).then(({ error }) => {
              if (error) console.error('pickup location update failed', error);
            });
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setLocationError(true);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    };

    startWatch();

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // Deactivate our location sharing on unmount
      void supabase.rpc('deactivate_pickup_location', { p_request_id: request.id });
    };
  }, [request.id, direct]);

  // Calculate distance, bearing, and ETA
  const myLat = direct ? userLat : myLocation?.lat ?? userLat;
  const myLng = direct ? userLng : myLocation?.lng ?? userLng;
  const partnerLat = partnerLocation?.latitude ?? null;
  const partnerLng = partnerLocation?.longitude ?? null;

  // Use midpoint of both participants as the pickup point if pickup coords are not set
  const pickupLat = request.pickup_latitude ?? (direct ? null : myLat != null && partnerLat != null ? (myLat + partnerLat) / 2 : myLat);
  const pickupLng = request.pickup_longitude ?? (direct ? null : myLng != null && partnerLng != null ? (myLng + partnerLng) / 2 : myLng);

  const hasMyCoords = myLat != null && myLng != null;
  const hasPickupCoords = pickupLat != null && pickupLng != null;

  const distanceKm = hasMyCoords && hasPickupCoords
    ? haversineDistance(myLat!, myLng!, pickupLat!, pickupLng!)
    : null;
  const distanceM = distanceKm != null ? Math.round(distanceKm * 1000) : null;

  const bearing = hasMyCoords && hasPickupCoords
    ? calculateBearing(myLat!, myLng!, pickupLat!, pickupLng!)
    : null;

  const etaMinutes = distanceKm != null
    ? Math.max(1, Math.round((distanceKm * 1000) / WALKING_SPEED_MPS / 60))
    : null;

  // Proximity detection
  useEffect(() => {
    if (distanceM == null) return;
    if (distanceM <= PROXIMITY_RADIUS_M && !proximityFiredRef.current) {
      proximityFiredRef.current = true;
      setProximityTriggered(true);
      if (!isAr) {
        navigator.vibrate?.([100, 50, 100]);
      } else {
        navigator.vibrate?.([100, 50, 100]);
      }
    } else if (distanceM > PROXIMITY_RADIUS_M + 30) {
      proximityFiredRef.current = false;
      setProximityTriggered(false);
    }
  }, [distanceM, isAr]);

  const handleAdvance = useCallback(async (status: 'ON_THE_WAY' | 'ARRIVED' | 'RECEIVED' | 'COMPLETED') => {
    if (advancing) return;
    if (request.status === status) return;
    setAdvancing(true);
    try{await onAdvance(status);}finally{setAdvancing(false);}
  }, [advancing, request.status, onAdvance]);

  // Determine what status the partner is in based on request status
  // If request is ON_THE_WAY or ARRIVED, the partner who triggered it is moving
  const partnerMoving = request.status === 'ON_THE_WAY';
  const partnerArrived = request.status === 'ARRIVED';

  // Mini map: normalize coordinates to 0-100% for a simple SVG preview
  const allLats = [myLat, partnerLat, pickupLat].filter((v): v is number => v != null);
  const allLngs = [myLng, partnerLng, pickupLng].filter((v): v is number => v != null);
  const hasMapData = allLats.length >= 2 && allLngs.length >= 2;
  const minLat = hasMapData ? Math.min(...allLats) : 0;
  const maxLat = hasMapData ? Math.max(...allLats) : 1;
  const minLng = hasMapData ? Math.min(...allLngs) : 0;
  const maxLng = hasMapData ? Math.max(...allLngs) : 1;
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;
  const pad = 0.15;

  const toX = (lng: number) => ((lng - minLng) / lngRange) * (100 - pad * 200) + pad * 100;
  const toY = (lat: number) => (1 - (lat - minLat) / latRange) * (100 - pad * 200) + pad * 100;

  const myX = hasMyCoords ? toX(myLng!) : 50;
  const myY = hasMyCoords ? toY(myLat!) : 80;
  const partnerX = partnerLat != null ? toX(partnerLng!) : 50;
  const partnerY = partnerLat != null ? toY(partnerLat!) : 20;
  const pickupX = hasPickupCoords ? toX(pickupLng!) : 50;
  const pickupY = hasPickupCoords ? toY(pickupLat!) : 50;

  if(direct&&!isActiveHandover(request))return null;
  return (
    <div className="smart-pickup-card" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header with pickup point title */}
      <div className="smart-pickup-header">
        <span className="smart-pickup-icon"><MapPin size={18} /></span>
        <div>
          <strong>{copy.pickupPoint}</strong>
          {distanceM != null && <small>{copy.away} {formatDistance(distanceKm!, language)}</small>}
        </div>
        {proximityTriggered && <span className="smart-pickup-proximity-badge"><MapPin size={13} />{isAr ? 'قريب' : 'Near'}</span>}
      </div>

      {/* Mini map preview */}
      {!direct && hasMapData && (
        <div className="smart-pickup-map">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="smart-pickup-map-svg">
            {/* Route line from me to pickup */}
            {hasPickupCoords && hasMyCoords && (
              <line x1={myX} y1={myY} x2={pickupX} y2={pickupY} stroke="#f06427" strokeWidth="0.8" strokeDasharray="2 1.5" opacity="0.6" />
            )}
            {/* Route line from partner to pickup */}
            {hasPickupCoords && partnerLat != null && (
              <line x1={partnerX} y1={partnerY} x2={pickupX} y2={pickupY} stroke="#6e9343" strokeWidth="0.8" strokeDasharray="2 1.5" opacity="0.5" />
            )}
            {/* Pickup marker */}
            {hasPickupCoords && (
              <g>
                <circle cx={pickupX} cy={pickupY} r="3.5" fill="#f06427" opacity="0.25" />
                <circle cx={pickupX} cy={pickupY} r="2" fill="#f06427" />
              </g>
            )}
            {/* Partner marker */}
            {partnerLat != null && (
              <g>
                <circle cx={partnerX} cy={partnerY} r="3" fill="#6e9343" opacity="0.25" />
                <circle cx={partnerX} cy={partnerY} r="1.8" fill="#6e9343" />
              </g>
            )}
            {/* My marker */}
            {hasMyCoords && (
              <g>
                <circle cx={myX} cy={myY} r="3.5" fill="#2563eb" opacity="0.25" />
                <circle cx={myX} cy={myY} r="2" fill="#2563eb" />
              </g>
            )}
          </svg>
          <div className="smart-pickup-map-legend">
            <span className="legend-dot blue" />
            <small>{isAr ? 'أنت' : 'You'}</small>
            <span className="legend-dot green" />
            <small>{isAr ? 'المساعد' : 'Helper'}</small>
            <span className="legend-dot orange" />
            <small>{isAr ? 'الاستلام' : 'Pickup'}</small>
          </div>
        </div>
      )}

      {/* Distance + direction + ETA row */}
      <div className="smart-pickup-stats">
        {distanceM != null && (
          <div className="smart-pickup-stat">
            <Navigation2 size={16} />
            <span>{formatDistance(distanceKm!, language)}</span>
          </div>
        )}
        {!direct && bearing != null && (
          <div className="smart-pickup-stat">
            <Compass size={16} style={{ transform: `rotate(${bearing}deg)` }} />
            <span>{copy.direction}: {compassDirection(bearing, isAr)}</span>
          </div>
        )}
        {!direct && etaMinutes != null && distanceM != null && distanceM > PROXIMITY_RADIUS_M && (
          <div className="smart-pickup-stat">
            <Timer size={16} />
            <span>{copy.eta}: {etaMinutes} {copy.minutes}</span>
          </div>
        )}
      </div>

      {/* Proximity alert */}
      {proximityTriggered && (
        <div className="smart-pickup-proximity-alert">
          <MapPin size={16} />
          <span>{copy.nearby}</span>
          {distanceM != null && <small>{isAr ? `على بُعد ${distanceM} م` : `${distanceM} m away`}</small>}
        </div>
      )}

      {/* Partner status indicator */}
      {(partnerMoving || partnerArrived) && (
        <div className={`smart-pickup-partner-status ${partnerArrived ? 'arrived' : ''}`}>
          {partnerArrived ? <MapPin size={15} /> : <Footprints size={15} />}
          <span>{partnerArrived ? copy.partnerArrived : copy.partnerOnWay}</span>
        </div>
      )}

      {/* Location permission denied fallback */}
      {(locationError || (direct && !hasMyCoords)) && (
        <div className="smart-pickup-location-error">
          <MapPin size={15} />
          <span>{direct ? (isAr ? 'الموقع غير متاح. فعّل الموقع الدقيق لعرض المسافة إلى الطعام.' : 'Location unavailable. Enable precise location to see the distance to the food.') : copy.locationDenied}</span>
        </div>
      )}

      {/* Helper card */}
      <div className="helper-card">
        {donorAvatar ? <img src={donorAvatar} alt="" /> : <span className="helper-avatar"><MapPin size={20} /></span>}
        <div>
          <strong>{donorName || copy.helper}{donorVerified && <Check size={14} style={{ color: '#0f766e', display: 'inline-flex', verticalAlign: 'middle', marginInlineStart: 4 }} />}</strong>
          <small>{donorVerified ? copy.verified : copy.helper}</small>
        </div>
      </div>

      {direct && request.pickup_instructions && <p className="meal-detail-desc">{request.pickup_instructions}</p>}
      {/* Navigation button — shown when request is active and we have pickup coords */}
      {hasPickupCoords && (!direct || !isDonor) && (request.status === 'ACCEPTED' || request.status === 'ON_THE_WAY' || request.status === 'ARRIVED' || request.status === 'WAITING_FOR_PICKUP') && (
        <button className="smart-pickup-start-nav" onClick={() => setShowLiveNav(true)}>
          <Navigation size={18} />{direct ? (isAr ? 'ابدأ الطريق إلى الوجبة' : 'Start route to the meal') : (isAr ? 'بدء التنقل المباشر' : 'Start live navigation')}
        </button>
      )}

      {/* Action buttons based on request status */}
      <div className="smart-pickup-actions">
        {!direct && request.status === 'ACCEPTED' && (
          <button className="primary-button" disabled={advancing} onClick={() => void handleAdvance('ON_THE_WAY')}>
            <Footprints size={18} />{copy.onMyWay}
          </button>
        )}

        {!direct && request.status === 'ON_THE_WAY' && (
          <button className="primary-button" disabled={advancing} onClick={() => void handleAdvance('ARRIVED')}>
            <MapPin size={18} />{copy.arrived}
          </button>
        )}

        {!direct && request.status === 'ARRIVED' && (
          <>
            <div className="smart-pickup-arrived-msg"><Check size={16} />{copy.arrivedMsg}</div>
            {isDonor && !direct ? (
              <button className="primary-button" disabled={advancing} onClick={() => void handleAdvance('RECEIVED')}>
                <Check size={18} />{copy.received}
              </button>
            ) : (
              <button className="primary-button" disabled={advancing} onClick={() => void handleAdvance('RECEIVED')}>
                <Check size={18} />{copy.confirmPickup}
              </button>
            )}
          </>
        )}

        {!direct && request.status === 'WAITING_FOR_PICKUP' && (
          <button className="primary-button" disabled={advancing} onClick={() => void handleAdvance('RECEIVED')}>
            <Check size={18} />{copy.received}
          </button>
        )}

        {request.status === 'RECEIVED' && (
          <button className="primary-button" disabled={advancing} onClick={() => void handleAdvance('COMPLETED')}>
            <Check size={18} />{copy.confirmPickup}
          </button>
        )}

        {onOpenChat && request.donor_id && (
          <button className="request-close-btn" onClick={onOpenChat}>
            {copy.chat}
          </button>
        )}
      </div>

      {/* Privacy note */}
      <div className="request-privacy-note">
        <MapPin size={16} />
        {direct ? (isAr ? 'يُستخدم موقعك أثناء فتح الملاحة لحساب طريق المشي. تُرسل نقطة البداية ونقطة الطعام لخدمة التوجيه، ولا يُشارك موقعك الحي مع المتبرع من هذه الملاحة.' : 'While navigation is open, your start and pickup points are sent to the walking routing service. This navigation does not share your live location with the donor.') : (isAr ? 'تُشارك إحداثيات موقعك الدقيقة مع الطرف الآخر أثناء الاستلام النشط' : 'Your precise location is shared with the other participant during active pickup')}
      </div>

      {/* Full-screen live navigation */}
      {showLiveNav && direct && <DirectPickupNavigation language={language} request={request} profileId={profileId} onClose={() => setShowLiveNav(false)} />}
      {showLiveNav && !direct && hasPickupCoords && (
        <LiveNavigationView
          language={language}
          request={request}
          profileId={profileId}
          userLat={myLat}
          userLng={myLng}
          pickupLat={pickupLat!}
          pickupLng={pickupLng!}
          onClose={() => setShowLiveNav(false)}
        />
      )}
    </div>
  );
}
