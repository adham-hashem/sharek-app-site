import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, LocateFixed, X } from 'lucide-react';
import { locationIssue, locationMessage, validCoordinates, type LocationFix } from '@/lib/geo';
import { type PickupPoint } from '@/lib/meal-sharing';
import { MealDirections } from './MealDirections';
import type { Language } from '@/lib/supabase';

type Props = { language: Language; point?: PickupPoint | null; fix?: LocationFix | null; error?: string | null; onRetry?: () => void; onConfirm?: (point: PickupPoint) => void; onClose?: () => void };

// This is the existing Leaflet/OSM map stack. A world overview is never a saved pickup point.
export function PickupMap({ language, point = null, fix = null, error = null, onRetry, onConfirm, onClose }: Props) {
  const ar = language === 'ar', editable = Boolean(onConfirm);
  const container = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), pin = useRef<L.Marker | null>(null), user = useRef<L.CircleMarker | null>(null);
  const [candidate, setCandidate] = useState<PickupPoint | null>(point);
  const candidateRef = useRef(candidate); candidateRef.current = candidate;
  const fixRef = useRef(fix); fixRef.current = fix;
  const [tileError, setTileError] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [hasTiles, setHasTiles] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: true, attributionControl: true }); map.current = instance;
    const initial = candidateRef.current;
    const gps = fixRef.current && !locationIssue(fixRef.current) ? fixRef.current : null;
    if (initial) instance.setView([initial.latitude, initial.longitude], 17);
    else if (gps) instance.setView([gps.latitude, gps.longitude], 17);
    else instance.fitWorld();
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(instance);
    tiles.on('tileerror', () => setTileError(true));
    tiles.on('tileload', () => { setHasTiles(true); setTileError(false); });
    if (editable) instance.on('click', (event: L.LeafletMouseEvent) => {
      const { lat, lng } = event.latlng.wrap();
      if (validCoordinates(lat, lng)) setCandidate({ latitude: lat, longitude: lng, accuracy: null, source: 'pin', timestamp: Date.now() });
    });
    const updateOnline = () => { setOnline(navigator.onLine); if (navigator.onLine) { setTileError(false); tiles.redraw(); } };
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);
    const resize = new ResizeObserver(() => instance.invalidateSize()); resize.observe(container.current);
    return () => { resize.disconnect(); window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); instance.remove(); map.current = null; pin.current = null; user.current = null; };
  }, [editable]);
  useEffect(() => {
    const instance = map.current; if (!instance) return;
    if (!fix || locationIssue(fix)) { user.current?.remove(); user.current = null; return; }
    if (!user.current) user.current = L.circleMarker([fix.latitude, fix.longitude], { radius: 7, color: '#fff', fillColor: '#3875ef', fillOpacity: 1 }).addTo(instance);
    else user.current.setLatLng([fix.latitude, fix.longitude]);
    // A new fix can frame an unselected map, but never relocate the selected food pin.
    if (!candidateRef.current) instance.setView([fix.latitude, fix.longitude], 17);
  }, [fix]);
  useEffect(() => {
    if (!map.current || !candidate) return;
    const icon = L.divIcon({ className: 'pickup-fixed-pin', html: '<span>📍</span>', iconSize: [36, 42], iconAnchor: [18, 40] });
    if (!pin.current) pin.current = L.marker([candidate.latitude, candidate.longitude], { icon, draggable: editable }).addTo(map.current).on('dragend', () => {
      const position = pin.current!.getLatLng().wrap();
      setCandidate({ latitude: position.lat, longitude: position.lng, accuracy: null, source: 'pin', timestamp: Date.now() });
    });
    else pin.current.setLatLng([candidate.latitude, candidate.longitude]);
  }, [candidate, editable]);
  const useGps = () => {
    const current = fixRef.current;
    if (!current || locationIssue(current)) { onRetry?.(); return; }
    setCandidate({ ...current, source: 'gps' }); map.current?.setView([current.latitude, current.longitude], 17);
  };
  return <section className={`pickup-map-section ${editable ? 'pickup-map-picker' : ''}`} dir={ar ? 'rtl' : 'ltr'} aria-label={ar ? 'خريطة نقطة الاستلام' : 'Pickup location map'}>
    <div className="pickup-map-heading"><strong>{ar ? 'نقطة الاستلام الثابتة' : 'Fixed pickup point'}</strong>{onClose && <button className="icon-button" onClick={onClose} aria-label={ar ? 'إغلاق الخريطة' : 'Close map'}><X size={18} /></button>}</div>
    {editable && <p>{ar ? 'حرّك الخريطة واضغط على مكان الطعام لوضع الدبوس، ثم راجع النقطة وأكدها.' : 'Move the map and tap the food location to place the pin. Review and confirm it.'}</p>}
    <div ref={container} className="pickup-map-canvas" />
    {(!online || tileError) && <p role="alert" className="feedback error">{ar ? 'تعذر تحميل الخريطة. تحقق من الإنترنت ثم أعد المحاولة.' : 'Map could not load. Check your connection and retry.'}</p>}
    {editable && <>
      {(!fix || locationIssue(fix)) && <p role="alert">{locationMessage(fix ? locationIssue(fix) : error, ar)} {ar ? 'يمكنك اختيار المكان يدويًا على الخريطة.' : 'You can select the location manually on the map.'}</p>}
      <button className="secondary-button" onClick={useGps}><LocateFixed size={16} />{ar ? 'استخدام موقعي الحالي للاستلام' : 'Use my current location for pickup'}</button>
      {candidate && <p className="pickup-coordinates" dir="ltr">{candidate.latitude.toFixed(6)}, {candidate.longitude.toFixed(6)}{candidate.source === 'gps' ? ` · ±${Math.round(candidate.accuracy!)} m` : ''}</p>}
      <button className="primary-button" disabled={!candidate || !online || (candidate.source === 'pin' && !hasTiles)} onClick={() => { if (candidate) onConfirm?.({ ...candidate, timestamp: Date.now() }); }}><Check size={18} />{ar ? 'تأكيد نقطة الاستلام' : 'Confirm pickup point'}</button>
    </>}
    {!editable && point && <MealDirections latitude={point.latitude} longitude={point.longitude} language={language} />}
  </section>;
}
