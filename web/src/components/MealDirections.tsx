import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Navigation } from 'lucide-react';
import { directionsUrl } from '@/lib/meal-sharing';
import type { Language } from '@/lib/supabase';

export function MealDirections({ latitude, longitude, language }: { latitude: number; longitude: number; language: Language }) {
  const [error, setError] = useState(false);
  const url = directionsUrl(latitude, longitude), ar = language === 'ar';
  return <><a className="secondary-button pickup-directions" href={url} target="_blank" rel="noopener noreferrer" onClick={event => {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault(); setError(false);
    void Browser.open({ url }).catch(() => setError(true));
  }}><Navigation size={16} />{ar ? 'الاتجاهات إلى موقع الاستلام' : 'Directions to pickup location'}</a>{error && <p role="alert">{ar ? 'تعذر فتح الاتجاهات. حاول مرة أخرى.' : 'Could not open directions. Please retry.'}</p>}</>;
}
