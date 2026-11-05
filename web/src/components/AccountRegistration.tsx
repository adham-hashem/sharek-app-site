import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { ArrowLeft, Check, CircleCheck, CircleHelp, CircleX, Copy, Download, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, UserRound, X } from 'lucide-react';
import { PasswordManager,hasDevicePasswordManager } from '@/lib/password-manager';
import { accountRequest, AccountError, normalizeUsername, validUsername, validPassword, validPersonName } from '@/lib/account-auth';
import { credentialVault, type VaultSnapshot } from '@/lib/credential-vault';
import { cancelAuthSuccessSound, playAuthSuccessSoundOnce, prepareAuthSuccessSound, type AuthSoundTicket } from '@/lib/auth-success-sound';
import { SecureAccount } from '@/lib/secure-storage';
import { LEGAL_URLS, openLegalPage } from '@/lib/legal';
import type { Language } from '@/lib/supabase';

type Mode = 'register' | 'login' | 'forgot' | 'new-password' | 'phrase' | 'ready';
type Props = { language: Language; onBack: () => void; onSession: (session: Session) => Promise<void>;
  onboarding: Record<string, unknown>; legacyOAuth?: React.ReactNode };
const suggestedUsername = () => `sharek_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
const EMPTY_VAULT: VaultSnapshot = { accounts: [], lastUsername: '' };

export function AccountRegistration({ language, onBack, onSession, onboarding, legacyOAuth }: Props) {
  const ar = language === 'ar';
  const text = (arabic: string, english: string) => ar ? arabic : english;
  const [mode, setMode] = useState<Mode>('register');
  const modeRef = useRef(mode); modeRef.current = mode;
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState('');
  const [username, setUsername] = useState(suggestedUsername);
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phrase, setPhrase] = useState(''), [enteredPhrase, setEnteredPhrase] = useState('');
  const [setupToken, setSetupToken] = useState(''), [recoveryToken, setRecoveryToken] = useState('');
  const [saved, setSaved] = useState(false), [remember, setRemember] = useState(true);
  const [vault, setVault] = useState<VaultSnapshot>(EMPTY_VAULT);
  const vaultRef = useRef(vault); vaultRef.current = vault;
  const [busy, setBusy] = useState(false), [finishing, setFinishing] = useState(false);
  const busyRef = useRef(false), editedRef = useRef(false);
  const finishRef = useRef(false);
  const authSound = useRef<AuthSoundTicket | null>(null);
  // Successful onSession may unmount this form before its promise resolves.
  useEffect(() => () => { if (!finishRef.current) cancelAuthSuccessSound(authSound.current); }, []);
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [availability, setAvailability] = useState<'checking' | 'available' | 'taken' | 'unknown' | 'invalid'>('checking');
  const [confirmForget, setConfirmForget] = useState(false);
  const [accountOptions,setAccountOptions]=useState(false),[choosing,setChoosing]=useState(false);
  const credentialRevision=useRef(0),managerCredential=useRef(''),managerSaveAttempt=useRef(''),managerAutoTried=useRef(false);
  const chooseDeviceAccount=async()=>{
    const revision=++credentialRevision.current;setChoosing(true);
    try { const selected=await PasswordManager.choose();
      if(revision!==credentialRevision.current||modeRef.current!=='login'||busyRef.current||!validUsername(selected.username))return;
      fill(selected.username,'login');setPassword(selected.password);managerCredential.current=normalizeUsername(selected.username)+'\n'+selected.password;setAccountOptions(false);
    } catch { /* Cancellation and an empty password manager leave manual entry available. */ }
    finally{setChoosing(false);}
  };
  const authRootRef = useRef<HTMLElement>(null), footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== 'phrase' || !authRootRef.current || !footerRef.current) return;
    const root = authRootRef.current, footer = footerRef.current;
    const measure = () => root.style.setProperty('--recovery-footer-height', `${footer.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(footer); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); root.style.removeProperty('--recovery-footer-height'); };
  }, [mode]);
  const normalized = normalizeUsername(username);

  const fill = (value: string, target: Mode, snapshot = vaultRef.current) => {
    const entry = snapshot.accounts.find(row => row.username === normalizeUsername(value));
    setUsername(value);
    setPassword(target === 'login' ? entry?.password ?? '' : '');
    setEnteredPhrase(target === 'forgot' ? entry?.recoveryPhrase ?? '' : '');
  };
  useEffect(() => {
    let alive = true;
    void credentialVault.read().then(snapshot => {
      if (!alive) return;
      setVault(snapshot); vaultRef.current = snapshot;
      if (!editedRef.current && modeRef.current === 'login' && snapshot.lastUsername) fill(snapshot.lastUsername, 'login', snapshot);
    }).catch(() => { if (alive) setNotice(ar ? 'تعذر فتح بيانات التعبئة المحفوظة. يمكنك إدخال بياناتك يدويًا.' : 'Saved autofill is unavailable. You can enter your details manually.'); });
    return () => { alive = false; };
    // Load once; manual input must never be overwritten by a late read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (mode !== 'register') return;
    if (!validUsername(username)) { setAvailability('invalid'); return; }
    let alive = true; setAvailability('checking');
    const timer = window.setTimeout(() => {
      void accountRequest('check-username', { username: normalized }).then(reply => {
        if (alive) setAvailability(reply.available ? 'available' : 'taken');
      }).catch(() => { if (alive) setAvailability('unknown'); });
    }, 450);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [mode, normalized, username]);
  const goLogin = () => {
    cancelAuthSuccessSound(authSound.current); authSound.current = null;
    managerAutoTried.current=false;
    credentialRevision.current++;setAccountOptions(false);
    setError(''); setNotice(''); setConfirm(''); setShowPassword(false); setRecoveryToken(''); setPhrase('');
    fill(vaultRef.current.lastUsername, 'login'); setMode('login'); editedRef.current = false;
  };
  const goRegister = () => {
    cancelAuthSuccessSound(authSound.current); authSound.current = null;
    credentialRevision.current++;setAccountOptions(false);
    setError(''); setNotice(''); setUsername(suggestedUsername()); setPassword(''); setConfirm(''); setEnteredPhrase('');
    setRecoveryToken(''); setPhrase(''); setShowPassword(false); setMode('register');
  };
  const back = () => {
    if (confirmForget) { setConfirmForget(false); return; }
    if (busyRef.current || finishing || mode === 'phrase' || mode === 'ready') return;
    if (mode === 'register') onBack(); else goLogin();
  };
  const backRef = useRef(back); backRef.current = back;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => backRef.current());
    return () => { void listener.then(value => value.remove()); };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void SecureAccount.sensitive({ enabled: ['phrase','forgot','ready'].includes(mode) || showPassword });
    return () => { void SecureAccount.sensitive({ enabled: false }); };
  }, [mode, showPassword]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const errorMessage = (code: string) => {
    const messages: Record<string, [string, string]> = {
      NAME_INVALID: ['اكتب الاسم الأول والأخير، بحد أقصى 50 حرفًا لكل اسم.', 'Enter your first and last name, up to 50 characters each.'],
      USERNAME_INVALID: ['اسم المستخدم من 3 إلى 24 حرفًا إنجليزيًا أو رقمًا أو _.', 'Use 3–24 English letters, digits, or underscores.'],
      USERNAME_UNAVAILABLE: ['اسم المستخدم غير متاح. عدّله أو ولّد اقتراحًا جديدًا.', 'That username is taken. Edit it or generate another suggestion.'],
      PASSWORD_INVALID: ['راجع متطلبات كلمة المرور الموضحة أسفل الحقل.', 'Check the password requirements below the field.'],
      CREDENTIALS_INVALID: ['تعذر تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور.', 'Unable to sign in. Check your username and password.'],
      RECOVERY_INVALID: ['تعذر التحقق من كلمات الاسترداد. راجع الكلمات وترتيبها.', 'Unable to verify the recovery words. Check the words and their order.'],
      RATE_LIMITED: ['محاولات كثيرة. انتظر 15 دقيقة قبل المحاولة مجددًا.', 'Too many attempts. Wait 15 minutes before retrying.'],
      REQUEST_EXPIRED: ['انتهت مهلة الإعداد. سجّل الدخول لإكماله، أو ابدأ الاسترداد مجددًا.', 'Setup expired. Sign in to resume, or restart recovery.'],
      REQUEST_BUSY: ['توجد عملية أخرى للحساب. انتظر قليلًا ثم أعد المحاولة.', 'Another account operation is running. Please wait and retry.'],
      NETWORK_ERROR: ['تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.', 'Connection failed. Check your internet and retry.'],
      SERVICE_UNAVAILABLE: ['الخدمة غير متاحة مؤقتًا. حاول مجددًا.', 'The service is temporarily unavailable. Please retry.'],
    };
    return messages[code]?.[ar ? 0 : 1] ?? text('تعذر إكمال العملية الآن. حاول مجددًا.', 'Unable to complete this request. Please retry.');
  };
  const finish = async (session: Session, skipSave = false) => {
    if (finishRef.current) return;
    finishRef.current = true;
    setPendingSession(session); setFinishing(true);
    let saving = true;
    try {
      if (!skipSave) {
        if (remember) await credentialVault.save({ username: normalized, password, ...(phrase ? { recoveryPhrase: phrase } : {}) });
        else await credentialVault.forget(normalized);
      }
      saving = false;
      const credential=normalized+'\n'+password;
      if(remember&&!skipSave&&hasDevicePasswordManager()&&managerCredential.current!==credential&&managerSaveAttempt.current!==credential){
        managerSaveAttempt.current=credential;
        // Called only after the server has authenticated/finished setup. Provider cancellation never blocks sign-in.
        await PasswordManager.save({username:normalized,password}).catch(()=>{});
      }
      await onSession(session);
      const ticket = authSound.current;
      authSound.current = null;
      if (ticket) void playAuthSuccessSoundOnce(ticket);
      setPhrase(''); setPassword(''); setConfirm(''); setEnteredPhrase(''); setSetupToken(''); setRecoveryToken(''); setPendingSession(null);
    } catch {
      setMode('ready');
      setError(saving ? text('اكتمل تسجيل الحساب، لكن تعذر حفظ التعبئة المشفّرة على الجهاز. أعد الحفظ أو تابع دون حفظ.', 'Your account is ready, but encrypted autofill could not be saved. Retry saving or continue without saving.') : text('تعذر فتح الجلسة الآن. أعد المحاولة دون إنشاء الحساب مرة أخرى.', 'Could not open the session. Retry without creating the account again.'));
      setFinishing(false);
    } finally { finishRef.current = false; }
  };
  const accept = async (reply: Awaited<ReturnType<typeof accountRequest>>) => {
    if (reply.phrase && reply.setupToken) {
      // A newly issued phrase supersedes the locally remembered one, even if setup is interrupted.
      if (mode === 'new-password' || reply.needsSetup) {
        const existing = (await credentialVault.read().catch(() => EMPTY_VAULT)).accounts.find(row => row.username === normalized);
        if (existing || remember) {
          try {
            if (remember) await credentialVault.save({ username: normalized, password, recoveryPhrase: null });
            else await credentialVault.forget(normalized);
          }
          catch { setNotice(text('امسح بيانات التعبئة القديمة من هذا الجهاز إذا تعذر تحديثها.', 'Clear old autofill on this device if it cannot be updated.')); }
          setVault(current => ({ ...current, accounts: current.accounts.map(row => row.username === normalized ? { ...row, recoveryPhrase: undefined } : row) }));
        }
      }
      setPhrase(reply.phrase); setSetupToken(reply.setupToken); setSaved(false); setMode('phrase'); setEnteredPhrase(''); setRecoveryToken('');
    } else if (reply.session) await finish(reply.session);
    else throw new AccountError('SERVICE_UNAVAILABLE');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busyRef.current || cooldown) return;
    credentialRevision.current++;setAccountOptions(false);
    setError(''); setNotice('');
    try {
      if (!validUsername(username)) throw new AccountError('USERNAME_INVALID');
      if (mode === 'register' && (!validPersonName(firstName) || !validPersonName(lastName))) throw new AccountError('NAME_INVALID');
      if (['register','new-password'].includes(mode)) {
        if (!validPassword(password)) throw new AccountError('PASSWORD_INVALID');
        if (password !== confirm) { setError(text('كلمتا المرور غير متطابقتين.', 'Passwords do not match.')); return; }
      }
      busyRef.current = true; setBusy(true);
      if (mode === 'login' || mode === 'register') {
        cancelAuthSuccessSound(authSound.current);
        authSound.current = { consumed: false, cancelled: false };
      } else if (mode === 'forgot' || mode === 'new-password') {
        cancelAuthSuccessSound(authSound.current); authSound.current = null;
      }
      if (authSound.current && (mode !== 'phrase' || saved)) prepareAuthSuccessSound(authSound.current);
      if (mode === 'login') await accept(await accountRequest('login', { username: normalized, password }));
      else if (mode === 'register') await accept(await accountRequest('begin-register', { username: normalized, firstName, lastName }));
      else if (mode === 'phrase') {
        if (!saved) return;
        await accept(await accountRequest('finish-setup', { username: normalized, setupToken, password, onboarding, saved: true }));
      } else if (mode === 'forgot') {
        const reply = await accountRequest('verify-recovery', { username: normalized, phrase: enteredPhrase });
        if (!reply.recoveryToken) throw new AccountError('SERVICE_UNAVAILABLE');
        setRecoveryToken(reply.recoveryToken); setEnteredPhrase(''); setPassword(''); setConfirm(''); setShowPassword(false); setMode('new-password');
      } else if (mode === 'new-password') await accept(await accountRequest('reset-password', { username: normalized, recoveryToken, password }));
    } catch (cause) {
      const code = cause instanceof AccountError ? cause.code : 'SERVICE_UNAVAILABLE';
      if (code === 'RATE_LIMITED') setCooldown(60);
      if (code === 'USERNAME_UNAVAILABLE') setAvailability('taken');
      setError(errorMessage(code));
    } finally { busyRef.current = false; setBusy(false); }
  };
  const forget = async () => {
    setConfirmForget(false);
    try {
      await credentialVault.clear(); setVault(EMPTY_VAULT); vaultRef.current = EMPTY_VAULT; setRemember(false);
      if (mode === 'login' || mode === 'forgot') { setPassword(''); setEnteredPhrase(''); }
      setNotice(text('تم مسح بيانات التعبئة من هذا الجهاز.', 'Autofill data was removed from this device.'));
    } catch { setError(text('تعذر مسح البيانات المحفوظة. أعد المحاولة.', 'Could not remove saved data. Please retry.')); }
  };
  const saveWords = async (download: boolean) => {
    try {
      if (Capacitor.isNativePlatform()) {
        if (download) await SecureAccount.saveRecovery({ phrase, username: normalized }); else await SecureAccount.copyRecovery({ phrase });
      } else if (download) {
        const objectUrl = URL.createObjectURL(new Blob([`SHARek — keep private\n\nUsername: ${normalized}\n\nRecovery words:\n${phrase}\n`], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = objectUrl; link.download = 'SHARek-recovery.txt'; link.click(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else await navigator.clipboard.writeText(phrase);
      setNotice(download ? text('تم حفظ الملف في المكان الذي اخترته.', 'Saved to your chosen location.') : text('تم النسخ. احتفظ بالكلمات في مكان آمن.', 'Copied. Keep these words safe.'));
    } catch (cause) { if (!(cause instanceof Error && cause.message === 'SAVE_CANCELLED')) setError(text('تعذر النسخ أو الحفظ. يمكنك كتابة الكلمات بالترتيب.', 'Could not copy or save. You can write the words down in order.')); }
  };
  const passwordBytes = new TextEncoder().encode(password).length;
  const rule = (ok: boolean, label: string, id: string) => <li key={id} data-rule={id} data-valid={ok} className={ok ? 'met' : 'unmet'}>{ok ? <Check size={15} /> : <X size={15} />}<span>{label}</span><span className="sr-only">{ok ? text('مستوفى', 'Met') : text('غير مستوفى', 'Not met')}</span></li>;
  const title = ({ register: text('إنشاء حساب', 'Create account'), login: text('تسجيل الدخول', 'Log in'), forgot: text('استرداد الحساب', 'Recover account'), 'new-password': text('كلمة مرور جديدة', 'New password'), phrase: text('احفظ كلمات الاسترداد', 'Save recovery words'), ready: text('حسابك جاهز', 'Your account is ready') })[mode];
  if (finishing) return <div className="loading-screen"><div className="loader-dot" /><span>{text('جارٍ فتح حسابك…', 'Opening your account…')}</span></div>;
  return <section ref={authRootRef} className={`auth-screen account-auth${mode === 'phrase' ? ' account-auth-phrase' : ''}`} dir={ar ? 'rtl' : 'ltr'}>
    <header className="topbar"><button type="button" className="icon-button" disabled={['phrase','ready'].includes(mode) || busy} onClick={back} aria-label={text('رجوع', 'Back')}><ArrowLeft size={20} /></button><img src={import.meta.env.BASE_URL+'image.png'} alt="SHARek" className="logo logo-small" /><div className="topbar-spacer" /></header>
    <div className="auth-card"><span className="auth-badge"><ShieldCheck size={16} /> SHARek</span><h2>{title}</h2>
      {mode === 'register' && <p className="account-help">{text('اكتب اسمك، وسنقترح اسم مستخدم يمكنك تغييره.', 'Enter your name. We suggest a username you can change.')}</p>}
      {mode === 'phrase' && <>
        <p>{text('8 كلمات فقط. ترتيبها مهم، والعبارات القديمة ذات 12 كلمة تظل صالحة.', 'Just 8 words. Order matters. Existing 12-word phrases still work.')}</p>
        <div className="account-username-summary">{text('اسم المستخدم للدخول', 'Your login username')}: <b dir="ltr">{normalized}</b></div>
        <ol className="recovery-words" dir="ltr">{phrase.split(' ').map((word,index)=><li key={index}><span>{index+1}</span><b>{word}</b></li>)}</ol>
        <div className="recovery-actions"><button type="button" onClick={()=>void saveWords(false)}><Copy size={17}/>{text('نسخ','Copy')}</button><button type="button" onClick={()=>void saveWords(true)}><Download size={17}/>{text('حفظ TXT','Download TXT')}</button></div>
        <p className="recovery-warning">{text('احتفظ بنسخة آمنة خارج الجهاز أيضًا. الكلمات المحفوظة على هذا الجهاز تساعدك في التعبئة، لكنها تُفقد عند حذف التطبيق أو بياناته. لا تشاركها مع أحد.', 'Keep a safe backup off this device too. Device autofill is lost if the app or its data is deleted. Never share these words.')}</p>
      </>}
      {mode !== 'ready' && <form className={mode==='register'?'account-registration-fields':''} onSubmit={event=>void submit(event)} autoComplete="on">
        {mode === 'register' && <div className="account-name-grid">
          <label><span className="account-field-label">{text('الاسم الأول','First name')}</span><div className="input-wrap"><UserRound size={18} aria-hidden="true"/><input name="given-name" dir={ar?'rtl':'ltr'} placeholder={text('الاسم الأول','First name')} autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)} maxLength={100} required disabled={busy}/></div></label>
          <label><span className="account-field-label">{text('الاسم الأخير','Last name')}</span><div className="input-wrap"><UserRound size={18} aria-hidden="true"/><input name="family-name" dir={ar?'rtl':'ltr'} placeholder={text('الاسم الأخير','Last name')} autoComplete="family-name" value={lastName} onChange={e=>setLastName(e.target.value)} maxLength={100} required disabled={busy}/></div></label>
        </div>}
        {!['phrase','new-password'].includes(mode) && <label><span className="account-field-label">{text(mode==='register'?'اسم المستخدم المقترح — يمكنك تعديله':'اسم المستخدم', mode==='register'?'Suggested username — editable':'Username')}</span><div className="input-wrap account-username-wrap"><UserRound size={18} aria-hidden="true"/><input placeholder={mode==='register'?text('اسم المستخدم','Username'):undefined} aria-label={text('اسم المستخدم','Username')} name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" value={username} onFocus={()=>{if(['login','forgot'].includes(mode))setAccountOptions(true);if(mode==='login'&&hasDevicePasswordManager()&&!vault.accounts.length&&!managerAutoTried.current){managerAutoTried.current=true;void chooseDeviceAccount();}}} onBlur={e=>{if(!e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget))setAccountOptions(false);}} onChange={e=>{credentialRevision.current++;editedRef.current=true;if(mode==='register')setUsername(e.target.value);else fill(e.target.value,mode);}} maxLength={24} required disabled={busy}/>{mode==='register'&&<><small className={`account-availability ${availability}`} role="status" aria-live="polite" aria-atomic="true" title={availability==='invalid'?text('3–24 حرفًا إنجليزيًا أو رقمًا أو _.','3–24 letters, digits, underscores'):availability==='unknown'?text('تعذر التحقق من توفر الاسم الآن','Username availability could not be checked'):undefined}>{availability==='available'?<CircleCheck size={16} aria-hidden="true"/>:availability==='taken'||availability==='invalid'?<CircleX size={16} aria-hidden="true"/>:availability==='checking'?<LoaderCircle size={16} aria-hidden="true"/>:<CircleHelp size={16} aria-hidden="true"/>}<span className="account-availability-text">{availability==='checking'?text('جارٍ التحقق','Checking'):availability==='available'?text('متاح','Available'):availability==='taken'?text('مستخدم','Taken'):availability==='invalid'?text('غير صالح','Invalid'):text('تعذر التحقق','Unavailable')}</span></small><button type="button" className="password-eye" disabled={busy} onClick={()=>setUsername(suggestedUsername())} aria-label={text('اقتراح اسم مستخدم آخر','Suggest another username')}><RefreshCw size={17}/></button></>}</div>
          {accountOptions&&['login','forgot'].includes(mode)&&<div className="saved-account-options" role="group" aria-label={text('الحسابات المحفوظة','Saved accounts')}>{vault.accounts.map(row=><button type="button" key={row.username} onPointerDown={e=>e.preventDefault()} onMouseDown={e=>e.preventDefault()} onClick={()=>{credentialRevision.current++;editedRef.current=true;fill(row.username,mode);setAccountOptions(false);}}><UserRound size={16}/><span dir="ltr">{row.username}</span><KeyRound size={14}/></button>)}{mode==='login'&&hasDevicePasswordManager()&&<button type="button" disabled={choosing} onPointerDown={e=>e.preventDefault()} onMouseDown={e=>e.preventDefault()} onClick={()=>void chooseDeviceAccount()}><KeyRound size={16}/>{text('اختيار حساب من مدير كلمات المرور','Choose from password manager')}</button>}</div>}
        </label>}
        {['login','register','new-password'].includes(mode)&&<label><span className="account-field-label">{text('كلمة المرور','Password')}</span><div className="input-wrap"><KeyRound size={17}/><input name="password" placeholder={mode==='register'?text('كلمة المرور','Password'):undefined} dir="ltr" aria-label={text('كلمة المرور','Password')} type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>{credentialRevision.current++;editedRef.current=true;setPassword(e.target.value);}} required disabled={busy}/><button type="button" className="password-eye" onClick={()=>setShowPassword(!showPassword)} aria-label={text(showPassword?'إخفاء كلمة المرور':'إظهار كلمة المرور',showPassword?'Hide password':'Show password')}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
          {mode!=='login'&&(password.length>0||error===errorMessage('PASSWORD_INVALID'))&&!validPassword(password)&&<ul className="password-requirements" aria-label={text('متطلبات كلمة المرور','Password requirements')}>{rule(Array.from(password).length>=12,text('12 حرفًا على الأقل','At least 12 characters'),'length')}{rule(passwordBytes>0&&passwordBytes<=72,text(`ضمن الطول المسموح (${passwordBytes}/72 بايت)`,`Within the allowed length (${passwordBytes}/72 bytes)`),'bytes')}</ul>}
        </label>}
        {['register','new-password'].includes(mode)&&<label><span className="account-field-label">{text('تأكيد كلمة المرور','Confirm password')}</span><div className="input-wrap"><KeyRound size={17}/><input name="confirm-password" placeholder={mode==='register'?text('تأكيد كلمة المرور','Confirm password'):undefined} dir="ltr" aria-label={text('تأكيد كلمة المرور','Confirm password')} type={showPassword?'text':'password'} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required disabled={busy}/></div>{confirm&&password!==confirm&&<ul className="password-requirements">{rule(false,text('كلمتا المرور غير متطابقتين','Passwords do not match'),'match')}</ul>}</label>}
        {mode==='forgot'&&<label>{text('كلمات الاسترداد بالترتيب','Recovery words in order')}<textarea aria-label={text('كلمات الاسترداد بالترتيب','Recovery words in order')} name="recovery-phrase" dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} value={enteredPhrase} onChange={e=>setEnteredPhrase(e.target.value)} maxLength={512} required disabled={busy}/><small>{vault.accounts.find(row=>row.username===normalized)?.recoveryPhrase?text('تمت تعبئة الكلمات المحفوظة مشفّرة على هذا الجهاز. يمكنك تعديلها.','Filled from encrypted device storage. You can edit the words.'):text('أدخل 8 كلمات، أو عبارتك القديمة ذات 12 كلمة. لا يمكن استرجاع الكلمات القديمة من الخادم.','Enter 8 words, or your existing 12-word phrase. Old words cannot be retrieved from the server.')}</small></label>}
        {mode!=='forgot'&&<label className="recovery-confirm account-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={e=>setRemember(e.target.checked)}/>{text('تذكّر بيانات دخولي والاسترداد مشفّرة على هذا الجهاز','Remember my sign-in and recovery details encrypted on this device')}</label>}
        <div ref={mode === 'phrase' ? footerRef : undefined} className={mode === 'phrase' ? 'account-submit-group recovery-fixed-actions' : 'account-submit-group'}>
        {mode==='phrase'&&<label className="recovery-confirm"><input type="checkbox" checked={saved} disabled={busy} onChange={e=>setSaved(e.target.checked)}/>{text('حفظت كلمات الاسترداد بالترتيب في مكان آمن.','I saved the recovery words in order in a safe place.')}</label>}
        {error&&<div role="alert" className="feedback error">{error}</div>}{notice&&<div role="status" className="feedback success">{notice}</div>}
        <button type="submit" className="primary-button auth-submit" disabled={busy||cooldown>0||(mode==='phrase'&&!saved)||(mode==='register'&&(availability==='checking'||availability==='taken'))}>{busy?text('جارٍ التنفيذ…','Please wait…'):cooldown?`${cooldown}s`:mode==='phrase'?text('حفظت الكلمات — متابعة','I saved the words — continue'):mode==='forgot'?text('التحقق من الكلمات','Verify words'):mode==='login'?text('دخول','Log in'):mode==='register'?text('إنشاء الحساب','Create account'):text('تعيين كلمة المرور','Set password')}</button>
        </div>
      </form>}
      {mode==='ready'&&pendingSession&&<><div className="feedback error" role="alert">{error}</div><button className="primary-button" onClick={()=>{if(authSound.current)prepareAuthSuccessSound(authSound.current);void finish(pendingSession);}}>{text('إعادة المحاولة وفتح الحساب','Retry and open account')}</button><button className="text-button" onClick={()=>{if(authSound.current)prepareAuthSuccessSound(authSound.current);void finish(pendingSession,true);}}>{text('المتابعة دون حفظ على الجهاز','Continue without device storage')}</button></>}
      {mode==='register'&&<p className="auth-switch">{text('لديك حساب بالفعل؟','Already have an account?')} <button disabled={busy} onClick={goLogin}>{text('تسجيل الدخول','Log in')}</button></p>}
      {mode==='login'&&<><button className="text-button" disabled={busy} onClick={()=>{setError('');setNotice('');fill(username,'forgot');setMode('forgot');setShowPassword(false);}}>{text('نسيت كلمة المرور؟','Forgot password?')}</button><p className="auth-switch">{text('ليس لديك حساب؟','New here?')} <button disabled={busy} onClick={goRegister}>{text('إنشاء حساب جديد','Create account')}</button></p>{legacyOAuth}</>}
      {vault.accounts.length>0&&<button type="button" className="text-button" disabled={busy||mode==='ready'} onClick={()=>setConfirmForget(true)}>{text('مسح بيانات التعبئة المحفوظة من هذا الجهاز','Clear saved autofill from this device')}</button>}
      <div className="auth-legal-links"><button onClick={()=>void openLegalPage(LEGAL_URLS.privacy)}>{text('سياسة الخصوصية','Privacy Policy')}</button><span>·</span><button onClick={()=>void openLegalPage(LEGAL_URLS.terms)}>{text('شروط الخدمة','Terms')}</button></div>
    </div>
    {confirmForget&&<div className="modal-overlay"><div className="modal-card" role="dialog" aria-modal="true" aria-label={text('مسح بيانات التعبئة','Clear autofill')}><h3>{text('مسح بيانات التعبئة من هذا الجهاز؟','Clear autofill from this device?')}</h3><p>{text('سيتم مسح كلمات المرور والاسترداد المحفوظة محليًا. احتفظ بنسخة آمنة قبل المسح.','Saved local passwords and recovery words will be removed. Keep a safe backup before clearing.')}</p><button className="primary-button danger" onClick={()=>void forget()}>{text('تأكيد المسح','Confirm clear')}</button><button className="text-button" onClick={()=>setConfirmForget(false)}>{text('رجوع','Back')}</button></div></div>}
  </section>;
}
