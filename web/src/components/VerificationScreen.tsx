import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Clock, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { supabase, formatPrice, getCountryCurrency, type Language, type Profile, type VerificationPricing, type VerificationRequest } from '@/lib/supabase';

type Props = {
  language: Language;
  profile: Profile;
  onBack: () => void;
};

export function VerificationScreen({ language, profile, onBack }: Props) {
  const isAr = language === 'ar';
  const [pricing, setPricing] = useState<VerificationPricing | null>(null);
  const [existingRequest, setExistingRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [comingSoon,setComingSoon]=useState(false);

  const copy = {
    back: isAr ? 'رجوع' : 'Back',
    title: isAr ? 'توثيق الحساب' : 'Account Verification',
    subtitle: isAr ? 'احصل على علامة التوثيق بجانب اسمك لزيادة الثقة داخل مجتمع SHARek.' : 'Get a verified badge next to your name to increase trust within the SHARek community.',
    fee: isAr ? 'رسوم التوثيق' : 'Verification fee',
    pay: isAr ? 'وثّق حسابك الآن 🔵' : 'Verify your account now 🔵',
    paying: isAr ? 'جارٍ المعالجة...' : 'Processing...',
    statusUnpaid: isAr ? 'غير مدفوع' : 'Unpaid',
    statusPending: isAr ? 'قيد المراجعة' : 'Under review',
    statusApproved: isAr ? 'موثق' : 'Verified',
    statusRejected: isAr ? 'مرفوض' : 'Rejected',
    statusRefunded: isAr ? 'مسترد' : 'Refunded',
    statusExpired: isAr ? 'منتهي' : 'Expired',
    statusCancelled: isAr ? 'ملغى' : 'Cancelled',
    pendingMsg: isAr ? 'هذا طلب توثيق سابق. لا يمكن اعتباره مدفوعًا أو تفعيله حتى تتوفر بوابة دفع وتأكيد موثوق.' : 'This is an earlier verification request. It cannot be treated as paid or activated until a payment gateway and trusted confirmation are available.',
    approvedMsg: isAr ? 'تم توثيق حسابك! تظهر علامة التوثيق بجانب اسمك في جميع أنحاء التطبيق.' : 'Your account is verified! The verified badge appears next to your name throughout the app.',
    rejectedMsg: isAr ? 'تم رفض طلب التوثيق. تواصل مع الدعم لمزيد من المعلومات.' : 'Your verification request was rejected. Contact support for more information.',
    refundedMsg: isAr ? 'تم استرد رسوم التوثيق.' : 'Your verification fee has been refunded.',
    paymentError: isAr ? 'تعذر إتمام الدفع. حاول مرة أخرى.' : 'Could not complete payment. Please try again.',
    notAvailable: isAr ? 'التوثيق غير متاح حاليًا في بلدك. تواصل مع الدعم.' : 'Verification is not currently available in your country. Contact support.',
    alreadyVerified: isAr ? 'حسابك موثق بالفعل.' : 'Your account is already verified.',
    paymentSoon: isAr ? 'خدمة توثيق الحساب ستكون متاحة قريبًا' : 'Account verification will be available soon',
  };
  const benefits=isAr?[
    ['🔵 شارة التوثيق الزرقاء','تظهر بجانب اسم الحساب وصورته في الملف الشخصي والمحادثات وبطاقات الوجبات.'],
    ['💬 مراسلة مباشرة','التواصل داخل SHARek وفق إعدادات الخصوصية والحظر، دون طلب وجبة مسبق.'],
    ['🍱 التواصل مع أصحاب الوجبات','يمكن للمحتاج الموثق الاستفسار عن الوجبة قبل طلبها.'],
    ['❤️ التواصل مع المحتاجين','يمكن لمقدّم المساعدة الموثق مراسلة المحتاجين المتاحين له للتنسيق.'],
    ['👤 الملفات الشخصية','فتح المعلومات العامة المتاحة عن الحسابات.'],
    ['🔔 إشعارات المحادثات','استقبال تنبيهات الرسائل وإدارة المحادثات.'],
    ['🤝 هوية موثوقة','تظهر شارة مقدّم المساعدة بجانب اسمه وصورته في الملف والوجبات والشات.'],
    ['🏢 ظهور احترافي','تظهر الشارة بجانب أسماء المطاعم والمؤسسات الموثقة ووجباتها.'],
  ]:[
    ['🔵 Blue verification badge','Shown beside your name and photo on your profile, in chats, and on meal cards.'],
    ['💬 Direct messaging','Contact others within SHARek under privacy and blocking rules, without a prior meal request.'],
    ['🍱 Contact meal owners','Verified beneficiaries can ask about a meal before requesting it.'],
    ['❤️ Contact people who need help','Verified helpers can message eligible beneficiaries to coordinate help.'],
    ['👤 Profiles','View public information available on other profiles.'],
    ['🔔 Chat notifications','Receive message alerts and manage conversations.'],
    ['🤝 Trusted helper identity','Helpers display a badge beside their name and photo in profiles, meals, and chats.'],
    ['🏢 Professional presence','Verified restaurants and organizations display a badge on their profiles and meals.'],
  ];

  const fetchData = useCallback(async () => {
    const [priceRes, reqRes] = await Promise.all([
      supabase.rpc('get_verification_price', { p_country_code: profile.country_code ?? '' }),
      supabase.rpc('get_my_verification_request', { p_user_id: profile.id }),
    ]);
    if (priceRes.data && (priceRes.data as VerificationPricing[]).length > 0) {
      setPricing((priceRes.data as VerificationPricing[])[0]);
    } else {
      const fallback = getCountryCurrency(profile.country_code);
      setPricing({
        id: '', country_code: profile.country_code ?? '', country_name: profile.country_name ?? '',
        currency_code: fallback.code, currency_symbol: fallback.symbol, amount: 0, is_active: false,
      });
    }
    if (reqRes.data) setExistingRequest(reqRes.data as VerificationRequest);
    setLoading(false);
  }, [profile.country_code, profile.country_name, profile.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const statusInfo = (status: string) => {
    switch (status) {
      case 'UNPAID': return { label: copy.statusUnpaid, icon: <Clock size={20} />, color: '#967f70' };
      case 'PAID_PENDING_REVIEW': return { label: copy.statusPending, icon: <Clock size={20} />, color: '#d97706' };
      case 'APPROVED': return { label: copy.statusApproved, icon: <BadgeCheck size={20} />, color: '#0f766e' };
      case 'REJECTED': return { label: copy.statusRejected, icon: <X size={20} />, color: '#b14c38' };
      case 'REFUNDED': return { label: copy.statusRefunded, icon: <Clock size={20} />, color: '#967f70' };
      case 'EXPIRED': return { label: copy.statusExpired, icon: <Clock size={20} />, color: '#967f70' };
      case 'CANCELLED': return { label: copy.statusCancelled, icon: <X size={20} />, color: '#967f70' };
      default: return { label: status, icon: <Clock size={20} />, color: '#967f70' };
    }
  };

  if (loading) {
    return (
      <div className="notif-settings-page" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="notif-center-header">
          <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
          <h2>{copy.title}</h2>
        </header>
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      </div>
    );
  }

  const isVerified = profile.is_verified;
  const si = existingRequest ? statusInfo(existingRequest.status) : null;

  return (
    <div className="notif-settings-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="notif-center-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <h2>{copy.title}</h2>
      </header>

      <div className="verification-body">
        <div className="verification-hero">
          <div className="verification-hero-icon"><ShieldCheck size={48} /></div>
          <p className="verification-subtitle">{copy.subtitle}</p>
        </div>
        <div className="verification-benefits" aria-label={isAr?'مزايا التوثيق':'Verification benefits'}>
          {benefits.map(([title,description])=><div key={title} className="verification-benefit"><MessageCircle size={16}/><span><strong>{title}</strong><small>{description}</small></span></div>)}
        </div>
        {/* Verified state */}
        {isVerified && (
          <div className="verification-status-card approved">
            <div className="verification-status-icon"><BadgeCheck size={40} /></div>
            <h3>{copy.statusApproved}</h3>
            <p>{copy.alreadyVerified}</p>
          </div>
        )}

        {/* Pending review */}
        {!isVerified && existingRequest && existingRequest.status === 'PAID_PENDING_REVIEW' && (
          <div className="verification-status-card pending">
            <div className="verification-status-icon" style={{ color: si?.color }}>{si?.icon}</div>
            <h3>{si?.label}</h3>
            <p>{copy.pendingMsg}</p>
          </div>
        )}

        {/* Rejected */}
        {!isVerified && existingRequest && existingRequest.status === 'REJECTED' && (
          <div className="verification-status-card rejected">
            <div className="verification-status-icon" style={{ color: si?.color }}>{si?.icon}</div>
            <h3>{si?.label}</h3>
            <p>{copy.rejectedMsg}</p>
            {existingRequest.admin_notes && <p className="verification-admin-notes">{existingRequest.admin_notes}</p>}
          </div>
        )}

        {/* Refunded */}
        {!isVerified && existingRequest && existingRequest.status === 'REFUNDED' && (
          <div className="verification-status-card refunded">
            <div className="verification-status-icon" style={{ color: si?.color }}>{si?.icon}</div>
            <h3>{si?.label}</h3>
            <p>{copy.refundedMsg}</p>
          </div>
        )}

        {/* Initial purchase screen — no active request */}
        {!isVerified && (!existingRequest || ['REJECTED','REFUNDED','EXPIRED','CANCELLED'].includes(existingRequest.status)) && (
          <>
            {pricing && pricing.amount > 0 ? (
              <div className="verification-pricing-card">
                <span className="verification-fee-label">{copy.fee}</span>
                <span className="verification-fee-amount">{formatPrice(pricing.amount, pricing.currency_symbol, language)}</span>
              </div>
            ) : (
              <div className="verification-pricing-card unavailable">
                <span>{copy.notAvailable}</span>
              </div>
            )}

          </>
        )}
        {!isVerified&&<><button className="primary-button verification-pay-btn" onClick={()=>setComingSoon(true)}>{copy.pay}</button>
          <p className="verification-disclaimer">{isAr?'المزايا الإضافية ستُفعّل بعد اعتماد التوثيق الفعلي. لا يتطلب الضغط على الزر أي دفع أو بيانات بنكية.':'Additional privileges will activate only after actual verification is approved. This button does not require payment or bank details.'}</p>
          {comingSoon&&<p className="feedback" role="status">{copy.paymentSoon}</p>}</>}
      </div>
    </div>
  );
}
