import { useEffect,useState } from 'react';
import { ArrowLeft, BadgeCheck, Bell, ChevronRight, Edit3, FileText, HelpCircle, Info, Languages, LogOut, MapPin, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase, type Language, type Profile } from '@/lib/supabase';
import { LEGAL_URLS, openLegalPage } from '@/lib/legal';
import { credentialVault } from '@/lib/credential-vault';
import {BlockedUsersScreen} from './BlockedUsersScreen';
import {AppUpdateControl} from './AppUpdateControl';
import {App} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';

type Props = {
  language: Language;
  profile: Profile;
  onBack: () => void;
  onSignOut: () => void;
  onEditProfile: () => void;
  onOpenNotificationSettings: () => void;
  onOpenVerification: () => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
};

export function SettingsScreen({ language, profile, onBack, onSignOut, onEditProfile, onOpenNotificationSettings, onOpenVerification, isAdmin, onOpenAdmin }: Props) {
  const isAr = language === 'ar';
  const [installedVersion,setInstalledVersion]=useState('');
  useEffect(()=>{if(Capacitor.isNativePlatform())void App.getInfo().then(info=>setInstalledVersion(info.version)).catch(()=>{});},[]);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showClearAutofill, setShowClearAutofill] = useState(false);
  const [showBlockedUsers,setShowBlockedUsers]=useState(false);
  const [autofillNotice, setAutofillNotice] = useState('');

  const copy = {
    back: isAr ? 'رجوع' : 'Back',
    title: isAr ? 'الإعدادات' : 'Settings',
    editProfile: isAr ? 'تعديل الملف الشخصي' : 'Edit Profile',
    language: isAr ? 'اللغة' : 'Language',
    notifSettings: isAr ? 'إعدادات الإشعارات' : 'Notification Settings',
    locationPerms: isAr ? 'إعدادات الموقع' : 'Location Settings',
    privacy: isAr ? 'سياسة الخصوصية' : 'Privacy Policy',
    terms: isAr ? 'شروط الخدمة' : 'Terms of Service',
    deleteAccount: isAr ? 'طلب حذف الحساب' : 'Request account deletion',
    help: isAr ? 'المساعدة والدعم' : 'Help & Support',
    about: isAr ? 'عن SHARek' : 'About SHARek',
    logout: isAr ? 'تسجيل الخروج' : 'Log out',
    logoutConfirm: isAr ? 'هل تريد تسجيل الخروج؟' : 'Do you want to log out?',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    confirmLogout: isAr ? 'تسجيل الخروج' : 'Log out',
    currentLang: isAr ? 'العربية' : 'English',
    accountEmail: isAr ? 'البريد الإلكتروني' : 'Email',
    aboutText: isAr ? 'SHARek منصة لمشاركة الطعام تربط المتبرعين بالأشخاص المحتاجين في نفس المجتمع. هدفنا تقليل هدر الطعام ومساعدة من يحتاجه.' : 'SHARek is a food-sharing platform connecting donors with people in need in the same community. Our goal is to reduce food waste and help those who need it.',
    helpText: isAr ? 'للمساعدة، تواصل معنا عبر البريد الإلكتروني أو راجع الأسئلة الشائعة. نحن هنا لمساعدتك في أي وقت.' : 'For help, contact us via email or check the FAQ. We are here to help you anytime.',
    locationText: isAr ? 'يستخدم التطبيق موقعك الحالي لإيجاد الوجبات المتاحة بالقرب منك. يمكنك إيقاف مشاركة الموقع من إعدادات جهازك.' : 'The app uses your current location to find available meals near you. You can stop sharing location from your device settings.',
    providerLabel: profile.provider === 'email' ? (isAr ? 'بريد إلكتروني' : 'Email') : profile.provider,
    version: installedVersion||'—',
    verification: isAr ? 'توثيق الحساب' : 'Account Verification',
    verified: isAr ? 'موثق' : 'Verified',
    admin: isAr ? 'لوحة الإدارة' : 'Admin Dashboard',
  };

  const toggleLocation = () => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'granted') {
          navigator.geolocation.getCurrentPosition(() => {});
        } else {
          setShowLocation(true);
        }
      });
    } else {
      setShowLocation(true);
    }
  };

  if(showBlockedUsers)return <BlockedUsersScreen language={language} onBack={()=>setShowBlockedUsers(false)}/>;

  return (
    <div className="notif-settings-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="notif-center-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <h2>{copy.title}</h2>
      </header>
      <div className="notif-settings-body" style={{ gap: '0' }}>
        <AppUpdateControl language={language} settings/>
        {isAdmin&&<button className="notif-toggle-row" onClick={()=>void supabase.functions.invoke('check-play-updates').then(({data,error})=>setAutofillNotice(error?(isAr?'تعذر التحقق من Google Play. تأكد من إعداد صلاحيات حساب الخدمة في الخادم.':'Could not verify Google Play. Check the server service-account permissions.'):(isAr?`تم التحقق من الإصدار الرسمي. إشعارات جديدة: ${data?.notifiedUsers??0}`:`Official release verified. New notifications: ${data?.notifiedUsers??0}`)))}>{isAr?'مزامنة إصدار Google Play وإشعاراته (أدمن)':'Sync Google Play release announcements (admin)'}</button>}
        {autofillNotice && <div className="feedback" role="status">{autofillNotice}</div>}
        <button className="notif-toggle-row" onClick={() => setShowClearAutofill(true)}>
          <span className="notif-toggle-icon"><Shield size={18} /></span>
          <span className="notif-toggle-label">{isAr ? 'مسح بيانات التعبئة المحفوظة من هذا الجهاز' : 'Clear saved autofill from this device'}</span>
          <ChevronRight size={16} style={{ marginInlineStart: 'auto' }} />
        </button>
        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={onEditProfile}>
          <span className="notif-toggle-icon"><Edit3 size={18} /></span>
          <span className="notif-toggle-label">{copy.editProfile}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={onOpenVerification}>
          <span className="notif-toggle-icon"><ShieldCheck size={18} /></span>
          <span className="notif-toggle-label">{copy.verification}</span>
          {profile.is_verified
            ? <span style={{ marginInlineStart: 'auto', color: '#0f766e', fontSize: '.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><BadgeCheck size={14} />{copy.verified}</span>
            : <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />}
        </button>

        {isAdmin && (
          <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={onOpenAdmin}>
            <span className="notif-toggle-icon"><Shield size={18} /></span>
            <span className="notif-toggle-label">{copy.admin}</span>
            <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
          </button>
        )}

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={() => { void supabase.from('profiles').update({ language: language === 'ar' ? 'en' : 'ar' }).eq('id', profile.id).then(() => window.location.reload()); }}>
          <span className="notif-toggle-icon"><Languages size={18} /></span>
          <span className="notif-toggle-label">{copy.language}</span>
          <span style={{ marginInlineStart: 'auto', color: '#967f70', fontSize: '.78rem' }}>{copy.currentLang}</span>
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={onOpenNotificationSettings}>
          <span className="notif-toggle-icon"><Bell size={18} /></span>
          <span className="notif-toggle-label">{copy.notifSettings}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={toggleLocation}>
          <span className="notif-toggle-icon"><MapPin size={18} /></span>
          <span className="notif-toggle-label">{copy.locationPerms}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={() => void openLegalPage(LEGAL_URLS.privacy)}>
          <span className="notif-toggle-icon"><Shield size={18} /></span>
          <span className="notif-toggle-label">{copy.privacy}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={() => setShowBlockedUsers(true)}>
          <span className="notif-toggle-icon"><Shield size={18} /></span>
          <span className="notif-toggle-label">{isAr?'المستخدمون المحظورون':'Blocked Users'}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={() => void openLegalPage(LEGAL_URLS.terms)}>
          <span className="notif-toggle-icon"><FileText size={18} /></span>
          <span className="notif-toggle-label">{copy.terms}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={() => void openLegalPage(LEGAL_URLS.deleteAccount)}>
          <span className="notif-toggle-icon"><Trash2 size={18} /></span>
          <span className="notif-toggle-label">{copy.deleteAccount}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={() => setShowHelp(true)}>
          <span className="notif-toggle-icon"><HelpCircle size={18} /></span>
          <span className="notif-toggle-label">{copy.help}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer' }} onClick={() => setShowAbout(true)}>
          <span className="notif-toggle-icon"><Info size={18} /></span>
          <span className="notif-toggle-label">{copy.about}</span>
          <ChevronRight size={16} style={{ color: '#c4b0a4', marginInlineStart: 'auto' }} />
        </button>

        <button className="notif-toggle-row" style={{ cursor: 'pointer', color: '#b14c38' }} onClick={() => setShowLogoutConfirm(true)}>
          <span className="notif-toggle-icon" style={{ color: '#b14c38' }}><LogOut size={18} /></span>
          <span className="notif-toggle-label" style={{ color: '#b14c38' }}>{copy.logout}</span>
        </button>

        <div style={{ textAlign: 'center', padding: '20px', color: '#c4b0a4', fontSize: '.72rem' }}>SHARek v{copy.version}</div>
      </div>

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{copy.about}</h3>
            <p style={{ color: '#684c3c', lineHeight: 1.6, fontSize: '.84rem' }}>{copy.aboutText}</p>
            <button className="primary-button" onClick={() => setShowAbout(false)} style={{ marginTop: '16px', width: '100%' }}>{isAr ? 'حسنًا' : 'OK'}</button>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{copy.help}</h3>
            <p style={{ color: '#684c3c', lineHeight: 1.6, fontSize: '.84rem' }}>{copy.helpText}</p>
            <button className="primary-button" onClick={() => setShowHelp(false)} style={{ marginTop: '16px', width: '100%' }}>{isAr ? 'حسنًا' : 'OK'}</button>
          </div>
        </div>
      )}

      {showLocation && (
        <div className="modal-overlay" onClick={() => setShowLocation(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{copy.locationPerms}</h3>
            <p style={{ color: '#684c3c', lineHeight: 1.6, fontSize: '.84rem' }}>{copy.locationText}</p>
            <button className="primary-button" onClick={() => setShowLocation(false)} style={{ marginTop: '16px', width: '100%' }}>{isAr ? 'حسنًا' : 'OK'}</button>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: '8px' }}>{copy.logoutConfirm}</h3>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="text-button" style={{ flex: 1 }} onClick={() => setShowLogoutConfirm(false)}>{copy.cancel}</button>
              <button className="primary-button" style={{ flex: 1, background: '#b14c38' }} onClick={() => { setShowLogoutConfirm(false); onSignOut(); }}>{copy.confirmLogout}</button>
            </div>
          </div>
        </div>
      )}
      {showClearAutofill && <div className="modal-overlay"><div className="modal-card" role="dialog" aria-modal="true" aria-label={isAr ? 'مسح بيانات التعبئة' : 'Clear autofill'}><h3>{isAr ? 'مسح بيانات التعبئة من هذا الجهاز؟' : 'Clear autofill from this device?'}</h3><p>{isAr ? 'ستُمسح كلمات المرور والاسترداد المحفوظة محليًا. احتفظ بنسخة آمنة قبل المسح.' : 'Local passwords and recovery words will be removed. Keep a safe backup first.'}</p><button className="primary-button danger" onClick={() => { void credentialVault.clear().then(() => { setShowClearAutofill(false); setAutofillNotice(isAr ? 'تم مسح بيانات التعبئة من هذا الجهاز.' : 'Autofill was cleared from this device.'); }).catch(() => { setShowClearAutofill(false); setAutofillNotice(isAr ? 'تعذر مسح البيانات. أعد المحاولة.' : 'Could not clear data. Please retry.'); }); }}>{isAr ? 'تأكيد المسح' : 'Confirm clear'}</button><button className="text-button" onClick={() => setShowClearAutofill(false)}>{copy.cancel}</button></div></div>}
    </div>
  );
}
