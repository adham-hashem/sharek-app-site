import { GOOGLE_MAPS_API_KEY } from '@/lib/supabase';

let loaderPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('NO_API_KEY'));

  loaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) resolve();
      else reject(new Error('MAPS_LOAD_FAILED'));
    };
    script.onerror = () => reject(new Error('MAPS_NETWORK_ERROR'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}
