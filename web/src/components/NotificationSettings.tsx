import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Heart, MessageCircle, Utensils, Globe2, Award, Megaphone, Volume2, Vibrate } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';
import { useNotifications } from './NotificationProvider';
import {NativePush,nativePushSupported} from '@/lib/native-push';

type Props = {
  language: Language;
  onBack: () => void;
};

type Settings = {
  meal_requests: boolean;
  request_updates: boolean;
  chat_messages: boolean;
  nearby_meals: boolean;
  community: boolean;
  achievements: boolean;
  general: boolean;
  sound: boolean;
  vibration: boolean;
};

export function NotificationSettings({ language, onBack }: Props) {
  const isAr = language === 'ar';
  const { requestPermission, hasPermission,nativePushState } = useNotifications();
  const pushEnabled=nativePushSupported()?nativePushState==='registered':hasPermission;
  const [error,setError]=useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const copy = {
    title: isAr ? 'إعدادات الإشعارات' : 'Notification Settings',
    mealRequests: isAr ? 'طلبات الوجبات' : 'Meal Requests',
    requestUpdates: isAr ? 'تحديثات حالة الطلب' : 'Request Status Updates',
    chatMessages: isAr ? 'رسائل الشات' : 'Chat Messages',
    nearbyMeals: isAr ? 'إشعارات الوجبات القريبة' : 'Nearby meal notifications',
    community: isAr ? 'مجتمع SHARek' : 'SHARek Community',
    achievements: isAr ? 'الإنجازات والشارات' : 'Achievements & Badges',
    general: isAr ? 'إشعارات SHARek العامة' : 'General SHARek Notifications',
    sound: isAr ? 'صوت الإشعارات' : 'Notification Sound',
    vibration: isAr ? 'الاهتزاز' : 'Vibration',
    enablePush: isAr ? 'تفعيل الإشعارات' : 'Enable Push Notifications',
    pushOn: isAr ? 'الإشعارات مفعّلة' : 'Push notifications enabled',
  };

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('notification_settings').select('*').maybeSingle();
      if (data) setSettings(data as Settings);
    })();
  }, []);

  const toggle = (key: keyof Settings) => {
    if (!settings) return;
    const updated = { ...settings, [key]: !settings[key] };
    if(saving)return;setError('');
    setSaving(true);
    void supabase.rpc('update_notification_settings', {
      p_meal_requests: updated.meal_requests,
      p_request_updates: updated.request_updates,
      p_chat_messages: updated.chat_messages,
      p_nearby_meals: updated.nearby_meals,
      p_community: updated.community,
      p_achievements: updated.achievements,
      p_general: updated.general,
      p_sound: updated.sound,
      p_vibration: updated.vibration,
    }).then(({error}) => {if(error)setError(isAr?'تعذر حفظ إعدادات الإشعارات. حاول مجددًا.':'Could not save notification settings. Retry.');else{setSettings(updated);window.dispatchEvent(new Event('sharek-notification-settings'));}setSaving(false);});
  };

  const toggles: { key: keyof Settings; label: string; icon: typeof Bell }[] = [
    { key: 'meal_requests', label: copy.mealRequests, icon: Utensils },
    { key: 'request_updates', label: copy.requestUpdates, icon: Heart },
    { key: 'chat_messages', label: copy.chatMessages, icon: MessageCircle },
    { key: 'nearby_meals', label: copy.nearbyMeals, icon: Utensils },
    { key: 'community', label: copy.community, icon: Globe2 },
    { key: 'achievements', label: copy.achievements, icon: Award },
    { key: 'general', label: copy.general, icon: Megaphone },
    { key: 'sound', label: copy.sound, icon: Volume2 },
    { key: 'vibration', label: copy.vibration, icon: Vibrate },
  ];

  return (
    <div className="notif-settings-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="notif-center-header">
        <button className="icon-button" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={20} /></button>
        <h2>{copy.title}</h2>
      </header>
      <div className="notif-settings-body">
        <button className={`notif-push-toggle ${pushEnabled ? 'enabled' : ''}`} onClick={() => void requestPermission()}>
          <span className="notif-push-icon"><Bell size={20} /></span>
          <span className="notif-push-text">
            <strong>{pushEnabled ? copy.pushOn : copy.enablePush}</strong>
            <small>{isAr ? 'اسمح للتطبيق بإرسال إشعارات' : 'Allow the app to send notifications'}</small>
          </span>
          <span className={`toggle-switch ${pushEnabled ? 'on' : ''}`}><span className="toggle-knob" /></span>
        </button>
        {nativePushSupported()&&nativePushState!=='registered'&&<p role="status" className="notif-saving">{nativePushState==='permission-denied'?(isAr?'صلاحية الإشعارات غير مفعلة. يمكنك السماح بها من إعدادات الهاتف.':'Notifications are not allowed. Enable them in phone settings.'):nativePushState==='not-configured'?(isAr?'إشعارات الهاتف غير متاحة في هذه النسخة بعد.':'Phone notifications are not available in this build yet.'):nativePushState==='offline'?(isAr?'سيُستكمل تفعيل إشعارات الهاتف عند عودة الاتصال.':'Phone notification setup will resume when online.'):nativePushState==='error'?(isAr?'تعذر ربط الجهاز بالإشعارات. اضغط تفعيل الإشعارات لإعادة المحاولة.':'Could not connect this device. Tap Enable Push Notifications to retry.'):(isAr?'جارٍ ربط هذا الجهاز بالإشعارات. أعد المحاولة إذا استمر الانتظار.':'Connecting this device to notifications. Retry if it does not finish.')}{nativePushState==='permission-denied'&&<button className="text-button" onClick={()=>void NativePush.openSettings()}>{isAr?'فتح إعدادات الإشعارات':'Open notification settings'}</button>}</p>}
        {error&&<p role="alert" className="feedback error">{error}</p>}
        {settings && toggles.map(({ key, label, icon: Icon }) => (
          <button key={key} className="notif-toggle-row" onClick={() => toggle(key)}>
            <span className="notif-toggle-icon"><Icon size={18} /></span>
            <span className="notif-toggle-label">{label}</span>
            <span className={`toggle-switch ${settings[key] ? 'on' : ''}`}><span className="toggle-knob" /></span>
          </button>
        ))}
        {saving && <div className="notif-saving">{isAr ? 'جاري الحفظ...' : 'Saving...'}</div>}
      </div>
    </div>
  );
}
