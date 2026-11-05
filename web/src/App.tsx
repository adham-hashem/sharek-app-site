import { communityChatTarget } from '@/lib/community-chat';
import { useDeviceLocation } from '@/lib/use-device-location';
import { useNearbyMealPresence } from '@/lib/use-nearby-meal-presence';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleUserRound,
  ChevronDown,
  ChevronUp,
  Globe2,
  Heart,
  Home,
  Languages,
  LogOut,
  MapPin,
  Menu,
  PackageOpen,
  Search,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { AUTH_STORAGE_KEY, NATIVE_OAUTH_REDIRECT_URL, supabase, type CommunityMeal, type Language, type Meal, type MealRequest, type Profile, type Religion, type UserRole } from '@/lib/supabase';
import { useCommunityMeals } from '@/lib/use-community-meals';
import {detachPush} from '@/lib/native-push';
import {notificationTarget} from '@/lib/notification-target';
import { advanceMealRequest,isActiveHandover,isReceived,MEAL_REQUEST_SAVED,mergeRequestSnapshot } from '@/lib/meal-operations';
import { LEGAL_URLS, openLegalPage } from '@/lib/legal';
import { AUTH_FEATURES } from '@/lib/auth-flags';
import { AccountAuth } from '@/components/AccountAuth';
import {CharityAcknowledgmentGate} from '@/components/CharityAcknowledgmentGate';
import {parseMealLink} from '@/lib/meal-share';
import {GoodnessMarket,parseMarketLink} from '@/components/GoodnessMarket';
import {AppUpdateControl} from '@/components/AppUpdateControl';
import {SharedMealView} from '@/components/SharedMealView';
import { secureStorage, blockAuthStorageWrites } from '@/lib/secure-storage';
import type { Session } from '@supabase/supabase-js';
import { MapView } from '@/components/MapView';
import { BeneficiaryNavigation } from '@/components/BeneficiaryNavigation';
import {DonorMealManagement} from '@/components/DonorMealManagement';
import {ReceiptFollowups} from '@/components/ReceiptFollowups';
import { MealRequestFlow } from '@/components/MealRequestFlow';
import { HelperSetup } from '@/components/HelperSetup';
import { CommunitySection } from '@/components/CommunitySection';
import { ChatWindow } from '@/components/ChatWindow';
import { ConversationList } from '@/components/ConversationList';
import { MessageCircle } from 'lucide-react';
import { ShareMeal } from '@/components/ShareMeal';
import { MyMeals } from '@/components/MyMeals';
import { DonorProfile } from '@/components/DonorProfile';
import { MealDetail } from '@/components/MealDetail';
import { Bell, Heart as HeartIcon, List, Settings as SettingsIcon, Gift, FileText, Building2 } from 'lucide-react';
import { NearbyCharities } from '@/components/NearbyCharities';
import { NotificationProvider, useNotifications } from '@/components/NotificationProvider';
import { NotificationCenter } from '@/components/NotificationCenter';
import { NotificationSettings } from '@/components/NotificationSettings';
import { BeneficiaryProfile } from '@/components/BeneficiaryProfile';
import { SettingsScreen } from '@/components/SettingsScreen';
import { VerificationScreen } from '@/components/VerificationScreen';
import {NotifiedHelpProfile} from '@/components/NotifiedHelpProfile';
import {FinancialSupportScreen} from '@/components/FinancialSupportScreen';
import { AdminDashboard } from '@/components/AdminDashboard';
import { QuranDashboard } from '@/components/QuranDashboard';
import { QuranReader } from '@/components/QuranReader';
import { QuranIndexNav } from '@/components/QuranIndexNav';
import { BookOpen } from 'lucide-react';
import { HelpSupportScreen } from '@/components/HelpSupportScreen';
import { ReportUserSheet } from '@/components/ReportUserSheet';
import { MyReports } from '@/components/MyReports';

type Stage = 'welcome' | 'language' | 'country' | 'religion' | 'role' | 'auth' | 'app';

type Country = { code: string; name: string; arabic: string; flag: string; dial: string };

// Keep the Google OAuth flow available in source for a future release.
const ENABLE_GOOGLE_SIGN_IN = AUTH_FEATURES.google;
const ENABLE_FACEBOOK_SIGN_IN = AUTH_FEATURES.facebook;

const countryPriorityCodes = ['EG', 'AE', 'SA'];
const countries: Country[] = [
  { code: 'EG', name: 'Egypt', arabic: 'مصر', flag: '🇪🇬', dial: '+20' },
  { code: 'AE', name: 'United Arab Emirates', arabic: 'الإمارات', flag: '🇦🇪', dial: '+971' },
  { code: 'SA', name: 'Saudi Arabia', arabic: 'السعودية', flag: '🇸🇦', dial: '+966' },
  { code: 'JO', name: 'Jordan', arabic: 'الأردن', flag: '🇯🇴', dial: '+962' },
  { code: 'MA', name: 'Morocco', arabic: 'المغرب', flag: '🇲🇦', dial: '+212' },
  { code: 'TN', name: 'Tunisia', arabic: 'تونس', flag: '🇹🇳', dial: '+216' },
  { code: 'DZ', name: 'Algeria', arabic: 'الجزائر', flag: '🇩🇿', dial: '+213' },
  { code: 'LB', name: 'Lebanon', arabic: 'لبنان', flag: '🇱🇧', dial: '+961' },
  { code: 'GB', name: 'United Kingdom', arabic: 'المملكة المتحدة', flag: '🇬🇧', dial: '+44' },
  { code: 'US', name: 'United States', arabic: 'الولايات المتحدة', flag: '🇺🇸', dial: '+1' },
  { code: 'CA', name: 'Canada', arabic: 'كندا', flag: '🇨🇦', dial: '+1' },
  { code: 'FR', name: 'France', arabic: 'فرنسا', flag: '🇫🇷', dial: '+33' },
  { code: 'DE', name: 'Germany', arabic: 'ألمانيا', flag: '🇩🇪', dial: '+49' },
  { code: 'IT', name: 'Italy', arabic: 'إيطاليا', flag: '🇮🇹', dial: '+39' },
  { code: 'ES', name: 'Spain', arabic: 'إسبانيا', flag: '🇪🇸', dial: '+34' },
  { code: 'TR', name: 'Türkiye', arabic: 'تركيا', flag: '🇹🇷', dial: '+90' },
  { code: 'IN', name: 'India', arabic: 'الهند', flag: '🇮🇳', dial: '+91' },
  { code: 'PK', name: 'Pakistan', arabic: 'باكستان', flag: '🇵🇰', dial: '+92' },
  { code: 'ID', name: 'Indonesia', arabic: 'إندونيسيا', flag: '🇮🇩', dial: '+62' },
  { code: 'MY', name: 'Malaysia', arabic: 'ماليزيا', flag: '🇲🇾', dial: '+60' },
  { code: 'NG', name: 'Nigeria', arabic: 'نيجيريا', flag: '🇳🇬', dial: '+234' },
  { code: 'ZA', name: 'South Africa', arabic: 'جنوب أفريقيا', flag: '🇿🇦', dial: '+27' },
  { code: 'AU', name: 'Australia', arabic: 'أستراليا', flag: '🇦🇺', dial: '+61' },
  { code: 'BR', name: 'Brazil', arabic: 'البرازيل', flag: '🇧🇷', dial: '+55' },
  { code: 'MX', name: 'Mexico', arabic: 'المكسيك', flag: '🇲🇽', dial: '+52' },
];



type Copy = {
  continue: string; back: string; skip: string; search: string; selected: string; welcomeSub: string;
  languageTitle: string; languageSub: string; countryTitle: string; countrySub: string; popular: string; all: string;
  religionTitle: string; religionSub: string; religionMuslim: string; religionChristian: string; religionOther: string; religionNoAnswer: string; religionNote: string; roleTitle: string; roleSub: string; beneficiary: string; beneficiaryDesc: string;
  donor: string; donorDesc: string; signIn: string; signUp: string; email: string; password: string; forgot: string;
  newHere: string; existing: string; reset: string; resetSub: string; resetSent: string; google: string; facebook: string;
  home: string; profile: string; signOut: string; nearby: string; beneficiaryHome: string; donorHome: string; nearbySub: string;
  donorSub: string; needMeal: string; shareMeal: string; noMeals: string; needHelp: string; meals: string; requests: string;
  locationNote: string; locationTitle: string; account: string; accountSub: string; status: string; requestDone: string;
  requestSub: string; close: string; accept: string; optional: string; passwordMin: string; invalidEmail: string;
  authError: string; emailConfirm: string; isAr: boolean;
};

const copy: Record<Language, Copy> = {
  ar: {
    continue: 'متابعة', back: 'رجوع', skip: 'تخطي', search: 'بحث', selected: 'محدد', welcomeSub: 'شارك طعامك... شارك الخير', languageTitle: 'اختر لغتك', languageSub: 'اختر اللغة التي تفضلها لتجربة SHARek', countryTitle: 'اختر دولتك', countrySub: 'سنستخدم ذلك لتخصيص تجربتك', popular: 'الدول الشائعة', all: 'جميع الدول', religionTitle: 'اختر ديانتك', religionSub: 'هذا الاختيار اختياري تمامًا', religionMuslim: 'مسلم', religionChristian: 'مسيحي', religionOther: 'ديانة أخرى', religionNoAnswer: 'أفضل عدم الإجابة', religionNote: 'اختياري · إجابتك لا تؤثر أبدًا على الخدمات المتاحة لك', roleTitle: 'كيف تحب تشارك في SHARek؟', roleSub: 'كل مساهمة، مهما كانت صغيرة، تصنع فرقًا', beneficiary: 'محتاج وجبة', beneficiaryDesc: 'اعثر على وجبات متاحة بالقرب منك أو اطلب المساعدة.', donor: 'متبرع بالطعام', donorDesc: 'شارك الطعام الفائض وساعد الأشخاص القريبين منك.', signIn: 'تسجيل الدخول', signUp: 'إنشاء حساب', email: 'البريد الإلكتروني', password: 'كلمة المرور', forgot: 'هل نسيت كلمة المرور؟', newHere: 'ليس لديك حساب؟', existing: 'لديك حساب بالفعل؟', reset: 'إرسال رابط الاستعادة', resetSub: 'أدخل بريدك الإلكتروني وسنرسل لك رابطًا آمنًا.', resetSent: 'تم إرسال رابط الاستعادة إلى بريدك الإلكتروني.', google: 'المتابعة باستخدام Google', facebook: 'المتابعة باستخدام Facebook', home: 'الرئيسية', profile: 'الملف الشخصي', signOut: 'تسجيل الخروج', nearby: 'بالقرب منك', beneficiaryHome: 'وجبتك التالية أقرب مما تتخيل', donorHome: 'شارك الخير من حولك', nearbySub: 'اكتشف الوجبات المتاحة في مجتمعك', donorSub: 'قدّم فائض طعامك لمن يحتاجه', needMeal: 'أحتاج وجبة', shareMeal: 'شارك طعام الآن', noMeals: 'لا توجد وجبات متاحة بالقرب منك', needHelp: 'اطلب المساعدة وسنبحث لك عن متبرع قريب.', meals: 'وجبات متاحة', requests: 'طلبات قريبة', locationNote: 'الخريطة التفاعلية ستظهر هنا بعد تفعيل خرائط Google.', locationTitle: 'اكتشف مجتمعك', account: 'حسابك جاهز', accountSub: 'أنت الآن جزء من مجتمع يشارك الخير.', status: 'نشط', requestDone: 'تم تسجيل طلبك', requestSub: 'سنبحث عن أقرب متبرع مناسب لمساعدتك.', close: 'إغلاق', accept: 'اختيار', optional: 'اختياري', passwordMin: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل', invalidEmail: 'أدخل بريدًا إلكترونيًا صحيحًا', authError: 'تعذر إكمال العملية. تحقق من بياناتك وحاول مرة أخرى.', emailConfirm: 'تم إنشاء حسابك. يمكنك تسجيل الدخول الآن.', isAr: true,
  },
  en: {
    continue: 'Continue', back: 'Back', skip: 'Skip', search: 'Search', selected: 'Selected', welcomeSub: 'Share Food. Share Goodness.', languageTitle: 'Choose your language', languageSub: 'Select the language you prefer for your SHARek experience', countryTitle: 'Choose your country', countrySub: "We'll use this to personalize your experience", popular: 'Popular countries', all: 'All countries', religionTitle: 'Choose your religion', religionSub: 'This choice is completely optional', religionMuslim: 'Muslim', religionChristian: 'Christian', religionOther: 'Other', religionNoAnswer: 'Prefer not to say', religionNote: 'Optional · Your answer never affects the services available to you', roleTitle: 'How would you like to share in SHARek?', roleSub: 'Every contribution, no matter how small, makes a difference', beneficiary: 'I need a meal', beneficiaryDesc: 'Find available meals nearby or ask the community for help.', donor: 'I share food', donorDesc: 'Share surplus food and support people near you.', signIn: 'Log in', signUp: 'Create account', email: 'Email address', password: 'Password', forgot: 'Forgot password?', newHere: 'New to SHARek?', existing: 'Already have an account?', reset: 'Send reset link', resetSub: "Enter your email and we'll send a secure reset link.", resetSent: 'A reset link has been sent to your email.', google: 'Continue with Google', facebook: 'Continue with Facebook', home: 'Home', profile: 'Profile', signOut: 'Log out', nearby: 'Near you', beneficiaryHome: 'Your next meal is closer than you think', donorHome: 'Share goodness around you', nearbySub: 'Discover available meals in your community', donorSub: 'Give your surplus food to someone who needs it', needMeal: 'I need a meal', shareMeal: 'Share food now', noMeals: 'No meals available nearby', needHelp: "Ask for help and we'll look for a nearby donor.", meals: 'Available meals', requests: 'Nearby requests', locationNote: 'The interactive map will appear here once Google Maps is enabled.', locationTitle: 'Discover your community', account: 'Your account is ready', accountSub: "You're now part of a community that shares goodness.", status: 'Active', requestDone: 'Your request is registered', requestSub: "We'll look for the closest suitable donor to help you.", close: 'Close', accept: 'Select', optional: 'Optional', passwordMin: 'Password must be at least 6 characters', invalidEmail: 'Enter a valid email address', authError: "We couldn't complete that. Check your details and try again.", emailConfirm: 'Your account was created. You can log in now.', isAr: false,
  },
};

function App() {
  const [sharedMealToken,setSharedMealToken]=useState<string|null>(()=>{try{return parseMealLink(window.location.href)??sessionStorage.getItem('sharek-pending-meal-token');}catch{return null;}});
  const closeSharedMeal=useCallback(()=>{setSharedMealToken(null);try{sessionStorage.removeItem('sharek-pending-meal-token');}catch{}},[]);
  useEffect(()=>{
    const accept=(raw:string)=>{const marketId=parseMarketLink(raw);if(marketId){sessionStorage.setItem('sharek-pending-marketplace',marketId);window.dispatchEvent(new CustomEvent('sharek-open-marketplace',{detail:marketId}));return;}const token=parseMealLink(raw);if(token){setSharedMealToken(token);try{sessionStorage.setItem('sharek-pending-meal-token',token);}catch{}}};
    if(!Capacitor.isNativePlatform())return;
    const listener=CapacitorApp.addListener('appUrlOpen',({url})=>accept(url));
    void CapacitorApp.getLaunchUrl().then(result=>{if(result?.url)accept(result.url);});
    return()=>{void listener.then(handle=>handle.remove());};
  },[]);
  const [stage, setStage] = useState<Stage>('welcome');
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('sharek-language') === 'en' ? 'en' : 'ar');
  const [country, setCountry] = useState<Country | null>(null);
  const [religion, setReligion] = useState<Religion | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const [pendingStage, setPendingStage] = useState<Stage | null>(null);
  const [authError, setAuthError] = useState('');
  const [bootError, setBootError] = useState(false);
  const t = copy[language];
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => { localStorage.setItem('sharek-language', language); }, [language]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || stage === 'auth' || stage === 'app') return;
    const listener = CapacitorApp.addListener('backButton', () => {
      if(document.querySelector('.chat-image-viewer')){window.dispatchEvent(new Event('sharek-close-image'));return;}
      if(!window.dispatchEvent(new Event('sharek-navigation-back',{cancelable:true})))return;
      if (stage === 'country') setStage('language');
      else if (stage === 'religion') setStage('country');
      else if (stage === 'role') setStage('religion');
      else void CapacitorApp.minimizeApp();
    });
    return () => { void listener.then(value => value.remove()); };
  }, [stage]);

  useEffect(() => {
    let mounted = true;
    let loadingUser: Promise<void> | null = null;
    let lastUser = '';
    let restored = false;
    let authRevision = 0;
    let signedOut = false;
    const removers: Array<() => void> = [];
    const applyProfile = (value: Profile) => {
      if (!mounted) return;
      setProfile(value); setLanguage(value.language);
      setCountry(countries.find(item => item.code === value.country_code) ?? null);
      setReligion(value.religion); setRole(value.role);
      setPendingStage('app'); setSessionLoading(false); setBootError(false); restored = true;
    };
    const cachedProfile = async (userId: string) => {
      const raw = await secureStorage.getItem('sharek-profile-v1');
      if (!raw) return null;
      try { const value = JSON.parse(raw) as Profile; return value.id === userId ? value : null; } catch { return null; }
    };
    const loadSession = (session: Session): Promise<void> => {
      if (signedOut) return Promise.resolve();
      if (loadingUser && lastUser === session.user.id) return loadingUser;
      lastUser = session.user.id;
      const revision = authRevision;
      loadingUser = (async () => {
        const cache = await cachedProfile(session.user.id);
        if (!mounted || revision !== authRevision) return;
        if (cache) applyProfile(cache);
        let { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
        if (!mounted || revision !== authRevision) return;
        if (error) { if (!cache) { setBootError(true); setSessionLoading(false); } return; }
        const legacyProvider = localStorage.getItem('sharek-oauth-pending');
        if (!data && ((legacyProvider === 'google' && AUTH_FEATURES.google) || (legacyProvider === 'facebook' && AUTH_FEATURES.facebook))) {
          // Preserve first-time OAuth profile creation for a future enabled release.
          let saved: { language?: Language; country?: string; religion?: Religion; role?: UserRole } = {};
          try { saved = JSON.parse(localStorage.getItem('sharek-oauth-onboarding') ?? '{}'); } catch { /* Use defaults. */ }
          const selectedCountry = countries.find(item => item.code === saved.country);
          const selectedLanguage = saved.language === 'en' ? 'en' : 'ar';
          const metadata = session.user.user_metadata ?? {};
          const result = await supabase.from('profiles').upsert({ id: session.user.id,
            display_name: typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : null,
            avatar_url: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : typeof metadata.picture === 'string' ? metadata.picture : null,
            language: selectedLanguage, country_code: selectedCountry?.code ?? null,
            country_name: selectedCountry ? (selectedLanguage === 'ar' ? selectedCountry.arabic : selectedCountry.name) : null,
            religion: saved.religion ?? null, role: saved.role ?? 'beneficiary', provider: legacyProvider,
          }).select().maybeSingle();
          if (!mounted || revision !== authRevision) return;
          data = result.data; error = result.error;
          if (error) { setAuthError('تعذر إعداد الحساب. حاول مرة أخرى.'); setPendingStage('auth'); setSessionLoading(false); return; }
        }
        if (data) {
          applyProfile(data as Profile);
          await secureStorage.setItem('sharek-profile-v1', JSON.stringify(data));
        } else { setPendingStage('language'); setSessionLoading(false); }
        localStorage.removeItem('sharek-oauth-pending');
        localStorage.removeItem('sharek-oauth-onboarding');
      })().finally(() => { loadingUser = null; });
      return loadingUser;
    };
    const restore = async () => {
      const revision = authRevision;
      try {
        const raw = await secureStorage.getItem(AUTH_STORAGE_KEY);
        if (!mounted || revision !== authRevision || signedOut) return;
        let hasStoredSession = false;
        if (raw) {
          try {
            const session = JSON.parse(raw) as Session;
            if (session.user?.id && session.refresh_token && session.access_token) {
              hasStoredSession = true;
            }
          } catch { /* Supabase will validate the stored session. */ }
        }
        if (!hasStoredSession && mounted) { setPendingStage('language'); setSessionLoading(false); }
        const timeout = window.setTimeout(() => { if (mounted && revision === authRevision && !signedOut && !restored && hasStoredSession) { setBootError(true); setSessionLoading(false); } }, 10000);
        const { data, error } = await supabase.auth.getSession();
        window.clearTimeout(timeout);
        if (!mounted || revision !== authRevision || signedOut) return;
        if (data.session) await loadSession(data.session);
        else if (error && hasStoredSession) { if (!restored) { setBootError(true); setSessionLoading(false); } }
        else { setPendingStage('language'); setSessionLoading(false); setBootError(false); }
      } catch { if (mounted && revision === authRevision && !signedOut) { setBootError(true); setSessionLoading(false); } }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        void detachPush().catch(()=>{});
        authRevision++; signedOut = true; lastUser = ''; loadingUser = null;
        restored = false;
        void secureStorage.removeItem('sharek-profile-v1');
        if (mounted) { setProfile(null); setBootError(false); setSessionLoading(false); setPendingStage('auth'); setStage('auth'); }
      } else if (session && ['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED'].includes(event)) {
        if (lastUser && lastUser !== session.user.id) authRevision++;
        if (event === 'SIGNED_IN') signedOut = false;
        const revision = authRevision;
        window.setTimeout(() => { if (revision === authRevision) void loadSession(session).catch(() => { if (mounted && revision === authRevision && !restored) setBootError(true); }); }, 0);
      }
    });
    const reconnect = () => { supabase.auth.startAutoRefresh(); void restore(); };
    window.addEventListener('online', reconnect);
    removers.push(() => window.removeEventListener('online', reconnect));
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) reconnect(); else supabase.auth.stopAutoRefresh();
      }).then(value => { if (mounted) removers.push(() => { void value.remove(); }); else void value.remove(); });
      // OAuth remains available behind flags; disabled releases ignore provider callbacks.
      if (AUTH_FEATURES.google || AUTH_FEATURES.facebook) {
        const returnFromOAuth = async (rawUrl: string) => {
          if (!rawUrl.startsWith(NATIVE_OAUTH_REDIRECT_URL)) return;
          const target = new URL(rawUrl), code = target.searchParams.get('code');
          if (!code) { setAuthError(target.searchParams.get('error_description') ?? 'لم يكتمل تسجيل الدخول.'); setPendingStage('auth'); return; }
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) { setAuthError(error.message); setPendingStage('auth'); }
        };
        void CapacitorApp.addListener('appUrlOpen', ({ url }) => { void returnFromOAuth(url); }).then(value => { if (mounted) removers.push(() => { void value.remove(); }); else void value.remove(); });
        void CapacitorApp.getLaunchUrl().then(result => { if (result?.url) void returnFromOAuth(result.url); });
      }
    }
    void restore();
    return () => { mounted = false; listener.subscription.unsubscribe(); removers.forEach(remove => remove()); };
  }, []);

  const receiveSession = async (session: Session) => {
    const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
  };
  const logout = async () => {
    try{await detachPush();}catch{window.alert(language==='ar'?'تعذر فصل إشعارات الجهاز. حاول تسجيل الخروج مجددًا.':'Could not detach device notifications. Please retry signing out.');return;}
    blockAuthStorageWrites(); supabase.auth.stopAutoRefresh();
    await Promise.race([supabase.auth.signOut({ scope: 'local' }).catch(() => undefined), new Promise(resolve => window.setTimeout(resolve, 4000))]);
    await secureStorage.removeItem(AUTH_STORAGE_KEY);
    await secureStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
    await secureStorage.removeItem('sharek-profile-v1');
    localStorage.removeItem('sharek-oauth-pending'); localStorage.removeItem('sharek-oauth-onboarding');
    window.location.reload();
  };

  useEffect(() => {
    if (stage !== 'welcome') return;
    const timer = window.setTimeout(() => setSplashDone(true), 1900);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (splashDone && !sessionLoading && pendingStage) setStage(pendingStage);
  }, [pendingStage, sessionLoading, splashDone]);

  if (bootError) return <div className="loading-screen" dir={dir}><p>{language === 'ar' ? 'جلستك محفوظة. تعذر الاتصال للتحقق منها الآن.' : 'Your session is saved. Connection is unavailable.'}</p><button className="primary-button" onClick={() => window.location.reload()}>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button><button className="text-button" onClick={() => void logout()}>{language === 'ar' ? 'تسجيل الدخول مجددًا' : 'Sign in again'}</button></div>;
  if (stage === 'welcome') return <Welcome />;
  if (sessionLoading) return <div className="loading-screen"><div className="loader-dot" /><span>SHARek</span></div>;

  return <main dir={dir} className="app-shell">
    {stage !== 'app' && <div className="ambient ambient-one" />}
    {stage !== 'app' && <div className="ambient ambient-two" />}
    {stage === 'language' && <LanguageScreen language={language} setLanguage={setLanguage} t={copy[language]} onContinue={() => setStage('country')} />}
    {stage === 'country' && <CountryScreen language={language} country={country} setCountry={setCountry} t={t} onBack={() => setStage('language')} onContinue={() => setStage('religion')} />}
    {stage === 'religion' && <ReligionScreen religion={religion} setReligion={setReligion} t={t} onBack={() => setStage('country')} onContinue={() => setStage('role')} />}
    {stage === 'role' && <RoleScreen language={language} role={role} setRole={setRole} t={t} onBack={() => setStage('religion')} onContinue={() => setStage('auth')} />}
    {stage === 'auth' && <AccountAuth language={language} onBack={() => setStage('role')} onSession={receiveSession}
      onboarding={{ language, countryCode: country?.code, countryName: country ? (language === 'ar' ? country.arabic : country.name) : null, religion, role }}
      legacyOAuth={(AUTH_FEATURES.google || AUTH_FEATURES.facebook) ? <LegacyOAuthScreen language={language} t={t} onBack={() => setStage('role')} initialError={authError} onboardingState={{ language, country, religion, role }} /> : null} />}
    {stage === 'app' && profile && (<CharityAcknowledgmentGate key={`${profile.id}:${profile.role}`} profile={profile}><NotificationProvider userId={profile?.id ?? null} language={language}><HomeScreen sharedMealToken={sharedMealToken} onCloseSharedMeal={closeSharedMeal} language={language} profile={profile} role={role ?? profile?.role ?? 'beneficiary'} t={t} onSignOut={logout} setProfile={setProfile} /></NotificationProvider></CharityAcknowledgmentGate>)}
  </main>;
}

function Welcome() {
  return <div className="welcome-screen"><div className="welcome-content"><img className="logo logo-welcome" src={import.meta.env.BASE_URL+'image.png'} alt="SHARek" /><div className="welcome-copy" aria-hidden="true" /></div></div>;
}

function Progress({ active, label }: { active: number; label?: string }) {
  return <div className="progress-dots" aria-label={label ?? `${active} of 4`}>{[0, 1, 2, 3].map((dot) => <span className={dot === active ? 'active' : ''} key={dot} />)}</div>;
}

function ScreenFrame({ children, active, t, onBack, back = true }: { children: React.ReactNode; active: number; t: Copy; onBack?: () => void; back?: boolean }) {
  return <section className="onboarding-screen"><header className="topbar">{back ? <button className="icon-button" onClick={onBack} aria-label={t.back}>{active === 2 && t.isAr ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}</button> : <div className="topbar-spacer" />}<img src={import.meta.env.BASE_URL+'image.png'} alt="SHARek" className="logo logo-small" /><div className="topbar-spacer" /></header><Progress active={active} label={active === 2 ? (t.isAr ? 'الخطوة 3 من 4' : 'Step 3 of 4') : undefined} />{children}</section>;
}

function LanguageScreen({ language, setLanguage, t, onContinue }: { language: Language; setLanguage: (value: Language) => void; t: Copy; onContinue: () => void }) {
  const [query, setQuery] = useState('');
  const options = [{ value: 'ar' as Language, label: 'العربية', native: 'Arabic' }, { value: 'en' as Language, label: 'English', native: 'English' }].filter((item) => `${item.label} ${item.native}`.toLowerCase().includes(query.toLowerCase()));
  return <ScreenFrame active={0} t={t} back={false}><div className="onboarding-content"><div className="section-heading"><span className="section-icon"><Languages size={21} /></span><h2>{t.languageTitle}</h2><p>{t.languageSub}</p></div><div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></div><div className="selection-list">{options.map((item) => <button className={`choice-row ${language === item.value ? 'selected' : ''}`} key={item.value} onClick={() => setLanguage(item.value)}><span><b>{item.label}</b><small>{item.native}</small></span>{language === item.value ? <span className="check-mark"><Check size={16} /></span> : <span className="radio" />}</button>)}</div><div className="selection-note"><Globe2 size={17} /><span>{language === 'ar' ? 'يمكنك تغيير اللغة لاحقًا من الإعدادات' : 'You can change your language later in Settings'}</span></div><button className="primary-button" disabled={!language} onClick={onContinue}>{t.continue}<ArrowRight size={18} /></button></div></ScreenFrame>;
}

function CountryScreen({ language, country, setCountry, t, onBack, onContinue }: { language: Language; country: Country | null; setCountry: (value: Country) => void; t: Copy; onBack: () => void; onContinue: () => void }) {
  const [query, setQuery] = useState('');
  const isAr = language === 'ar';
  const filtered = useMemo(() => countries.filter((item) => `${item.name} ${item.arabic} ${item.dial}`.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  const popular = filtered.filter((item) => countryPriorityCodes.includes(item.code));
  const all = filtered.filter((item) => !countryPriorityCodes.includes(item.code));
  const renderCountry = (item: Country) => <button className={`country-row ${country?.code === item.code ? 'selected' : ''}`} key={item.code} onClick={() => setCountry(item)}><img className="country-flag-emoji" src={`https://flagcdn.com/w40/${item.code.toLowerCase()}.png`} alt={isAr ? `علم ${item.arabic}` : `${item.name} flag`} loading="lazy" /><span className="country-name"><b>{isAr ? item.arabic : item.name}</b><small>{isAr ? item.name : item.arabic}</small></span><span className="dial">{item.dial}</span>{country?.code === item.code && <Check size={17} className="country-check" />}</button>;
  const noResults = filtered.length === 0;
  return <section className="onboarding-screen country-screen"><header className="topbar"><button className="icon-button" onClick={onBack} aria-label={t.back}><ArrowLeft size={20} /></button><img src={import.meta.env.BASE_URL+'image.png'} alt="SHARek" className="logo logo-small" /><div className="topbar-spacer" /></header><Progress active={1} /><div className="country-screen-header"><div className="section-heading"><span className="section-icon"><MapPin size={21} /></span><h2>{t.countryTitle}</h2><p>{t.countrySub}</p></div><div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></div></div><div className="country-screen-list">{noResults ? <div className="country-empty"><Globe2 size={22} /><span>{isAr ? 'لا توجد نتائج' : 'No results found'}</span></div> : <>{popular.length > 0 && <><h3 className="list-label">{t.popular}</h3><div className="country-list">{popular.map(renderCountry)}</div></>}{all.length > 0 && <><h3 className="list-label">{t.all}</h3><div className="country-list">{all.map(renderCountry)}</div></>}</>}</div><div className="country-screen-footer"><button className="primary-button" disabled={!country} onClick={onContinue}>{t.continue}<ArrowRight size={18} /></button><button className="text-button" disabled={!country} onClick={onContinue}>{t.skip}</button></div></section>;
}

function ReligionScreen({ religion, setReligion, t, onBack, onContinue }: { religion: Religion | null; setReligion: (value: Religion) => void; t: Copy; onBack: () => void; onContinue: () => void }) {
  const options: { value: Religion; label: string; icon: string }[] = [{ value: 'muslim', label: t.religionMuslim, icon: '☾' }, { value: 'christian', label: t.religionChristian, icon: '✝' }, { value: 'other', label: t.religionOther, icon: '•' }, { value: 'prefer_not_to_say', label: t.religionNoAnswer, icon: '—' }];
  return <ScreenFrame active={2} t={t} onBack={onBack}><div className="onboarding-content"><div className="section-heading"><span className="section-icon"><Sparkles size={21} /></span><h2>{t.religionTitle}</h2><p>{t.religionSub}</p></div><div className="selection-list religion-list">{options.map((item) => <button className={`choice-row ${religion === item.value ? 'selected' : ''}`} key={item.value} onClick={() => setReligion(item.value)}><span className="religion-option"><i>{item.icon}</i><b>{item.label}</b></span>{religion === item.value ? <span className="check-mark"><Check size={16} /></span> : <span className="radio" />}</button>)}</div><div className="selection-note"><ShieldCheck size={17} /><span>{t.religionNote}</span></div><button className="primary-button" onClick={onContinue}>{t.continue}{t.isAr ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}</button><button className="text-button" onClick={onContinue}>{t.skip}</button></div></ScreenFrame>;
}

function RoleScreen({ role, setRole, t, onBack, onContinue }: { language: Language; role: UserRole | null; setRole: (value: UserRole) => void; t: Copy; onBack: () => void; onContinue: () => void }) {
  return <ScreenFrame active={3} t={t} onBack={onBack}><div className="onboarding-content role-content"><div className="section-heading"><span className="section-icon"><Heart size={21} /></span><h2>{t.roleTitle}</h2><p>{t.roleSub}</p></div><div className="role-cards"><button className={`role-card beneficiary-card ${role === 'beneficiary' ? 'selected' : ''}`} onClick={() => setRole('beneficiary')}><span className="role-illustration"><Utensils size={28} /></span><span className="role-card-text"><b>{t.beneficiary}</b><small>{t.beneficiaryDesc}</small></span>{role === 'beneficiary' && <span className="role-check"><Check size={16} /></span>}</button><button className={`role-card donor-card ${role === 'donor' ? 'selected' : ''}`} onClick={() => setRole('donor')}><span className="role-illustration"><PackageOpen size={28} /></span><span className="role-card-text"><b>{t.donor}</b><small>{t.donorDesc}</small></span>{role === 'donor' && <span className="role-check"><Check size={16} /></span>}</button></div><button className="primary-button" disabled={!role} onClick={onContinue}>{t.continue}<ArrowRight size={18} /></button></div></ScreenFrame>;
}

function LegacyOAuthScreen({ language, t, onBack, initialError, onboardingState }: { language: Language; t: Copy; onBack: () => void; initialError: string; onboardingState: { language: Language; country: Country | null; religion: Religion | null; role: UserRole | null } }) {
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  useEffect(() => setError(initialError), [initialError]);

  const oauth = async (provider: 'google' | 'facebook') => {
    setError('');
    setLoading(true);
    localStorage.setItem('sharek-oauth-pending', provider);
    localStorage.setItem('sharek-oauth-onboarding', JSON.stringify({
      language: onboardingState.language,
      country: onboardingState.country?.code ?? null,
      religion: onboardingState.religion,
      role: onboardingState.role,
    }));
    try {
      const native = Capacitor.isNativePlatform();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: native ? NATIVE_OAUTH_REDIRECT_URL : window.location.origin + import.meta.env.BASE_URL,
          skipBrowserRedirect: native,
        },
      });
      if (oauthError) throw oauthError;
      if (native) {
        if (!data.url) throw new Error(t.authError);
        await Browser.open({ url: data.url });
      }
    } catch (cause) {
      localStorage.removeItem('sharek-oauth-pending');
      localStorage.removeItem('sharek-oauth-onboarding');
      setError(cause instanceof Error ? cause.message : t.authError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-screen">
      <header className="topbar">
        <button className="icon-button" onClick={onBack} aria-label={t.back}><ArrowLeft size={20} /></button>
        <img src={import.meta.env.BASE_URL+'image.png'} alt="SHARek" className="logo logo-small" />
        <div className="topbar-spacer" />
      </header>
      <div className="auth-card">
        <span className="auth-badge"><ShieldCheck size={16} /> SHARek community</span>
        <h2>{t.signIn}</h2>
        <p>{language === 'ar' ? 'تابع باستخدام حساب Facebook' : 'Continue with your Facebook account'}</p>
        <div className="social-buttons">
          {ENABLE_GOOGLE_SIGN_IN && <button onClick={() => void oauth('google')} disabled={loading}><span className="google-mark">G</span>{t.google}</button>}
          {ENABLE_FACEBOOK_SIGN_IN && <button onClick={() => void oauth('facebook')} disabled={loading}><span className="facebook-mark">f</span>{t.facebook}</button>}
        </div>
        <div className="auth-legal-links">
          <button type="button" onClick={() => void openLegalPage(LEGAL_URLS.privacy)}>{language === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}</button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => void openLegalPage(LEGAL_URLS.terms)}>{language === 'ar' ? 'شروط الخدمة' : 'Terms of Service'}</button>
        </div>
        {error && <div className="feedback error"><X size={16} />{error}</div>}
      </div>
    </section>
  );
}

function playWelcomeChime(): void {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  const ctx = new window.AudioContext();
  const notes = [523.25, 659.25, 783.99];
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  master.connect(ctx.destination);
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.08;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.5, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + 0.42);
  });
  window.setTimeout(() => void ctx.close(), 800);
}

function HomeScreen({ sharedMealToken,onCloseSharedMeal,language, profile, role, t, onSignOut, setProfile }: { sharedMealToken:string|null;onCloseSharedMeal:()=>void;language: Language; profile: Profile | null; role: UserRole; t: Copy; onSignOut: () => Promise<void>; setProfile: React.Dispatch<React.SetStateAction<Profile | null>> }) {
  const [requests, setRequests] = useState<MealRequest[]>([]);
  const [donorMeals, setDonorMeals] = useState<Meal[]>([]);
  const [showRequest, setShowRequest] = useState(false);
  const [marketId,setMarketId]=useState<string|null>(()=>parseMarketLink(window.location.href)??sessionStorage.getItem('sharek-pending-marketplace'));
  const [marketOpen,setMarketOpen]=useState(()=>Boolean(parseMarketLink(window.location.href)??sessionStorage.getItem('sharek-pending-marketplace')));
  const [marketComments,setMarketComments]=useState(false);
  const [marketReport,setMarketReport]=useState<{userId:string;name:string}|null>(null);
  useEffect(()=>{const open=(event:Event)=>{setMarketId((event as CustomEvent<string>).detail);setMarketOpen(true);};window.addEventListener('sharek-open-marketplace',open);return()=>window.removeEventListener('sharek-open-marketplace',open);},[]);
  const [requestFocusId,setRequestFocusId]=useState<string|null>(null);
  const [primaryActionCollapsed, setPrimaryActionCollapsed] = useState(false);
  const [chatState, setChatState] = useState<{ threadId: string | null; partnerId: string; requestId: string | null; requestStatus: string | null } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToastState] = useState<{ message: string; requestId?: string }>({ message: '' });
  const setToast = (message: string, requestId?: string) => setToastState(current => message ? { message, requestId } : current.requestId ? current : { message: '' });
  const { userLat, userLng, accuracy: locationAccuracy, error: locationError, areaName, fix: locationFix, requestLocation } = useDeviceLocation(language,profile?.id);
  const [activeTab, setActiveTab] = useState<'home' | 'community' | 'chats'>('home');
  const [donorTab, setDonorTab] = useState<'home' | 'share' | 'community' | 'requests' | 'chats' | 'profile' | 'manage'>('home');
  const [beneficiarySharing, setBeneficiarySharing] = useState<'none' | 'share' | 'manage' | 'meals'>('none');
  const [managementFocus,setManagementFocus]=useState<{requestId?:string;mealId?:string}|null>(null);
  const [notificationMealId,setNotificationMealId]=useState<string|null>(null);
  const [notifiedHelp,setNotifiedHelp]=useState<{requestId:string;requesterId?:string|null}|null>(null);
  const seenNotificationIdsRef = useRef(new Set<string>());
  const presenceUpdatedAtRef = useRef(0);
  const [helperPreferences, setHelperPreferences] = useState({
    set: profile?.helper_preferences_set ?? false,
    accepts: profile?.helper_accepts_requests ?? false,
    radius: profile?.helper_radius_km ?? 5,
  });
  const [notifView, setNotifView] = useState<'none' | 'center' | 'settings'>('none');
  const [showBeneficiaryProfile, setShowBeneficiaryProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showFinancialSupport,setShowFinancialSupport]=useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showHelpSupport, setShowHelpSupport] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showCharities, setShowCharities] = useState(false);
  const [highlightMealId, setHighlightMealId] = useState<string | null>(null);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [quranView, setQuranView] = useState<'none' | 'dashboard' | 'reader' | 'index'>('none');
  const [quranPage, setQuranPage] = useState(1);
  const profileId = profile?.id;
  useEffect(()=>{
    if(!profileId)return;
    const channel=supabase.channel(`profile-appearance-${profileId}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:`id=eq.${profileId}`},payload=>{
      const next=payload.new as Partial<Profile>;
      setProfile(current=>current&&current.id===profileId?{...current,avatar_url:next.avatar_url===undefined?current.avatar_url:next.avatar_url,is_verified:next.is_verified??current.is_verified}:current);
    }).subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[profileId]);
  useEffect(() => {
    if (!profileId) { setIsAdmin(false); return; }
    void supabase.rpc('is_admin', { p_user_id: profileId }).then(({ data }) => setIsAdmin(Boolean(data)));
  }, [profileId]);
  const { unreadCount, toasts, dismissToast, deepLink, clearDeepLink, requestPermission, hasPermission, registerToken,markAsRead } = useNotifications();
  const acceptingPushRef=useRef<Promise<boolean>|null>(null);

  const community = useCommunityMeals(profileId, userLat, userLng);
  const availableMeals = community.meals;
  const locationRef = useRef({ lat: userLat, lng: userLng });
  locationRef.current = { lat: userLat, lng: userLng };
  const discoveryCell = role === 'donor' ? [userLat?.toFixed(3), userLng?.toFixed(3)].join(':') : '';
  const isDonor = role === 'donor';
  useNearbyMealPresence(profileId, locationFix, locationError);
  useEffect(() => {
    if (!profileId) return;
    let lastRecorded = 0;
    const recordOpen = () => {
      if (document.hidden || !navigator.onLine || Date.now() - lastRecorded < 30_000) return;
      lastRecorded = Date.now();
      void supabase.rpc('record_app_open').then(({ error }) => {
        if (error) console.warn('Could not record app opening', error.message);
      });
    };
    recordOpen();
    const nativeListener = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) recordOpen(); })
      : null;
    document.addEventListener('visibilitychange', recordOpen);
    window.addEventListener('online', recordOpen);
    const foregroundHeartbeat = window.setInterval(recordOpen, 5 * 60_000);
    return () => {
      window.clearInterval(foregroundHeartbeat);
      document.removeEventListener('visibilitychange', recordOpen);
      window.removeEventListener('online', recordOpen);
      void nativeListener?.then(listener => listener.remove());
    };
  }, [profileId]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('backButton', () => {
      if (marketReport) setMarketReport(null);
      else if (marketOpen) {setMarketOpen(false);setMarketId(null);setMarketComments(false);sessionStorage.removeItem('sharek-pending-marketplace');}
      else if (notificationMealId) setNotificationMealId(null);
      else if (sharedMealToken) onCloseSharedMeal();
      else if (showSignOutConfirm) setShowSignOutConfirm(false);
      else if (showReportSheet) setShowReportSheet(false);
      else if (chatState) setChatState(null);
      else if (notifiedHelp) setNotifiedHelp(null);
      else if (showHelpSupport) setShowHelpSupport(false);
      else if (showCharities) setShowCharities(false);
      else if (showReports) setShowReports(false);
      else if (showFinancialSupport) setShowFinancialSupport(false);
      else if (showVerification) setShowVerification(false);
      else if (showAdmin) setShowAdmin(false);
      else if (showSettings) setShowSettings(false);
      else if (notifView !== 'none') setNotifView('none');
      else if (showBeneficiaryProfile) setShowBeneficiaryProfile(false);
      else if (quranView === 'reader' || quranView === 'index') setQuranView('dashboard');
      else if (quranView !== 'none') setQuranView('none');
      else if (showRequest) setShowRequest(false);
      else if (menuOpen) setMenuOpen(false);
      else if (beneficiarySharing !== 'none') setBeneficiarySharing('none');
      else if (isDonor && donorTab !== 'home') setDonorTab('home');
      else if (!isDonor && activeTab !== 'home') setActiveTab('home');
      else void CapacitorApp.minimizeApp();
    });
    return () => { void listener.then(value => value.remove()); };
  }, [marketReport,marketOpen,notificationMealId,sharedMealToken,onCloseSharedMeal,showSignOutConfirm, showReportSheet, chatState, notifiedHelp, showHelpSupport, showCharities, showReports, showFinancialSupport, showVerification, showAdmin, showSettings, notifView, showBeneficiaryProfile, quranView, showRequest, menuOpen, beneficiarySharing, isDonor, donorTab, activeTab]);
  useEffect(() => { if (profileId) void requestPermission(); }, [profileId, requestPermission]);
  useEffect(() => {
    if (!profileId || !hasPermission) return;
    if(Capacitor.isNativePlatform())return;
    let cancelled = false;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
          if (!vapidKey) return;
          const applicationServerKey = Uint8Array.from(atob(vapidKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        }
        if (!cancelled && sub) {
          const subAny = sub as PushSubscription & { keys?: { p256dh?: string; auth?: string } };
          const subJson = JSON.stringify({
            endpoint: sub.endpoint,
            keys: {
              p256dh: subAny.keys?.p256dh ?? '',
              auth: subAny.keys?.auth ?? '',
            },
          });
          registerToken(subJson);
        }
      } catch { /* push subscription optional */ }
    })();
    return () => { cancelled = true; };
  }, [hasPermission, profileId, registerToken]);
  const navigateNotification=useCallback(async(type:string,id:string|null,requesterId?:string)=>{
    if(!id)return true;
    if(type==='app_update'){window.dispatchEvent(new Event('sharek-check-update'));setNotifView('none');return true;}
    if(type==='marketplace'){
      const {data,error:targetError}=await supabase.rpc('marketplace_notification_target',{p_related_id:id});
      const target=data as {listing_id?:string;kind?:string;available?:boolean}|null;
      if(targetError||!target?.listing_id||!target.available){
        setToast(language==='ar'?'هذا المنشور لم يعد متاحًا في سوق الخير.':'This post is no longer available in the Goodness Market.');
        window.setTimeout(()=>setToast(''),4500);setNotifView('none');return true;
      }
      setMarketId(target.listing_id);setMarketComments(target.kind==='comment');setMarketOpen(true);setNotifView('none');return true;
    }
    if(type==='marketplace_message'){
      const {data,error:messageError}=await supabase.rpc('marketplace_message_target',{p_message_id:id});
      const target=data as {thread_id?:string;partner_id?:string;listing_id?:string;available?:boolean}|null;
      if(messageError||!target?.thread_id||!target.partner_id||!target.available){
        setToast(language==='ar'?'هذه المحادثة أو المنتج لم يعد متاحًا.':'This conversation or product is no longer available.');
        window.setTimeout(()=>setToast(''),4500);setNotifView('none');return true;
      }
      setChatState({threadId:target.thread_id,partnerId:target.partner_id,requestId:null,requestStatus:null});
      setNotifView('none');return true;
    }
    try{
      const target=await notificationTarget(type,id,isDonor);
      if(target.screen==='management'){
        setManagementFocus({mealId:target.mealId,requestId:target.requestId});
        if(isDonor)setDonorTab('manage');else setBeneficiarySharing('manage');
      }
      else if(target.screen==='chat')setChatState({threadId:target.id,partnerId:'',requestId:null,requestStatus:null});
      else if(target.screen==='request'){
        if(isDonor){
          setNotifiedHelp({requestId:target.id,requesterId});
        }else{
          const {data:accepted}=await supabase.from('meal_requests').select('id,donor_id,status').eq('id',target.id).eq('requester_id',profileId!).maybeSingle();
          if(accepted?.donor_id&&['ACCEPTED','WAITING_FOR_PICKUP','ON_THE_WAY','ARRIVED'].includes(accepted.status)){
            const {data:thread,error:threadError}=await supabase.from('chat_threads').select('id').eq('request_id',target.id).or(`participant_a.eq.${profileId},participant_b.eq.${profileId}`).maybeSingle();
            if(threadError||!thread?.id)throw threadError??new Error('CHAT_UNAVAILABLE');
            setChatState({threadId:thread.id,partnerId:accepted.donor_id,requestId:target.id,requestStatus:accepted.status});
            setShowRequest(false);
          }else {setRequestFocusId(target.id);setShowRequest(true);}
        }
      }
      else if(target.screen==='meal')setNotificationMealId(target.id);
      else{if(isDonor)setDonorTab('community');else setActiveTab('community');}
      setNotifView('none');return true;
    }catch{setToast(language==='ar'?'تعذر فتح تفاصيل الإشعار. تحقق من الاتصال وحاول مجددًا.':'Could not open the notification. Check the connection and retry.');window.setTimeout(()=>setToast(''),4000);return false;}
  },[isDonor,language,profileId]);
  const acceptFromPush=useCallback((requestId:string,requesterId?:string):Promise<boolean>=>{
    if(!isDonor||!profileId)return Promise.resolve(false);
    if(acceptingPushRef.current)return acceptingPushRef.current;
    if(requesterId)setNotifiedHelp({requestId,requesterId});
    const work=(async()=>{try{
      let {data:bound,error:boundError}=await supabase.rpc('get_notified_help_request_details',{p_request_id:requestId,p_requester_id:requesterId??null});
      if(!boundError&&!bound&&requesterId){({data:bound,error:boundError}=await supabase.rpc('get_notified_help_request_details',{p_request_id:requestId,p_requester_id:null}));}
      if(boundError)throw boundError;
      if(!bound){setToast(language==='ar'?'هذا الطلب غير متاح لك.':'This request is unavailable to you.');return true;}
      setNotifiedHelp({requestId,requesterId:(bound as {requester_id:string}).requester_id});
      const {data,error}=await supabase.rpc('accept_meal_request',{p_request_id:requestId});
      if(error)throw error;
      if(!data){
        const status=await supabase.rpc('get_notified_help_request_status',{p_request_id:requestId});
        const value=typeof status.data==='string'?status.data:'UNAVAILABLE';
        const label:Record<string,[string,string]>={
          ACCEPTED:['قبله مساعد آخر','Accepted by another helper'],
          WAITING_FOR_PICKUP:['قبله مساعد آخر','Accepted by another helper'],
          ON_THE_WAY:['المساعدة قيد التنفيذ','Help is in progress'],
          ARRIVED:['المساعدة قيد التنفيذ','Help is in progress'],
          CANCELLED:['أُلغي الطلب','Request cancelled'],
          MEALS_AVAILABLE:['ظهرت وجبات قريبة متاحة','Suitable nearby meals are now available'],
          NOT_FOUND:['انتهى وقت البحث','Search expired'],
          EXPIRED:['انتهى الطلب','Request expired'],
          SEARCHING:['لم يعد الطلب متاحًا لك','Request is no longer available to you'],
          UNAVAILABLE:['الطلب غير متاح','Request unavailable'],
        };
        setToast(language==='ar'?(`تعذر قبول المساعدة: ${(label[value]??label.UNAVAILABLE)[0]}`):(`Could not accept help: ${(label[value]??label.UNAVAILABLE)[1]}`));
        return true;
      }
      const request=data as MealRequest;
      const {data:thread,error:threadError}=await supabase.from('chat_threads').select('id').eq('request_id',requestId).or(`participant_a.eq.${profileId},participant_b.eq.${profileId}`).maybeSingle();
      if(threadError||!thread?.id)throw threadError??new Error('CHAT_UNAVAILABLE');
      setRequests(current=>[request,...current.filter(item=>item.id!==requestId)]);
      setChatState({threadId:thread.id,partnerId:request.requester_id,requestId,requestStatus:request.status});
      setNotifiedHelp(null);
      setNotifView('none');
      return true;
    }catch{
      setToast(language==='ar'?'تعذر قبول المساعدة أو فتح المحادثة. تحقق من اتصالك وحالة الطلب.':'Could not accept help or open the chat. Check your connection and request status.');
      return false;
    }finally{acceptingPushRef.current=null;}})();
    acceptingPushRef.current=work;
    return work;
  },[isDonor,profileId,language]);
  useEffect(()=>{if(!deepLink)return;let active=true;const open=async()=>{const opened=deepLink.actionType==='accept_help'&&deepLink.id?await acceptFromPush(deepLink.id,deepLink.requesterId):await navigateNotification(deepLink.type,deepLink.id,deepLink.requesterId);if(!active||!opened)return;if(deepLink.notificationId)await markAsRead(deepLink.notificationId).catch(()=>{});if(active)clearDeepLink();};void open();window.addEventListener('online',open);return()=>{active=false;window.removeEventListener('online',open);};},[deepLink,clearDeepLink,navigateNotification,acceptFromPush,markAsRead]);
  useEffect(() => {
    let alive = true;
    let fetching = false, dirty = false;
    let refreshTimer: number | undefined;
    const fetchRequests = async () => {
      if (!alive) return;
      if (fetching) { dirty = true; return; }
      fetching = true;
      try {
      const { lat: userLat, lng: userLng } = locationRef.current;
      if (role !== 'donor' && !profileId) { setRequests([]); return; }
      if (role === 'donor') {
        const nearbyQuery = userLat != null && userLng != null
          ? supabase.rpc('discover_meal_requests', { p_latitude: userLat, p_longitude: userLng, p_radius_km: 25 })
          : Promise.resolve({ data: [] as MealRequest[], error: null });
        const [{ data: nearbyRequests, error }, { data: specificRequests, error: specificError }] = await Promise.all([
          nearbyQuery,
          supabase.from('meal_requests').select('id,requester_id,donor_id,quantity_requested,latitude,longitude,requested_time,status,expires_at,created_at,updated_at,pickup_meal_id,pickup_latitude,pickup_longitude,sharing_mode,pickup_instructions').eq('donor_id', profileId!).in('status', ['PENDING', 'ACCEPTED', 'WAITING_FOR_PICKUP', 'ON_THE_WAY', 'ARRIVED']).order('created_at', { ascending: false }).limit(30),
        ]);
        if (alive && (!error || !specificError)) {
          const combined = [...((nearbyRequests ?? []) as MealRequest[]), ...((specificRequests ?? []) as MealRequest[])];
          setRequests(Array.from(new Map(combined.map((item) => [item.id, item])).values()));
        }
        const { data: meals, error: mealsError } = await supabase.from('meals').select('*').eq('donor_id', profileId).in('status', ['ACTIVE', 'RESERVED']).order('created_at', { ascending: false });
        if (alive && !mealsError) setDonorMeals((meals ?? []) as Meal[]);
        return;
      }
      const { data, error } = await supabase.from('meal_requests').select('id,requester_id,donor_id,quantity_requested,latitude,longitude,requested_time,status,expires_at,created_at,updated_at,pickup_meal_id,pickup_latitude,pickup_longitude,sharing_mode,pickup_instructions').eq('requester_id', profileId!).in('status', ['SEARCHING', 'PENDING', 'ACCEPTED', 'REJECTED', 'WAITING_FOR_PICKUP', 'ON_THE_WAY', 'ARRIVED', 'RECEIVED', 'EXPIRED', 'NOT_FOUND','COMPLETED','CANCELLED']).order('created_at', { ascending: false }).limit(50);
      if (alive && !error) setRequests(previous=>mergeRequestSnapshot(previous,(data ?? []) as MealRequest[]));
      } finally {
        fetching = false;
        if (alive && dirty) { dirty = false; void fetchRequests(); }
      }
    };
    const schedule = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => void fetchRequests(), 180); };
    window.addEventListener('sharek-meal-published', schedule);
    const saved=(event:Event)=>{const row=(event as CustomEvent<MealRequest>).detail;if(!row?.id||!profileId||(row.requester_id!==profileId&&row.donor_id!==profileId))return;setRequests(previous=>previous.map(item=>item.id===row.id?row:item));if(row.requester_id===profileId&&isReceived(row)){setToast(language==='ar'?'تم استلام الوجبة بنجاح ❤️':'Meal received successfully ❤️');window.setTimeout(()=>setToast(''),4000);}schedule();};
    window.addEventListener(MEAL_REQUEST_SAVED,saved);
    void fetchRequests();
    const expireDirect = () => { void supabase.rpc('refresh_direct_pickups'); };
    expireDirect();
    const directTimer = window.setInterval(expireDirect, 30_000);
    window.addEventListener('online', expireDirect);
    const onVisible = () => { if (document.visibilityState === 'visible') { expireDirect(); schedule(); } };
    document.addEventListener('visibilitychange', onVisible);
    const requestResume=Capacitor.isNativePlatform()?CapacitorApp.addListener('appStateChange',state=>{if(state.isActive){expireDirect();schedule();}}):null;
    const requestChannel = supabase.channel(`requests-realtime-${role}-${profileId ?? 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_requests' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_photos' }, schedule)
      .subscribe();
    return () => { alive = false;window.removeEventListener(MEAL_REQUEST_SAVED,saved);window.removeEventListener('sharek-meal-published',schedule);void requestResume?.then(listener=>listener.remove()).catch(()=>{}); window.clearTimeout(refreshTimer); window.clearInterval(directTimer); window.removeEventListener('online', expireDirect); document.removeEventListener('visibilitychange', onVisible); void supabase.removeChannel(requestChannel); };
  }, [profileId, role, discoveryCell,language]);

  useEffect(() => {
    if (role !== 'donor' || !profileId) return;
    let mounted = true;
    const announce = (notification: { id: string; title: string; body: string }): void => {
      if (!mounted || seenNotificationIdsRef.current.has(notification.id)) return;
      seenNotificationIdsRef.current.add(notification.id);
      setToast(`${notification.title} · ${notification.body}`);
      window.setTimeout(() => setToast(''), 5000);
      navigator.vibrate?.([90, 60, 90]);
      if ('Notification' in window && Notification.permission === 'granted') new Notification(notification.title, { body: notification.body });
      window.setTimeout(() => { void supabase.from('meal_notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id); }, 5000);
    };
    const channel = supabase.channel(`meal-notifications-${profileId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meal_notifications', filter: `recipient_id=eq.${profileId}` }, (payload) => announce(payload.new as { id: string; title: string; body: string })).subscribe();
    return () => { mounted = false; void supabase.removeChannel(channel); };
  }, [profileId, role]);

  useEffect(() => {
    if (role !== 'donor' || !profileId || !helperPreferences.set || userLat == null || userLng == null) return;
    const updatePresence = () => {
      if (Date.now() - presenceUpdatedAtRef.current < 30000) return;
      presenceUpdatedAtRef.current = Date.now();
      void supabase.rpc('set_helper_presence', {
        p_preferences_set: true,
        p_accepts_requests: helperPreferences.accepts,
        p_radius_km: helperPreferences.radius,
        p_latitude: userLat,
        p_longitude: userLng,
      }).then(({ error }) => { if (error) console.error('helper location update failed', error); });
    };
    updatePresence();
    const timer = window.setInterval(updatePresence, 120000);
    return () => window.clearInterval(timer);
  }, [helperPreferences, profileId, role, userLat, userLng]);

  const activeHandover = role === 'beneficiary' ? requests.find(isActiveHandover) ?? null : null;

  const hasActiveHandover = Boolean(activeHandover);
  const displayName = profile?.display_name ?? (language === 'ar' ? 'يا صديق الخير' : 'Goodness friend');
  const acceptRequest = async (request: MealRequest) => {
    const functionName = request.status === 'PENDING' ? 'accept_specific_meal_request' : 'accept_meal_request';
    const { data, error } = await supabase.rpc(functionName, { p_request_id: request.id });
    if (error) return { ok: false, message: t.authError };
    if (!data) return { ok: false, message: language === 'ar' ? 'لم يعد هذا الطلب متاحًا' : 'This request is no longer available' };
    setRequests((current) => current.map((item) => item.id === request.id ? data as MealRequest : item));
    setToast(language === 'ar' ? 'تم قبول الطلب بنجاح' : 'Request accepted successfully');
    return { ok: true, message: '' };
  };
  const rejectRequest = async (request: MealRequest) => {
    const { data, error } = await supabase.rpc('reject_specific_meal_request', { p_request_id: request.id });
    if (error) return { ok: false, message: t.authError };
    if (!data) return { ok: false, message: language === 'ar' ? 'لم يعد هذا الطلب متاحًا' : 'This request is no longer available' };
    setRequests((current) => current.map((item) => item.id === request.id ? data as MealRequest : item));
    setToast(language === 'ar' ? 'تم رفض الطلب' : 'Request rejected');
    return { ok: true, message: '' };
  };
  const reserveMeal = async (meal: Pick<CommunityMeal, 'id' | 'sharing_mode'>, quantity = 1, requestedTime?: string) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    let data: MealRequest | null = null;
    let error: { message: string } | null = null;
    try {
      const result = await supabase.rpc('reserve_meal', { p_meal_id: meal.id, p_quantity: quantity, p_latitude: userLat, p_longitude: userLng, p_requested_time: requestedTime ?? new Date().toISOString() }).abortSignal(controller.signal);
      data = result.data as MealRequest | null;
      error = result.error;
    } catch (caught) {
      error = { message: caught instanceof Error ? caught.message : String(caught) };
    } finally {
      window.clearTimeout(timeout);
    }
    if (error) {
      if (error.message.includes('active request exists')) {
        return { ok: false, message: language === 'ar' ? 'لديك طلب نشط لهذه الوجبة بالفعل. راجع طلبك الحالي.' : 'You already have an active request for this meal. Check that request.' };
      }
      if (controller.signal.aborted) return { ok: false, message: language === 'ar' ? 'تأخر تأكيد الطلب. افتح طلباتك للتحقق من حالته قبل إعادة المحاولة.' : 'Request confirmation timed out. Check your requests before retrying.' };
      if (error.message.includes('invalid quantity')) return { ok: false, message: language === 'ar' ? 'الكمية المختارة غير صالحة.' : 'The selected quantity is invalid.' };
      if (error.message.includes('invalid requested time')) return { ok: false, message: language === 'ar' ? 'وقت الاستلام المختار غير صالح. اختر وقتًا أقرب وحاول مجددًا.' : 'The selected pickup time is invalid. Choose a sooner time and try again.' };
      if (error.message.includes('not eligible') || error.message.includes('permission denied') || error.message.includes('42501')) return { ok: false, message: language === 'ar' ? 'تعذر إرسال الطلب بسبب صلاحيات الحساب. تحقق من حالة حسابك.' : 'Account permissions prevented this request. Check your account status.' };
      console.error('reserve_meal failed', error);
      return { ok: false, message: language === 'ar' ? 'تعذر إرسال الطلب. تحقق من الاتصال وحاول مجددًا.' : 'Could not send the request. Check your connection and try again.' };
    }
    if (controller.signal.aborted) return { ok: false, message: language === 'ar' ? 'تأخر تأكيد الطلب. افتح طلباتك للتحقق من حالته قبل إعادة المحاولة.' : 'Request confirmation timed out. Check your requests before retrying.' };
    if (!data) return { ok: false, message: language === 'ar' ? 'عذرًا، هذه الوجبة لم تعد متاحة أو الكمية المطلوبة غير متوفرة.' : 'Sorry, this meal or the requested quantity is no longer available.' };
    const request = data as MealRequest;
    setRequestFocusId(request.id);
    community.refresh();
    setRequests((current) => [request, ...current.filter((item) => item.id !== request.id && !(item.status === 'SEARCHING' && !item.donor_id && !item.pickup_meal_id))]);
    setToast(request.sharing_mode === 'direct' ? (language === 'ar' ? 'تم تأكيد الحجز. توجّه إلى نقطة الطعام الثابتة.' : 'Reservation confirmed. Head to the fixed food pickup point.') : (language === 'ar' ? 'تم إرسال الطلب، بانتظار موافقة مقدم المساعدة' : 'Request sent, waiting for the helper'), request.id);
    setShowRequest(true);
    return { ok: true, message: '', request };
  };
  const advanceRequest = async (request: MealRequest, nextStatus: string) => {
    const { data, error } = await advanceMealRequest(request, nextStatus as MealRequest['status'], profileId ?? '');
    if (error || !data) return { ok: false, message: t.authError };
    setRequests((current) => current.map((item) => item.id === request.id ? data : item));
    if (nextStatus === 'RECEIVED') setToast(language === 'ar' ? 'تم استلام الوجبة بنجاح' : 'Meal received successfully');
    return { ok: true, message: '' };
  };
  const cancelRequest = async (request: MealRequest) => {
    const { data, error } = !request.pickup_meal_id && request.donor_id
      ? await supabase.rpc('advance_meal_request', { p_request_id: request.id, p_next_status: 'CANCELLED' })
      : request.pickup_meal_id
        ? await supabase.rpc('cancel_specific_meal_request', { p_request_id: request.id })
        : await supabase.rpc('cancel_waiting_meal_request', { p_request_id: request.id });
    if (error || !data) return { ok: false, message: t.authError };
    setRequests((current) => current.map((item) => item.id === request.id ? data as MealRequest : item));
    setToast(language === 'ar' ? 'تم إلغاء الطلب' : 'Request cancelled');
    return { ok: true, message: '' };
  };
  const openChatForRequest = async (request: MealRequest) => {
    const partnerId = request.donor_id === profileId ? request.requester_id : request.donor_id;
    if (!partnerId || partnerId === profileId) return;
    const {data,error}=request.donor_id===profileId&&isDonor
      ? await supabase.rpc('open_notified_help_chat',{p_request_id:request.id,p_requester_id:partnerId})
      : await supabase.rpc('get_or_create_chat_thread',{p_partner_id:partnerId});
    if (!error&&typeof data==='string') setChatState({ threadId: data, partnerId, requestId: request.id, requestStatus: request.status });
    else {setToast(language==='ar'?'تعذر فتح المحادثة. تحقق من صلاحيات المراسلة أو حالة الحظر.':'Could not open the chat. Check messaging permissions or block status.');window.setTimeout(()=>setToast(''),4500);}
  };
  const messageCommunityDonor = async (mealId: string, donorId: string) => {
    try {
      const target = await communityChatTarget(mealId, donorId, profileId ?? '');
      setChatState(target);
      return { ok: true, message: '' };
    } catch {
      return { ok: false, message: language === 'ar' ? 'تعذر فتح المحادثة. تحقق من الاتصال وحاول مرة أخرى.' : 'Could not open the conversation. Check your connection and retry.' };
    }
  };
  const actionLabel = role === 'beneficiary' ? t.needMeal : t.shareMeal;
  const openPrimaryAction = () => { if (role === 'beneficiary') setShowRequest(true); else setDonorTab('share'); };
  const primaryAction = primaryActionCollapsed ? (
    <button className="map-fab map-fab-collapsed" onClick={() => setPrimaryActionCollapsed(false)} aria-label={actionLabel} aria-expanded="false">
      {role === 'beneficiary' ? <Heart size={20} fill="currentColor" /> : <PackageOpen size={20} />}
      <ChevronUp size={15} />
    </button>
  ) : (
    <div className="map-action-expanded">
      <button className="map-fab" onClick={openPrimaryAction} aria-label={actionLabel} aria-expanded="true"><span>{role === 'beneficiary' ? <Heart size={20} fill="currentColor" /> : <PackageOpen size={20} />}</span>{actionLabel}</button>
      <button className="map-action-collapse" onClick={() => setPrimaryActionCollapsed(true)} aria-label={language === 'ar' ? 'تصغير الزر' : 'Collapse action'}><ChevronDown size={17} /></button>
    </div>
  );
  const donorContentView = isDonor ? (
    donorTab === 'share' ? <ShareMeal language={language} userLat={userLat} userLng={userLng} locationFix={locationFix} locationError={locationError} onRetryLocation={requestLocation} onClose={() => setDonorTab('home')} onPublished={(meal) => { setDonorMeals(current => [meal, ...current.filter(item => item.id !== meal.id)]); community.refresh(); window.dispatchEvent(new Event('sharek-meal-published')); setHighlightMealId(meal.id); setDonorTab('community'); setToast(language === 'ar' ? 'تمت مشاركة وجبتك بنجاح ❤️' : 'Your meal was shared successfully ❤️'); window.setTimeout(() => setToast(''), 4000); }} />
    : donorTab === 'community' ? <div className="community-scroll-view"><CommunitySection language={language} currentUserId={profileId ?? ''} userLat={userLat} userLng={userLng} locationAccuracy={locationAccuracy} locationError={locationError} areaName={areaName} radiusKm={community.radiusKm} onRetryLocation={requestLocation} meals={community.allMeals} loading={community.loading} loadError={community.error} onRetry={community.refresh} onReserve={reserveMeal} onShareMeal={() => setDonorTab('share')} onMessageDonor={messageCommunityDonor} highlightMealId={highlightMealId} /></div>
    : donorTab === 'manage' && profileId ? <DonorMealManagement language={language} profileId={profileId} focus={managementFocus} onBack={()=>setDonorTab('home')} onOpenChat={r=>{void openChatForRequest(r);}} />
    : donorTab === 'requests' ? <MapView language={language} role={role} currentUserId={profileId} onMessageDonor={messageCommunityDonor} requests={requests} availableMeals={[]} donorMeals={[]} userLat={userLat} userLng={userLng} locationAccuracy={locationAccuracy} locationError={locationError} areaName={areaName} onRetryLocation={requestLocation} onRequestSelect={() => {}} onAcceptRequest={acceptRequest} onRejectRequest={rejectRequest} onReserveMeal={reserveMeal} primaryAction={null} />
    : donorTab === 'chats' ? <ConversationList language={language} currentUserId={profileId ?? ''} userLat={userLat} userLng={userLng} onBack={() => setDonorTab('home')} onOpenChat={(threadId, partnerId, partnerName, partnerAvatar, requestId, requestStatus) => setChatState({ threadId, partnerId, requestId, requestStatus })} />
    : donorTab === 'profile' && profile ? <DonorProfile language={language} profile={profile} userLat={userLat} userLng={userLng} onBack={() => setDonorTab('home')} onSignOut={onSignOut} onAvatarChange={(url) => setProfile((p) => p ? { ...p, avatar_url: url } : p)} />
    : <MapView language={language} role={role} currentUserId={profileId} onMessageDonor={messageCommunityDonor} requests={requests} availableMeals={[]} donorMeals={donorMeals} userLat={userLat} userLng={userLng} locationAccuracy={locationAccuracy} locationError={locationError} areaName={areaName} onRetryLocation={requestLocation} onRequestSelect={() => {}} onAcceptRequest={acceptRequest} onRejectRequest={rejectRequest} onReserveMeal={reserveMeal} primaryAction={primaryAction} />
  ) : null;
  return <div className="map-home"><AppUpdateControl language={language}/>
    <header className="map-home-header"><img src={import.meta.env.BASE_URL+'image.png'} alt="SHARek" className="logo logo-nav" /><button className="icon-button header-bell" onClick={() => setNotifView('center')} aria-label="Notifications"><Bell size={20} />{unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button><button className="icon-button menu-trigger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"><Menu size={21} /></button>{menuOpen && <><div className="menu-backdrop" onClick={() => setMenuOpen(false)} /><div className="profile-menu"><button className="menu-profile" onClick={() => { setMenuOpen(false); if (isDonor) setDonorTab('profile'); else setShowBeneficiaryProfile(true); }}>{profile?.avatar_url ? <img className="menu-avatar" src={profile.avatar_url} alt="" /> : <CircleUserRound size={20} />}<span className="menu-profile-text"><b>{displayName}</b><small className={profile?.is_verified ? "menu-verified" : "menu-unverified"}>{profile?.is_verified ? (language === "ar" ? "✓ موثق" : "✓ Verified") : (language === "ar" ? "غير موثق" : "Not verified")}</small><small>{isDonor ? (language === 'ar' ? 'متبرع بالطعام' : 'Food donor') : (language === 'ar' ? 'محتاج وجبة' : 'Meal beneficiary')}</small></span></button><button className="menu-verify" onClick={() => { setMenuOpen(false); setShowVerification(true); }}><ShieldCheck size={17} />{language === "ar" ? "توثيق الحساب" : "Verify Account"}</button><button className={(!isDonor && activeTab === 'home') || (isDonor && donorTab === 'home') ? 'menu-active' : ''} onClick={() => { setMenuOpen(false); if (isDonor) setDonorTab('home'); else setActiveTab('home'); }}><Home size={17} />{t.home}</button>{isDonor ? <><button onClick={() => { setMenuOpen(false); setDonorTab('share'); }}><PackageOpen size={17} />{t.shareMeal}</button><button onClick={() => { setMenuOpen(false); setDonorTab('community'); }}><Globe2 size={17} />{language === 'ar' ? 'المجتمع' : 'Community'}</button><button onClick={() => { setMenuOpen(false); setDonorTab('requests'); }}><HeartIcon size={17} />{t.requests}</button><button onClick={()=>{setMenuOpen(false);setManagementFocus(null);setDonorTab('manage');}}><Utensils size={17}/>{language==='ar'?'إدارة الوجبات والطلبات':'Meals & requests'}</button><button onClick={() => { setMenuOpen(false); setDonorTab('chats'); }}><MessageCircle size={17} />{language === 'ar' ? 'المحادثات' : 'Chats'}</button><button onClick={() => { setMenuOpen(false); setDonorTab('profile'); }}><CircleUserRound size={17} />{t.profile}</button></> : <><button className="menu-sharing-mode" onClick={() => { setMenuOpen(false); setBeneficiarySharing('share'); }}><PackageOpen size={18} />{language === 'ar' ? 'وضع المشاركة ❤️' : 'Sharing Mode ❤️'}</button><button onClick={() => { setMenuOpen(false); setManagementFocus(null); setBeneficiarySharing('manage'); }}><Utensils size={17} />{language === 'ar' ? 'إدارة وجباتي وطلباتها' : 'Manage my meals & requests'}</button><button onClick={() => { setMenuOpen(false); setBeneficiarySharing('meals'); }}><PackageOpen size={17} />{language === 'ar' ? 'وجباتي المنشورة' : 'My published meals'}</button><button className={activeTab === 'community' ? 'menu-active' : ''} onClick={() => { setMenuOpen(false); setActiveTab('community'); }}><Globe2 size={17} />{language === 'ar' ? 'الوجبات القريبة' : 'Nearby meals'}</button><button onClick={() => { setMenuOpen(false); setShowRequest(true); }}><HeartIcon size={17} />{t.needMeal}</button><button className={activeTab === 'chats' ? 'menu-active' : ''} onClick={() => { setMenuOpen(false); setActiveTab('chats'); }}><MessageCircle size={17} />{language === 'ar' ? 'المحادثات' : 'Chats'}</button></>}{<button className={`menu-quran ${quranView !== 'none' ? 'menu-active' : ''}`} onClick={() => { setMenuOpen(false); setQuranView('dashboard'); }}><BookOpen size={17} />{language === 'ar' ? 'القرآن الكريم' : 'Quran'}</button>}<button className={notifView === 'center' ? 'menu-active' : ''} onClick={() => { setMenuOpen(false); setNotifView('center'); }}><Bell size={17} />{language === 'ar' ? 'الإشعارات' : 'Notifications'}{unreadCount > 0 && <span className="menu-badge">{unreadCount>99?'99+':unreadCount}</span>}</button><button className={showReports ? 'menu-active' : ''} onClick={() => { setMenuOpen(false); setShowReports(true); }}><FileText size={17} />{language === 'ar' ? 'تقاريري وسجل الوجبات' : 'My Reports & Meal History'}</button><button className={showCharities ? 'menu-active' : ''} onClick={() => { setMenuOpen(false); setShowCharities(true); }}><Building2 size={17} />{language === 'ar' ? 'المؤسسات الخيرية القريبة' : 'Nearby Charities'}</button><button className={showSettings ? 'menu-active' : ''} onClick={() => { setMenuOpen(false); setShowSettings(true); }}><SettingsIcon size={17} />{language === 'ar' ? 'الإعدادات' : 'Settings'}</button><button className="menu-support" onClick={() => { setMenuOpen(false); setShowHelpSupport(true); }}><Heart size={17} />{language === 'ar' ? 'المساعدة والدعم' : 'Help & Support'}</button><button className="menu-support" onClick={() => { setMenuOpen(false); setShowFinancialSupport(true); }}><Gift size={17} />{language === 'ar' ? 'دعم SHARek ماليًا' : 'Support SHARek'}</button><button className="menu-signout" onClick={() => { setMenuOpen(false); setShowSignOutConfirm(true); }}><LogOut size={17} />{t.signOut}</button></div></>}</header>
    {isDonor ? (donorContentView ?? null) : beneficiarySharing === 'share' ? <ShareMeal language={language} userLat={userLat} userLng={userLng} locationFix={locationFix} locationError={locationError} onRetryLocation={requestLocation} onClose={() => setBeneficiarySharing('none')} onPublished={(meal) => { community.refresh(); window.dispatchEvent(new Event('sharek-meal-published')); setHighlightMealId(meal.id); setBeneficiarySharing('none'); setActiveTab('community'); setToast(language === 'ar' ? 'تمت مشاركة وجبتك بنجاح ❤️' : 'Your meal was shared successfully ❤️'); window.setTimeout(() => setToast(''), 4000); }} /> : beneficiarySharing === 'manage' && profileId ? <DonorMealManagement language={language} profileId={profileId} focus={managementFocus} onBack={() => { setBeneficiarySharing('none'); setManagementFocus(null); }} onOpenChat={r => { void openChatForRequest(r); }} /> : beneficiarySharing === 'meals' && profileId ? <MyMeals language={language} userId={profileId} onBack={() => setBeneficiarySharing('none')} /> : role === 'beneficiary' && activeTab === 'community' ? <div className="community-scroll-view"><CommunitySection language={language} currentUserId={profileId ?? ''} userLat={userLat} userLng={userLng} locationAccuracy={locationAccuracy} locationError={locationError} areaName={areaName} radiusKm={community.radiusKm} onRetryLocation={requestLocation} meals={community.allMeals} loading={community.loading} loadError={community.error} onRetry={community.refresh} onReserve={reserveMeal} onMessageDonor={messageCommunityDonor} highlightMealId={highlightMealId} /></div> : role === 'beneficiary' && activeTab === 'chats' ? <ConversationList language={language} currentUserId={profileId ?? ''} userLat={userLat} userLng={userLng} onBack={() => setActiveTab('home')} onOpenChat={(threadId, partnerId, partnerName, partnerAvatar, requestId, requestStatus) => setChatState({ threadId, partnerId, requestId, requestStatus })} /> : <MapView language={language} role={role} currentUserId={profileId} onMessageDonor={messageCommunityDonor} requests={[]} availableMeals={availableMeals} donorMeals={[]} userLat={userLat} userLng={userLng} locationAccuracy={locationAccuracy} locationError={locationError} areaName={areaName} onRetryLocation={requestLocation} onRequestSelect={() => {}} onAcceptRequest={acceptRequest} onRejectRequest={rejectRequest} onReserveMeal={reserveMeal} primaryAction={primaryAction} receiptFollowups={profileId ? <ReceiptFollowups language={language} profileId={profileId} paused={!!sharedMealToken || showRequest || !!chatState || notifView !== 'none' || showSettings || showBeneficiaryProfile || quranView !== 'none' || showHelpSupport || menuOpen || showVerification || showFinancialSupport || showCharities || showAdmin || !!notifiedHelp || !!notificationMealId} /> : null} activeHandover={activeHandover} onAdvanceRequest={advanceRequest} onOpenChat={openChatForRequest} onCancelRequest={cancelRequest} />}
    <nav className="map-bottom-nav">{isDonor ? <>
      <button className={donorTab === 'home' ? 'active' : ''} onClick={() => setDonorTab('home')}><Home size={20} /><span>{t.home}</span></button>
      <button className={donorTab === 'share' ? 'active' : ''} onClick={() => setDonorTab('share')}><PackageOpen size={20} /><span>{language === 'ar' ? 'شارك' : 'Share'}</span></button>
      <button className={donorTab === 'community' ? 'active' : ''} onClick={() => setDonorTab('community')}><Globe2 size={20} /><span>{language === 'ar' ? 'المجتمع' : 'Community'}</span></button>
      <button className={donorTab === 'manage' ? 'active' : ''} onClick={() => {setManagementFocus(null);setDonorTab('manage');}}><HeartIcon size={20} /><span>{language === 'ar' ? 'طلبات' : 'Requests'}</span></button>
    </> : <><button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}><Home size={20} /><span>{t.home}</span></button><button className={activeTab === 'community' ? 'active' : ''} onClick={() => setActiveTab('community')}><Globe2 size={20} /><span>{language === 'ar' ? 'المجتمع' : 'Community'}</span></button><button onClick={() => setShowRequest(true)}><HeartIcon size={20} /><span>{language === 'ar' ? 'اطلب وجبة' : 'Request'}</span></button><button onClick={() => setMenuOpen(!menuOpen)}><List size={20} /><span>{language === 'ar' ? 'القائمة' : 'Menu'}</span></button></>}<button className={marketOpen?'active':''} onClick={()=>{setMarketId(null);setMarketOpen(true);}}><Gift size={20}/><span>{language==='ar'?'سوق الخير ❤️':'Goodness Market ❤️'}</span></button></nav>
    {showRequest && profileId && <MealRequestFlow language={language} profileId={profileId} userLat={userLat} userLng={userLng} areaName={areaName} locationIssue={locationError} onRetryLocation={requestLocation} onReserveMeal={reserveMeal} existingRequests={requests.filter(item=>item.requester_id===profileId)} focusRequestId={requestFocusId} onClose={() => {setShowRequest(false);setRequestFocusId(null);}} onOpenChat={async (partnerId) => { setShowRequest(false);setRequestFocusId(null); const { data: threadId } = await supabase.rpc('get_or_create_chat_thread', { p_partner_id: partnerId }); setChatState({ threadId: threadId as string | null, partnerId, requestId: null, requestStatus: null }); }} />}
    {chatState && profileId && <ChatWindow language={language} threadId={chatState.threadId} partnerId={chatState.partnerId} partnerName={language === 'ar' ? 'شريك SHARek' : 'SHARek partner'} partnerAvatar={null} currentUserId={profileId} requestId={chatState.requestId} requestStatus={chatState.requestStatus} userLat={userLat} userLng={userLng} onBack={() => setChatState(null)} />}
    {marketOpen&&profileId&&<GoodnessMarket language={language} countryCode={profile?.country_code} userId={profileId} fix={locationFix} onRetryLocation={requestLocation} initialId={marketId} focusComments={marketComments} onReport={(ownerId,name)=>setMarketReport({userId:ownerId,name})} onBack={()=>{setMarketOpen(false);setMarketId(null);setMarketComments(false);sessionStorage.removeItem('sharek-pending-marketplace');}} onChat={(thread,partner)=>{setMarketOpen(false);setChatState({threadId:thread,partnerId:partner,requestId:null,requestStatus:null});}}/>}
    {role === 'donor' && !helperPreferences.set && <HelperSetup language={language} acceptsRequests={helperPreferences.accepts} radiusKm={helperPreferences.radius as 1 | 3 | 5 | 10} latitude={userLat} longitude={userLng} onSaved={(accepts, radius) => setHelperPreferences({ set: true, accepts, radius })} onClose={() => setHelperPreferences((current) => ({ ...current, set: true }))} />}
    {toast.message && <div className={`toast ${toast.requestId ? 'request-toast' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'}><Check size={17} />{toast.message}{toast.requestId && <button className="toast-close" type="button" onClick={() => setToastState({ message: '' })} aria-label={language === 'ar' ? 'إغلاق رسالة تأكيد الطلب' : 'Close request confirmation'}><X size={14} /></button>}</div>}
    {toasts.length > 0 && <div className="notif-toast-container">{toasts.map((nt) => <div key={nt.id} className={`notif-toast ${nt.priority === 'high' ? 'high' : ''}`}><span className="notif-toast-icon"><Bell size={18} /></span><span className="notif-toast-body"><strong>{nt.title}</strong><small>{nt.body}</small></span><button className="notif-toast-close" onClick={() => dismissToast(nt.id)} aria-label="Dismiss"><X size={16} /></button></div>)}</div>}
    {notifView === 'center' && <NotificationCenter language={language} onBack={() => setNotifView('none')} onNavigate={(type,id)=>void navigateNotification(type,id)}/> }
    {notifView === 'settings' && <NotificationSettings language={language} onBack={() => setNotifView('none')} />}
    {showBeneficiaryProfile && profile && <BeneficiaryProfile language={language} profile={profile} onBack={() => setShowBeneficiaryProfile(false)} onSignOut={() => { setShowBeneficiaryProfile(false); void onSignOut(); }} onAvatarChange={(url) => setProfile((p) => p ? { ...p, avatar_url: url } : p)} />}
    {showSettings && profile && <SettingsScreen language={language} profile={profile} onBack={() => setShowSettings(false)} onSignOut={() => { setShowSettings(false); void onSignOut(); }} onEditProfile={() => { setShowSettings(false); setShowBeneficiaryProfile(true); }} onOpenNotificationSettings={() => { setShowSettings(false); setNotifView('settings'); }} onOpenVerification={() => { setShowSettings(false); setShowVerification(true); }} isAdmin={isAdmin} onOpenAdmin={() => { setShowSettings(false); setShowAdmin(true); }} />}
    {showVerification && profile && <VerificationScreen language={language} profile={profile} onBack={() => setShowVerification(false)} />}
    {showFinancialSupport&&<FinancialSupportScreen language={language} onBack={()=>setShowFinancialSupport(false)}/>}
    {showAdmin && profileId && <AdminDashboard language={language} profileId={profileId} onBack={() => setShowAdmin(false)} />}
    {sharedMealToken&&profileId&&<SharedMealView token={sharedMealToken} language={language} currentUserId={profileId} userLat={userLat} userLng={userLng} onBack={onCloseSharedMeal} onReserve={reserveMeal} onMessageDonor={messageCommunityDonor}/>}
    {notificationMealId&&profileId&&<MealDetail language={language} mealId={notificationMealId} currentUserId={profileId} userLat={userLat} userLng={userLng} onBack={()=>setNotificationMealId(null)} onReserve={reserveMeal} onMessageDonor={messageCommunityDonor}/>}
    {quranView !== 'none' && profileId && quranView === 'dashboard' && <QuranDashboard language={language} userId={profileId} onContinue={(p) => { setQuranPage(p); setQuranView('reader'); }} onOpenReader={(p) => { setQuranPage(p); setQuranView('reader'); }} onOpenBookmarks={() => setQuranView('index')} onOpenIndex={() => setQuranView('index')} onBack={() => setQuranView('none')} />}
    {quranView === 'reader' && profileId && <QuranReader language={language} userId={profileId} initialPage={quranPage} onBack={() => setQuranView('dashboard')} onOpenIndex={() => setQuranView('index')} />}
    {quranView === 'index' && profileId && <QuranIndexNav language={language} userId={profileId} onNavigate={(p) => { setQuranPage(p); setQuranView('reader'); }} onBack={() => setQuranView('dashboard')} onOpenBookmarks={() => setQuranView('index')} />}
    {showHelpSupport && profileId && <HelpSupportScreen language={language} userId={profileId} onBack={() => setShowHelpSupport(false)} onOpenReport={() => { setShowHelpSupport(false); setShowReportSheet(true); }} />}
    {showReports && profileId && <MyReports language={language} profileId={profileId} onBack={() => setShowReports(false)} />}
    {showCharities && profileId && <NearbyCharities language={language} fix={locationFix} locationError={locationError} onRetryLocation={requestLocation} onBack={() => setShowCharities(false)} />}
    {notifiedHelp&&profileId&&<NotifiedHelpProfile language={language} requestId={notifiedHelp.requestId} requesterId={notifiedHelp.requesterId} onBack={()=>setNotifiedHelp(null)} onAccept={async(id,requesterId)=>{await acceptFromPush(id,requesterId);}} onMessage={async(id,requesterId,status)=>{const {data,error}=await supabase.rpc('open_notified_help_chat',{p_request_id:id,p_requester_id:requesterId});if(error||typeof data!=='string')throw error??new Error('CHAT_UNAVAILABLE');setChatState({threadId:data,partnerId:requesterId,requestId:id,requestStatus:status});setNotifiedHelp(null);}}/>}
    {showReportSheet && profileId && <ReportUserSheet language={language} reporterId={profileId} reportedUserId={profileId} onClose={() => setShowReportSheet(false)} />}
    {marketReport && profileId && <ReportUserSheet language={language} reporterId={profileId} reportedUserId={marketReport.userId} reportedUserName={marketReport.name} onClose={() => setMarketReport(null)} onSubmitted={() => setMarketReport(null)} />}
    {showSignOutConfirm && (
      <div className="modal-overlay" onClick={() => setShowSignOutConfirm(false)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
          <h3 style={{ marginBottom: '8px' }}>{language === 'ar' ? 'هل تريد تسجيل الخروج؟' : 'Do you want to log out?'}</h3>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button className="text-button" style={{ flex: 1 }} onClick={() => setShowSignOutConfirm(false)}>{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            <button className="primary-button" style={{ flex: 1, background: '#b14c38' }} onClick={() => { setShowSignOutConfirm(false); void onSignOut(); }}>{t.signOut}</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

export default App;


