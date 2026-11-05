import { useEffect, useState } from 'react';
import { Bookmark, BookOpen, ChevronLeft, Clock, Download, Globe, Layers, ListOrdered, Sparkles } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';
import { getSurahByPage, getJuzByPage, juzList, surahs, TOTAL_PAGES } from '@/lib/quran-data';
import { getLocalReadingPosition, getTodayProgress, getReadingHistory, DAILY_GOAL_PAGES, type DailyProgress } from '@/lib/quran-cache';
import { openLegalPage } from '@/lib/legal';

type Props = {
  language: Language;
  userId: string;
  onContinue: (page: number) => void;
  onOpenReader: (page: number) => void;
  onOpenBookmarks: () => void;
  onOpenIndex: () => void;
  onBack: () => void;
};

type ReadingPosition = { page: number; updated_at: string } | null;
type BookmarkRow = { id: string; page: number; label: string | null; created_at: string };

export function QuranDashboard({ language, userId, onContinue, onOpenReader, onOpenBookmarks, onOpenIndex, onBack }: Props) {
  const isAr = language === 'ar';
  const [position, setPosition] = useState<ReadingPosition>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [todayProgress, setTodayProgress] = useState<DailyProgress | null>(null);
  const [history, setHistory] = useState<DailyProgress[]>([]);

  useEffect(() => {
    void loadPosition();
    void loadBookmarks();
    setTodayProgress(getTodayProgress());
    setHistory(getReadingHistory(14));
    void loadReadingLog();
  }, [userId]);

  const loadPosition = async () => {
    const { data } = await supabase.from('quran_reading_position').select('page,updated_at').eq('user_id', userId).maybeSingle();
    if (data) {
      setPosition(data as ReadingPosition);
    } else {
      const local = getLocalReadingPosition();
      if (local) setPosition({ page: local.page, updated_at: local.updatedAt });
    }
  };

  const loadBookmarks = async () => {
    const { data } = await supabase.from('quran_bookmarks').select('id,page,label,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
    if (data) setBookmarks(data as BookmarkRow[]);
  };

  const loadReadingLog = async () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const { data } = await supabase.from('quran_reading_log').select('log_date,pages_read,goal_met').eq('user_id', userId).gte('log_date', twoWeeksAgo.toISOString().slice(0, 10)).order('log_date', { ascending: false });
    if (data && data.length > 0) setHistory(data.map(row => ({ date: row.log_date, pagesRead: row.pages_read, goalMet: row.goal_met })));
  };

  const currentPage = position?.page ?? 1;
  const surah = getSurahByPage(currentPage);
  const juz = getJuzByPage(currentPage);
  const isNew = !position;
  const progressPct = Math.round((currentPage / TOTAL_PAGES) * 100);
  const goalPct = Math.min(100, Math.round((todayProgress?.pagesRead ?? 0) / DAILY_GOAL_PAGES * 100));

  const copy = {
    title: isAr ? 'وردك اليومي' : 'Your Daily Reading',
    subtitle: isAr ? 'قراءتك اليومية من القرآن الكريم' : 'Your daily Quran reading',
    currentPage: isAr ? 'الصفحة الحالية' : 'Current page',
    juz: isAr ? 'الجزء' : 'Juz',
    surah: isAr ? 'السورة' : 'Surah',
    progress: isAr ? 'تقدم القراءة' : 'Reading progress',
    lastRead: isAr ? 'آخر قراءة' : 'Last reading',
    continue: isAr ? 'متابعة وردي' : 'Continue reading',
    start: isAr ? 'ابدأ وردك اليومي' : 'Start daily reading',
    todayProgress: isAr ? 'تقدم اليوم' : "Today's progress",
    pagesRead: isAr ? 'صفحات مقروءة' : 'pages read',
    goal: isAr ? `الهدف: ${DAILY_GOAL_PAGES} صفحات` : `Goal: ${DAILY_GOAL_PAGES} pages`,
    goalMet: isAr ? 'أحسنت، أتممت وردك اليومي 🌿' : 'Well done, you completed your daily reading 🌿',
    keepGoing: isAr ? 'واصل القراءة' : 'Keep reading',
    bookmarks: isAr ? 'الإشارات المرجعية' : 'Bookmarks',
    index: isAr ? 'فهرس القرآن' : 'Quran Index',
    history: isAr ? 'سجل القراءة' : 'Reading history',
    noHistory: isAr ? 'لا يوجد سجل بعد' : 'No history yet',
    offline: isAr ? 'القرآن الكريم بدون إنترنت' : 'Read the Arabic Quran offline',
    cached: isAr ? 'محفوظ' : 'cached',
    pages: isAr ? 'صفحة' : 'pages',
    downloading: isAr ? 'جاري التحميل...' : 'Downloading...',
    yesterday: isAr ? 'أمس' : 'Yesterday',
    today: isAr ? 'اليوم' : 'Today',
    noBookmarks: isAr ? 'لا توجد إشارات مرجعية' : 'No bookmarks yet',
    page: isAr ? 'صفحة' : 'Page',
  };

  const formatTime = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return isAr ? 'الآن' : 'Just now';
    if (diffH < 24) return isAr ? `قبل ${diffH} ساعة` : `${diffH}h ago`;
    if (diffD < 7) return isAr ? `قبل ${diffD} يوم` : `${diffD}d ago`;
    return d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="quran-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="quran-header">
        <button className="icon-button" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ChevronLeft size={20} /></button>
        <h2>{copy.title}</h2>
        <button className="icon-button" onClick={onOpenIndex} aria-label={copy.index}><ListOrdered size={18} /></button>
      </header>

      <div className="quran-dashboard-body">
        {/* Hero card */}
        <div className="quran-hero-card">
          <div className="quran-hero-top">
            <div className="quran-hero-icon"><BookOpen size={28} /></div>
            <div className="quran-hero-info">
              <h3>{copy.title}</h3>
              <p>{surah ? `${surah.name} · ${copy.surah} ${surah.number}` : copy.subtitle}</p>
            </div>
          </div>
          <div className="quran-hero-page">
            <span className="quran-page-number">{currentPage}</span>
            <span className="quran-page-label">{copy.page}</span>
          </div>
          {juz && <div className="quran-hero-juz"><Layers size={14} />{copy.juz} {juz.number} — {juz.name}</div>}
          <div className="quran-hero-progress">
            <div className="quran-progress-bar"><span style={{ width: `${progressPct}%` }} /></div>
            <span>{progressPct}% · {currentPage}/{TOTAL_PAGES}</span>
          </div>
          {position && (
            <div className="quran-hero-last"><Clock size={13} />{copy.lastRead}: {formatTime(position.updated_at)}</div>
          )}
          <button className="quran-continue-btn" onClick={() => onContinue(currentPage)}>
            <BookOpen size={18} />{isNew ? copy.start : copy.continue}
          </button>
        </div>

        {/* Daily progress */}
        <div className="quran-section">
          <h4 className="quran-section-title"><Sparkles size={15} />{copy.todayProgress}</h4>
          <div className="quran-daily-card">
            <div className="quran-daily-ring">
              <svg viewBox="0 0 80 80" className="quran-ring-svg">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#e8f5e9" strokeWidth="6" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#2e7d32" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${(goalPct / 100) * 213.6} 213.6`}
                  transform="rotate(-90 40 40)" />
              </svg>
              <span className="quran-ring-center">{todayProgress?.pagesRead ?? 0}<small>{copy.pagesRead}</small></span>
            </div>
            <div className="quran-daily-info">
              <p className="quran-daily-goal">{copy.goal}</p>
              {todayProgress?.goalMet ? (
                <p className="quran-daily-met">{copy.goalMet}</p>
              ) : (
                <p className="quran-daily-encourage">{copy.keepGoing}</p>
              )}
            </div>
          </div>
        </div>

        {/* Offline cache */}
        <div className="quran-section">
          <h4 className="quran-section-title"><Download size={15} />{copy.offline}</h4>
          <div className="quran-cache-card">
                <div className="quran-cache-info">
                  <BookOpen size={20} />
                  <span>{isAr ? 'النص العربي الكامل محفوظ داخل التطبيق — ١١٤ سورة' : 'All 114 surahs in Arabic are included in the app.'}</span>
                </div>
          </div>
          <div className="quran-text-source"><span>{isAr ? 'المصدر: مشروع تنزيل — النص العثماني' : 'Source: Tanzil Project — Uthmani Arabic text'}</span><button onClick={() => void openLegalPage('https://tanzil.net')}>Tanzil.net · CC BY 3.0</button></div>
        </div>

        {/* Quick actions */}
        <div className="quran-quick-actions">
          <button className="quran-quick-btn" onClick={onOpenIndex}>
            <ListOrdered size={20} /><span>{copy.index}</span>
          </button>
          <button className="quran-quick-btn" onClick={onOpenBookmarks}>
            <Bookmark size={20} /><span>{copy.bookmarks}</span>
          </button>
        </div>

        {/* Reading history */}
        <div className="quran-section">
          <h4 className="quran-section-title"><Clock size={15} />{copy.history}</h4>
          <div className="quran-history-list">
            {history.length === 0 ? (
              <p className="quran-history-empty">{copy.noHistory}</p>
            ) : (
              history.slice(0, 7).map((entry) => {
                const today = new Date().toISOString().slice(0, 10);
                const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                let label: string;
                if (entry.date === today) label = copy.today;
                else if (entry.date === yesterday) label = copy.yesterday;
                else label = new Date(entry.date).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { weekday: 'short', day: 'numeric' });
                return (
                  <div key={entry.date} className="quran-history-row">
                    <span className="quran-history-day">{label}</span>
                    <span className="quran-history-pages">{entry.pagesRead} {copy.pages}</span>
                    {entry.goalMet && <span className="quran-history-met">✓</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
