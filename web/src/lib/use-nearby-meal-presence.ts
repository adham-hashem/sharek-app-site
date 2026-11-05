import { useEffect, useRef } from 'react';
import { distanceKm, locationIssue, type LocationFix, type LocationIssue } from './geo';
import { supabase } from './supabase';

const radiusFor = (userId: string): number => {
  try {
    const saved = JSON.parse(localStorage.getItem(`sharek-community-filters-v1:${userId}`) ?? 'null');
    if ([1, 3, 5, 10, 50].includes(saved?.radius)) return saved.radius;
  } catch { /* Use the same default as the community filter. */ }
  return 5;
};

export function useNearbyMealPresence(userId: string | null | undefined, fix: LocationFix | null, locationError: LocationIssue | null) {
  const latest = useRef(fix);
  latest.current = fix;
  const latestError = useRef(locationError);
  latestError.current = locationError;
  const last = useRef<{ latitude: number; longitude: number; radius: number; at: number } | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => { last.current = null; }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const sync = () => {
      const current = latest.current;
      if (!active || running.current || !navigator.onLine || !current || locationIssue(current)) return;
      const radius = radiusFor(userId);
      const previous = last.current;
      if (previous && previous.radius === radius && Date.now() - previous.at < 60_000 && distanceKm(previous.latitude, previous.longitude, current.latitude, current.longitude) < 0.05) return;
      running.current = (async () => {
        const { error } = await supabase.rpc('set_nearby_meal_presence', {
          p_latitude: current.latitude, p_longitude: current.longitude,
          p_accuracy_m: current.accuracy, p_radius_km: radius,
          p_observed_at:new Date(current.timestamp).toISOString(),
        });
        if (!error && active) last.current = { latitude: current.latitude, longitude: current.longitude, radius, at: Date.now() };
      })().catch(() => {}).finally(() => { running.current = null; });
    };
    const changed = () => { sync(); };
    syncRef.current = changed;
    window.addEventListener('sharek-community-filters', changed);
    window.addEventListener('online', changed);
    document.addEventListener('visibilitychange', changed);
    const timer = window.setInterval(changed, 60_000);
    sync();
    return () => { active = false; syncRef.current = () => {}; window.clearInterval(timer); window.removeEventListener('sharek-community-filters', changed); window.removeEventListener('online', changed); document.removeEventListener('visibilitychange', changed); };
  }, [userId]);
  useEffect(() => { syncRef.current(); }, [fix?.timestamp]);

  useEffect(() => {
    if (!userId || (locationError !== 'denied' && locationError !== 'services_off')) return;
    last.current = null;
    void (async () => { await running.current?.catch(() => {}); if (latestError.current === 'denied' || latestError.current === 'services_off') await supabase.rpc('clear_nearby_meal_presence'); })();
  }, [userId, locationError]);
}
