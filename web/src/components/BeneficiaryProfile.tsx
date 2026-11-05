import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, Check, Edit3, HandHeart, Heart, LogOut, Save, Star, Utensils, X } from 'lucide-react';
import { supabase, type Language, type Profile } from '@/lib/supabase';
import { ProfilePhotoUploader } from '@/components/ProfilePhotoUploader';

type Props = {
  language: Language;
  profile: Profile;
  onBack: () => void;
  onSignOut: () => void;
  onAvatarChange?: (url: string | null) => void;
};

type BeneficiaryStats = {
  total_meals_received: number;
  unique_donors_helped: number;
  completed_handovers: number;
  average_rating: number;
  badges: string[];
};

const allBadges: Record<string, { ar: string; en: string; medal: string; desc_ar: string; desc_en: string }> = {
  first_meal: { ar: 'أول وجبة', en: 'First Meal', medal: '🍽️', desc_ar: 'استلام أول وجبة', desc_en: 'Receive your first meal' },
  regular_receiver: { ar: 'متلقي منتظم', en: 'Regular Receiver', medal: '🥁', desc_ar: 'استلام 10 وجبات', desc_en: 'Receive 10 meals' },
  community_connected: { ar: 'متصل بالمجتمع', en: 'Community Connected', medal: '🤝', desc_ar: 'تعامل مع 5 متبرعين مختلفين', desc_en: 'Engage with 5 different donors' },
  trusted_member: { ar: 'عضو موثوق', en: 'Trusted Member', medal: '⭐', desc_ar: 'إتمام 15 عملية استلام', desc_en: 'Complete 15 handovers' },
  respected_member: { ar: 'عضو مُقدّر', en: 'Respected Member', medal: '🏆', desc_ar: 'تقييم 4.5+ من 3 تقييمات', desc_en: '4.5+ rating from 3+ reviews' },
};

const badgeOrder = ['first_meal', 'regular_receiver', 'community_connected', 'trusted_member', 'respected_member'];

export function BeneficiaryProfile({ language, profile, onBack, onSignOut, onAvatarChange }: Props) {
  const isAr = language === 'ar';
  const [stats, setStats] = useState<BeneficiaryStats | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);

  const copy = {
    back: isAr ? 'رجوع' : 'Back',
    title: isAr ? 'حسابي' : 'My Account',
    mealsReceived: isAr ? 'وجبات مستلمة' : 'Meals Received',
    uniqueDonors: isAr ? 'متبرعون ساعدوني' : 'Donors Helped',
    completedHandovers: isAr ? 'عمليات مكتملة' : 'Completed Handovers',
    avgRating: isAr ? 'متوسط التقييم' : 'Average Rating',
    reviews: isAr ? 'تقييمات' : 'reviews',
    badges: isAr ? 'الأوسمة والإنجازات' : 'Badges & Achievements',
    signOut: isAr ? 'تسجيل الخروج' : 'Log out',
    unknown: isAr ? 'يا صديق الخير' : 'Goodness friend',
    role: isAr ? 'محتاج وجبة' : 'Meal beneficiary',
    edit: isAr ? 'تعديل الملف' : 'Edit profile',
    name: isAr ? 'الاسم الظاهر' : 'Display name',
    save: isAr ? 'حفظ' : 'Save',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    saveError: isAr ? 'تعذر حفظ الملف الآن.' : 'Could not save your profile right now.',
    accountInfo: isAr ? 'معلومات الحساب' : 'Account Information',
    provider: isAr ? 'طريقة الدخول' : 'Sign-in method',
    memberSince: isAr ? 'عضو منذ' : 'Member since',
  };

  const fetchData = useCallback(async () => {
    const [statsRes, reviewsRes] = await Promise.all([
      supabase.rpc('get_beneficiary_stats', { p_beneficiary_id: profile.id }),
      supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('reviewee_id', profile.id).eq('review_type', 'donor_to_beneficiary'),
    ]);
    if (statsRes.data) {
      const data = statsRes.data as BeneficiaryStats[] | BeneficiaryStats;
      setStats(Array.isArray(data) ? data[0] : data);
    }
    if (reviewsRes.count != null) setReviewCount(reviewsRes.count);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const saveProfile = async (): Promise<void> => {
    const trimmedName = displayName.trim();
    if (!trimmedName) return;
    setSavingProfile(true);
    setProfileError('');
    const { error } = await supabase.from('profiles').update({ display_name: trimmedName }).eq('id', profile.id);
    setSavingProfile(false);
    if (error) { setProfileError(copy.saveError); return; }
    setDisplayName(trimmedName);
    setEditing(false);
  };

  const earnedBadges = new Set(stats?.badges ?? []);

  return (
    <div className="donor-profile-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="donor-profile-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <span>{copy.title}</span>
        <div className="donor-profile-header-actions">
          <button className="icon-button" onClick={() => setEditing((v) => !v)} aria-label={copy.edit}>{editing ? <X size={18} /> : <Edit3 size={18} />}</button>
          <button className="icon-button" onClick={onSignOut} aria-label={copy.signOut}><LogOut size={18} /></button>
        </div>
      </header>

      {loading ? (
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      ) : (
        <>
          {editing && (
            <form className="donor-profile-edit" onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
              <ProfilePhotoUploader language={language} userId={profile.id} currentAvatar={avatarUrl} onAvatarChange={(url) => { setAvatarUrl(url); onAvatarChange?.(url); }} />
              <label>{copy.name}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus /></label>
              {profileError && <div className="feedback error">{profileError}</div>}
              <div className="donor-profile-edit-actions">
                <button type="button" className="text-button" onClick={() => setEditing(false)}>{copy.cancel}</button>
                <button type="submit" className="primary-button" disabled={savingProfile || !displayName.trim()}>{savingProfile ? '...' : copy.save}<Save size={16} /></button>
              </div>
            </form>
          )}

          <div className="donor-profile-hero">
            <div className="donor-profile-avatar-wrap">
              {avatarUrl ? <img src={avatarUrl} alt="" className="donor-profile-avatar" /> : <span className="donor-profile-avatar placeholder"><Heart size={32} fill="currentColor" /></span>}
              {profile.is_verified && <BadgeCheck size={22} className="donor-profile-verified" />}
            </div>
            <h2>{displayName || copy.unknown}</h2>
            <span className="donor-profile-distance"><Utensils size={15} />{copy.role}</span>
            {stats && stats.average_rating > 0 && <span className="beneficiary-profile-rating"><Star size={16} fill="currentColor" />{stats.average_rating.toFixed(1)} · {reviewCount} {copy.reviews}</span>}
          </div>

          <div className="beneficiary-profile-stats">
            <div><strong>{stats?.total_meals_received ?? 0}</strong><span>{copy.mealsReceived}</span></div>
            <div><strong>{stats?.unique_donors_helped ?? 0}</strong><span>{copy.uniqueDonors}</span></div>
            <div><strong>{stats?.completed_handovers ?? 0}</strong><span>{copy.completedHandovers}</span></div>
          </div>

          <div className="achievements-section">
            <h3>{copy.badges}</h3>
            <div className="achievements-grid">
              {badgeOrder.map((key) => {
                const info = allBadges[key];
                if (!info) return null;
                const earned = earnedBadges.has(key);
                return (
                  <div key={key} className={`achievement-card ${earned ? 'earned' : 'locked'}`}>
                    <span className="achievement-icon">{info.medal}</span>
                    <div className="achievement-info">
                      <strong>{isAr ? info.ar : info.en}</strong>
                      <small>{isAr ? info.desc_ar : info.desc_en}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="donor-profile-badges-section">
            <h3>{copy.accountInfo}</h3>
            <div className="donor-profile-stats" style={{ flexDirection: 'column', gap: '12px' }}>
              <div style={{ flexDirection: 'row', justifyContent: 'space-between' }}><span style={{ color: '#967f70', fontSize: '.78rem' }}>{copy.provider}</span><strong style={{ fontSize: '.82rem' }}>{profile.provider === 'email' ? (isAr ? 'بريد إلكتروني' : 'Email') : profile.provider}</strong></div>
              <div style={{ flexDirection: 'row', justifyContent: 'space-between' }}><span style={{ color: '#967f70', fontSize: '.78rem' }}>{copy.memberSince}</span><strong style={{ fontSize: '.82rem' }}>{profile.created_at ? new Date(profile.created_at).getFullYear() : new Date().getFullYear()}</strong></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
