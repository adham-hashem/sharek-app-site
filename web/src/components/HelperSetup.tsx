import { useState } from 'react';
import { Bell, Check, MapPin, X } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';

type Props = {
  language: Language;
  acceptsRequests: boolean;
  radiusKm: 1 | 3 | 5 | 10;
  latitude: number | null;
  longitude: number | null;
  onSaved: (acceptsRequests: boolean, radiusKm: 1 | 3 | 5 | 10) => void;
  onClose: () => void;
};

export function HelperSetup({ language, acceptsRequests, radiusKm, latitude, longitude, onSaved, onClose }: Props) {
  const isAr = language === 'ar';
  const [enabled, setEnabled] = useState(acceptsRequests);
  const [radius, setRadius] = useState<1 | 3 | 5 | 10>(radiusKm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (): Promise<void> => {
    if (enabled && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.rpc('set_helper_presence', {
      p_preferences_set: true,
      p_accepts_requests: enabled,
      p_radius_km: radius,
      p_latitude: latitude,
      p_longitude: longitude,
    });
    setSaving(false);
    if (saveError) {
      console.error('helper preferences save failed', saveError);
      setError(isAr ? 'تعذر حفظ الاختيار الآن.' : 'The preference could not be saved.');
      return;
    }
    onSaved(enabled, radius);
    onClose();
  };
  return <div className="helper-setup-overlay" dir={isAr ? 'rtl' : 'ltr'}><section className="helper-setup-card"><button className="modal-close" onClick={onClose} aria-label={isAr ? 'إغلاق' : 'Close'}><X size={18} /></button><span className="modal-icon green"><Bell size={23} /></span><h2>{isAr ? 'استقبال طلبات قريبة' : 'Receive nearby requests'}</h2><p>{isAr ? 'اختر ما إذا كنت متاحًا لمساعدة أشخاص يحتاجون وجبة بالقرب منك.' : 'Choose whether you are available to help people who need a meal nearby.'}</p><button className={`helper-toggle ${enabled ? 'enabled' : ''}`} onClick={() => setEnabled((value) => !value)}><span className="helper-toggle-check">{enabled && <Check size={15} />}</span><span>{isAr ? 'أوافق على استقبال طلبات الطعام القريبة مني' : 'I agree to receive nearby meal requests'}</span></button><label className="helper-radius-label">{isAr ? 'النطاق الذي تفضله' : 'Preferred distance'}<select value={radius} onChange={(event) => setRadius(Number(event.target.value) as 1 | 3 | 5 | 10)}><option value="1">1 كم</option><option value="3">3 كم</option><option value="5">5 كم</option><option value="10">10 كم</option></select></label><div className="helper-location-note"><MapPin size={16} /><span>{isAr ? 'يُستخدم موقعك الدقيق للعثور على الطلبات القريبة أثناء استخدام التطبيق.' : 'Your precise location is used to find nearby requests while you use the app.'}</span></div>{error && <div className="feedback error">{error}</div>}<button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? '...' : (isAr ? 'حفظ التفضيلات' : 'Save preferences')}<Check size={18} /></button></section></div>;
}
