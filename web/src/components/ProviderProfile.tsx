import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Award, BadgeCheck, Flag, Heart, MapPin, MessageCircle, MoreVertical, Shield, Star, Utensils } from 'lucide-react';
import { supabase, formatDistance, haversineDistance, type CommunityMeal, type Language } from '@/lib/supabase';
import { ChatWindow } from './ChatWindow';
import { ReportUserSheet } from './ReportUserSheet';
import { BlockUserModal } from './BlockUserModal';
import {notifyChatBlocksChanged,useChatBlockState} from '@/lib/chat-blocks';

type Props = {
  language: Language;
  donorId: string;
  currentUserId: string;
  userLat: number | null;
  userLng: number | null;
  communityMeals: CommunityMeal[];
  onBack: () => void;
};

type DonorStats = {
  total_meals_shared: number;
  total_people_helped: number;
  average_rating: number;
  badges: string[];
};

const badgeLabels: Record<string, { ar: string; en: string; icon: string }> = {
  first_share: { ar: 'بداية الخير', en: 'First Help', icon: 'heart' },
  generous: { ar: 'مساعد الطعام', en: 'Food Helper', icon: 'award' },
  helper: { ar: 'صانع أثر', en: 'Impact Maker', icon: 'badge' },
  hand_helper: { ar: 'يد العون', en: 'Helping Hand', icon: 'badge' },
  sustained: { ar: 'أثر مستمر', en: 'Sustained', icon: 'star' },
  top_rated: { ar: 'تقييم ممتاز', en: 'Top Rated', icon: 'star' },
};

function BadgeChip({ badge, language }: { badge: string; language: Language }) {
  const info = badgeLabels[badge];
  if (!info) return null;
  const isAr = language === 'ar';
  const Icon = info.icon === 'star' ? Star : info.icon === 'award' ? Award : info.icon === 'badge' ? BadgeCheck : Heart;
  return <span className="community-badge"><Icon size={13} />{isAr ? info.ar : info.en}</span>;
}

export function ProviderProfile({ language, donorId, currentUserId, userLat, userLng, communityMeals, onBack }: Props) {
  const isAr = language === 'ar';
  const {blockState,blockLoading,refreshBlockState}=useChatBlockState(donorId);
  const chatBlocked=blockLoading||!blockState||blockState.blocked_by_me||blockState.blocked_by_other;
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; is_verified: boolean } | null>(null);
  const [stats, setStats] = useState<DonorStats | null>(null);
  const meals = communityMeals.filter(meal => meal.donor_id === donorId);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unblocking,setUnblocking]=useState(false),[blockError,setBlockError]=useState('');
  const unblock=async()=>{
    if(unblocking||!blockState?.blocked_by_me)return;
    setUnblocking(true);setBlockError('');
    const {error}=await supabase.rpc('unblock_user',{p_blocked_user_id:donorId});
    setUnblocking(false);
    if(error){setBlockError(isAr?'تعذر إلغاء الحظر. حاول مجددًا.':'Could not unblock this user. Please retry.');return;}
    notifyChatBlocksChanged();
    await refreshBlockState();
  };

  const fetchData = useCallback(async () => {
    const [profileRes, statsRes] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar_url, is_verified').eq('id', donorId).maybeSingle(),
      supabase.rpc('get_donor_stats', { p_donor_id: donorId }),
    ]);
    if (profileRes.data) setProfile(profileRes.data as typeof profile);
    if (statsRes.data) {
      const data = statsRes.data as DonorStats[] | DonorStats;
      setStats(Array.isArray(data) ? data[0] : data);
    }
  }, [donorId]);

  useEffect(() => { setLoading(true); void fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const pickupDistances=userLat!=null&&userLng!=null?meals.filter(m=>m.latitude!=null&&m.longitude!=null).map(m=>haversineDistance(userLat,userLng,m.latitude!,m.longitude!)).filter(Number.isFinite):[];
  const distance=pickupDistances.length?Math.min(...pickupDistances):null;

  const copy = {
    back: isAr ? 'رجوع' : 'Back',
    sendMessage: isAr ? 'إرسال رسالة' : 'Send Message',
    mealsShared: isAr ? 'وجبات مشاركة' : 'Meals Shared',
    peopleHelped: isAr ? 'أشخاص سُاعدوا' : 'People Helped',
    rating: isAr ? 'التقييم' : 'Rating',
    distance: isAr ? 'أقرب نقطة استلام' : 'Nearest pickup point',
    badges: isAr ? 'الإنجازات' : 'Achievements',
    availableMeals: isAr ? 'وجبات متاحة' : 'Available Meals',
    noMeals: isAr ? 'لا توجد وجبات متاحة حاليًا' : 'No meals available right now',
    unknown: isAr ? 'مساعد' : 'Helper',
  };

  if (showChat) {
    return <ChatWindow language={language} threadId={null} partnerId={donorId} partnerName={profile?.display_name ?? copy.unknown} partnerAvatar={profile?.avatar_url ?? null} currentUserId={currentUserId} requestId={null} requestStatus={null} userLat={userLat} userLng={userLng} onBack={() => setShowChat(false)} />;
  }

  return (
    <div className="provider-profile-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="provider-profile-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <span>{isAr ? 'ملف المساعد' : 'Provider Profile'}</span>
        {currentUserId !== donorId && (
          <div style={{ position: 'relative' }}>
            <button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"><MoreVertical size={20} /></button>
            {menuOpen && (
              <>
                <div className="chat-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="chat-menu" style={{ [isAr ? 'left' : 'right']: 0 } as React.CSSProperties}>
                  <button onClick={() => { setMenuOpen(false); setShowReport(true); }}><Flag size={16} /> {isAr ? 'الإبلاغ عن المستخدم' : 'Report user'}</button>
                  {blockState?.blocked_by_me?<button disabled={unblocking} onClick={() => {setMenuOpen(false);void unblock();}}><Shield size={16}/>{isAr?'إلغاء الحظر':'Unblock User'}</button>:<button onClick={() => { setMenuOpen(false); setShowBlock(true); }}><Shield size={16} /> {isAr ? 'حظر المستخدم' : 'Block User'}</button>}
                </div>
              </>
            )}
          </div>
        )}
      </header>
      {loading ? (
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      ) : (
        <>
          <div className="provider-profile-hero">
            <div className="provider-profile-avatar-wrap">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="provider-profile-avatar" /> : <span className="provider-profile-avatar placeholder"><Heart size={32} fill="currentColor" /></span>}
              {profile?.is_verified && <BadgeCheck size={22} className="provider-profile-verified" />}
            </div>
            <h2>{profile?.display_name ?? copy.unknown}</h2>
            {distance != null && <span className="provider-profile-distance"><MapPin size={15} />{formatDistance(distance, language)}</span>}
            {stats && stats.average_rating > 0 && <span className="provider-profile-rating"><Star size={16} fill="currentColor" />{stats.average_rating.toFixed(1)}</span>}
          </div>

          {blockError&&<p className="feedback error" role="alert">{blockError}</p>}
          {chatBlocked&&!blockLoading&&<p className="chat-archived-notice" role="status">{blockState?.blocked_by_me?(isAr?'لقد حظرت هذا المستخدم. ألغِ الحظر للمراسلة.':'You blocked this user. Unblock them to message again.'):(isAr?'المراسلة غير متاحة حاليًا.':'Messaging is currently unavailable.')}</p>}

          <div className="provider-profile-stats">
            <div><strong>{stats?.total_meals_shared ?? 0}</strong><span>{isAr ? 'وجبات تمت مساعدتها' : 'Meals Helped'}</span></div>
            <div><strong>{stats?.total_people_helped ?? 0}</strong><span>{copy.peopleHelped}</span></div>
            <div><strong>{stats?.average_rating ? stats.average_rating.toFixed(1) : '—'}</strong><span>{copy.rating}</span></div>
          </div>

          {stats && stats.badges.length > 0 && (
            <div className="provider-profile-badges-section">
              <h3>{copy.badges}</h3>
              <div className="provider-profile-badges">{stats.badges.map((b) => <BadgeChip key={b} badge={b} language={language} />)}</div>
            </div>
          )}

          {currentUserId !== donorId && !chatBlocked && (
            <button className="primary-button provider-profile-chat-btn" onClick={() => setShowChat(true)}>
              <MessageCircle size={18} />{copy.sendMessage}
            </button>
          )}

          <div className="provider-profile-meals-section">
            <h3>{copy.availableMeals}</h3>
            {meals.length === 0 ? (
              <div className="community-empty"><span className="community-empty-icon"><Utensils size={22} /></span><p>{copy.noMeals}</p></div>
            ) : (
              <div className="provider-meal-list">
                {meals.map((meal) => (
                  <div key={meal.id} className="provider-meal-item">
                    <div className="provider-meal-thumb">{meal.photo_url ? <img src={meal.photo_url} alt="" /> : <span className="community-meal-image-placeholder small"><Utensils size={18} /></span>}</div>
                    <div className="provider-meal-info"><strong>{meal.name}</strong><span>{meal.quantity} {isAr ? 'وجبات' : 'meals'}</span></div>
                    <span className="provider-meal-distance"><MapPin size={13} />{meal.distance_km != null ? formatDistance(meal.distance_km, language) : userLat == null || userLng == null ? (isAr ? 'فعّل الموقع لعرض المسافة' : 'Enable location to see distance') : (isAr ? 'المسافة غير متاحة' : 'Distance unavailable')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showReport && (
        <ReportUserSheet
          language={language}
          reporterId={currentUserId}
          reportedUserId={donorId}
          reportedUserName={profile?.display_name}
          onClose={() => setShowReport(false)}
          onBlockOption={() => setShowBlock(true)}
        />
      )}
      {showBlock && (
        <BlockUserModal
          language={language}
          blockedUserId={donorId}
          blockedUserName={profile?.display_name}
          onClose={() => setShowBlock(false)}
        />
      )}
    </div>
  );
}
