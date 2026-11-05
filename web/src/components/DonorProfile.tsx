import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Award, BadgeCheck, Edit3, HandHeart, Heart, LogOut, MapPin, Save, Sparkles, Star, Utensils, X } from 'lucide-react';
import { supabase, formatDistance, haversineDistance, type Language, type Profile, type DonorStats as DonorStatsType } from '@/lib/supabase';
import { ProfilePhotoUploader } from '@/components/ProfilePhotoUploader';

type Props = {
  language: Language;
  profile: Profile;
  userLat: number | null;
  userLng: number | null;
  onBack: () => void;
  onSignOut: () => void;
  onAvatarChange?: (url: string | null) => void;
};

type DonorStats = {
  total_meals_shared: number;
  total_people_helped: number;
  average_rating: number;
  badges: string[];
};

const allBadges: Record<string, { ar: string; en: string; medal: string; desc_ar: string; desc_en: string }> = {
  first_share: { ar: 'بداية الخير', en: 'First Help', medal: '🌱', desc_ar: 'إتمام أول عملية مساعدة', desc_en: 'Complete your first handover' },
  generous: { ar: 'مساعد الطعام', en: 'Food Helper', medal: '🍱', desc_ar: 'إتمام 10 عمليات مساعدة', desc_en: 'Complete 10 handovers' },
  helper: { ar: 'صانع أثر', en: 'Impact Maker', medal: '❤️', desc_ar: 'مساعدة 5 أشخاص مختلفين', desc_en: 'Help 5 different people' },
  hand_helper: { ar: 'يد العون', en: 'Helping Hand', medal: '🤝', desc_ar: 'إتمام 15 عملية مساعدة', desc_en: 'Complete 15 handovers' },
  sustained: { ar: 'أثر مستمر', en: 'Sustained Impact', medal: '🌟', desc_ar: '10 عمليات + تقييم 4.0+', desc_en: '10 handovers + 4.0+ rating' },
  top_rated: { ar: 'تقييم ممتاز', en: 'Top Rated', medal: '🏆', desc_ar: 'تقييم 4.5+ من 3 تقييمات', desc_en: '4.5+ rating from 3+ reviews' },
};

const badgeOrder = ['first_share', 'generous', 'helper', 'hand_helper', 'sustained', 'top_rated'];

const levelLabels = [
  { threshold: 0, ar: 'شريك SHARek', en: 'SHARek Partner', medal: '🥉' },
  { threshold: 5, ar: 'شريك مميز', en: 'Distinguished Partner', medal: '🥈' },
  { threshold: 15, ar: 'صانع الخير', en: 'Goodness Maker', medal: '🥇' },
  { threshold: 30, ar: 'بطل SHARek', en: 'SHARek Champion', medal: '🏆' },
  { threshold: 50, ar: 'سفير SHARek', en: 'SHARek Ambassador', medal: '🌍' },
];

export function DonorProfile({ language, profile, userLat, userLng, onBack, onSignOut, onAvatarChange }: Props) {
  const isAr = language === 'ar';
  const [stats, setStats] = useState<DonorStats | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [completedHandovers, setCompletedHandovers] = useState(0);
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);

  const copy = {
    back: isAr ? 'رجوع' : 'Back',
    mealsShared: isAr ? 'وجبات تمت مساعدتها' : 'Meals Helped',
    peopleHelped: isAr ? 'أشخاص تمت مساعدتهم' : 'People Helped',
    avgRating: isAr ? 'متوسط التقييم' : 'Average Rating',
    reviews: isAr ? 'تقييمات' : 'reviews',
    completed: isAr ? 'عمليات مكتملة' : 'Completed Handovers',
    badges: isAr ? 'الأوسمة والإنجازات' : 'Badges & Achievements',
    level: isAr ? 'مستوى الشريك' : 'Partner Level',
    signOut: isAr ? 'تسجيل الخروج' : 'Log out',
    unknown: isAr ? 'شريك SHARek' : 'SHARek Partner',
    noBadges: isAr ? 'لم تحصل على أوسمة بعد' : 'No badges earned yet',
    distance: isAr ? 'المسافة' : 'Distance',
    edit: isAr ? 'إكمال الملف' : 'Complete profile',
    name: isAr ? 'الاسم الظاهر' : 'Display name',
    save: isAr ? 'حفظ البيانات' : 'Save profile',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    saveError: isAr ? 'تعذر حفظ الملف الآن.' : 'Could not save your profile right now.',
    role: isAr ? 'متبرع بالطعام' : 'Food donor',
  };

  const fetchData = useCallback(async () => {
    const [statsRes, reviewsRes, completedRes] = await Promise.all([
      supabase.rpc('get_donor_stats', { p_donor_id: profile.id }),
      supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('reviewee_id', profile.id).eq('review_type', 'beneficiary_to_donor'),
      supabase.from('meal_requests').select('id', { count: 'exact', head: true }).eq('donor_id', profile.id).in('status', ['COMPLETED', 'RECEIVED']),
    ]);
    if (statsRes.data) {
      const data = statsRes.data as DonorStats[] | DonorStats;
      setStats(Array.isArray(data) ? data[0] : data);
    }
    if (reviewsRes.count != null) setReviewCount(reviewsRes.count);
    if (completedRes.count != null) setCompletedHandovers(completedRes.count);
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

  const distance = profile.helper_latitude != null && profile.helper_longitude != null && userLat != null && userLng != null
    ? haversineDistance(userLat, userLng, profile.helper_latitude, profile.helper_longitude)
    : null;

  const currentLevel = [...levelLabels].reverse().find((l) => (stats?.total_people_helped ?? 0) >= l.threshold) ?? levelLabels[0];
  const nextLevel = levelLabels.find((l) => l.threshold > (stats?.total_people_helped ?? 0));
  const progressToNext = nextLevel && stats ? Math.min(100, ((stats.total_people_helped - currentLevel.threshold) / (nextLevel.threshold - currentLevel.threshold)) * 100) : 100;
  const earnedBadges = new Set(stats?.badges ?? []);

  return (
    <div className="donor-profile-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="donor-profile-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <span>{isAr ? 'حسابي' : 'My Account'}</span>
        <div className="donor-profile-header-actions"><button className="icon-button" onClick={() => setEditing((value) => !value)} aria-label={copy.edit}>{editing ? <X size={18} /> : <Edit3 size={18} />}</button><button className="icon-button" onClick={onSignOut} aria-label={copy.signOut}><LogOut size={18} /></button></div>
      </header>

      {loading ? (
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      ) : (
        <>
          {editing && <form className="donor-profile-edit" onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}><ProfilePhotoUploader language={language} userId={profile.id} currentAvatar={avatarUrl} onAvatarChange={(url) => { setAvatarUrl(url); onAvatarChange?.(url); }} /><label>{copy.name}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus /></label>{profileError && <div className="feedback error">{profileError}</div>}<div className="donor-profile-edit-actions"><button type="button" className="text-button" onClick={() => setEditing(false)}>{copy.cancel}</button><button type="submit" className="primary-button" disabled={savingProfile || !displayName.trim()}>{savingProfile ? '...' : copy.save}<Save size={16} /></button></div></form>}

          <div className="donor-profile-hero">
            <div className="donor-profile-avatar-wrap">
              {avatarUrl ? <img src={avatarUrl} alt="" className="donor-profile-avatar" /> : <span className="donor-profile-avatar placeholder"><Heart size={32} fill="currentColor" /></span>}
              {profile.is_verified && <BadgeCheck size={22} className="donor-profile-verified" />}
            </div>
            <h2>{displayName || copy.unknown}</h2>
            <span className="donor-profile-distance"><Utensils size={15} />{copy.role}</span>
            {distance != null && <span className="donor-profile-distance"><MapPin size={15} />{formatDistance(distance, language)}</span>}
            {stats && stats.average_rating > 0 && <span className="donor-profile-rating"><Star size={16} fill="currentColor" />{stats.average_rating.toFixed(1)} · {reviewCount} {copy.reviews}</span>}
          </div>

          <div className="donor-profile-level">
            <h3>{copy.level}</h3>
            <div className="donor-profile-level-card">
              <span className="donor-profile-level-medal">{currentLevel.medal}</span>
              <div>
                <strong>{isAr ? currentLevel.ar : currentLevel.en}</strong>
                {nextLevel && <small>{(stats?.total_people_helped ?? 0)} / {nextLevel.threshold} {isAr ? 'للمستوى التالي' : 'to next level'}</small>}
              </div>
            </div>
            {nextLevel && <div className="donor-profile-progress-bar"><span style={{ width: `${progressToNext}%` }} /></div>}
          </div>

          <div className="donor-profile-stats">
            <div><strong>{stats?.total_meals_shared ?? 0}</strong><span>{copy.mealsShared}</span></div>
            <div><strong>{stats?.total_people_helped ?? 0}</strong><span>{copy.peopleHelped}</span></div>
            <div><strong>{stats?.average_rating ? stats.average_rating.toFixed(1) : '—'}</strong><span>{copy.avgRating}</span></div>
            <div><strong>{completedHandovers}</strong><span>{copy.completed}</span></div>
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
        </>
      )}
    </div>
  );
}
