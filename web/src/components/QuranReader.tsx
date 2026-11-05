import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Maximize2, Minimize2, Search, X, Layers, ListOrdered } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';
import { getSurahByPage, getJuzByPage, surahs, juzList, TOTAL_PAGES } from '@/lib/quran-data';
import { setLocalReadingPosition, recordPagesRead, getTodayProgress } from '@/lib/quran-cache';
import { loadQuranText } from '@/lib/quran-loader';
import { quranPage, type QuranVerse } from '@/lib/quran-text';
import { openLegalPage } from '@/lib/legal';

type Props = {
  language: Language;
  userId: string;
  initialPage: number;
  onBack: () => void;
  onOpenIndex: () => void;
};

type BookmarkRow = { id: string; page: number; label: string | null };

export function QuranReader({ language, userId, initialPage, onBack, onOpenIndex }: Props) {
  const isAr = language === 'ar';
  const [page, setPage] = useState(Math.max(1, Math.min(604, initialPage)));
  const [verses, setVerses] = useState<QuranVerse[]>([]);
  const [loadError, setLoadError] = useState(false), [retry, setRetry] = useState(0);
  const [loadedPage, setLoadedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [showGoTo, setShowGoTo] = useState(false);
  const [goToValue, setGoToValue] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showGoalCelebration, setShowGoalCelebration] = useState(false);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [animDirection, setAnimDirection] = useState<'none' | 'left' | 'right'>('none');
  const touchStartY = useRef<number | null>(null);
  const prevPageRef = useRef(page);
  const pageAreaRef = useRef<HTMLDivElement>(null);

  const copy = {
    page: isAr ? 'صفحة' : 'Page',
    of: isAr ? 'من' : 'of',
    goTo: isAr ? 'اذهب إلى صفحة' : 'Go to page',
    bookmark: isAr ? 'إشارة مرجعية' : 'Bookmark',
    bookmarkAdded: isAr ? 'تمت الإضافة' : 'Bookmarked',
    bookmarkRemoved: isAr ? 'تمت الإزالة' : 'Removed',
    index: isAr ? 'الفهرس' : 'Index',
    juz: isAr ? 'الجزء' : 'Juz',
    surah: isAr ? 'السورة' : 'Surah',
    invalidPage: isAr ? 'رقم صفحة غير صحيح' : 'Invalid page number',
    goalMet: isAr ? 'أحسنت، أتممت وردك اليومي 🌿' : 'Well done! Daily goal completed 🌿',
  };

  // Load bookmarks
  useEffect(() => {
    void loadBookmarks();
  }, [userId]);

  const loadBookmarks = async () => {
    const { data } = await supabase.from('quran_bookmarks').select('id,page,label').eq('user_id', userId);
    if (data) setBookmarks(data as BookmarkRow[]);
  };

  // Check if current page is bookmarked
  useEffect(() => {
    setIsBookmarked(bookmarks.some((b) => b.page === page));
  }, [bookmarks, page]);

  // Read the bundled, unmodified Arabic text using exact Tanzil page boundaries.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(false);
    void loadQuranText().then(text => {
      if (!cancelled) {
        setVerses(quranPage(text, page));
        setLoadedPage(page);
        setLoading(false);
        pageAreaRef.current?.scrollTo(0, 0);
      }
    }).catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [page, retry]);

  // Save reading position
  const savePosition = useCallback(async (newPage: number) => {
    setLocalReadingPosition(newPage);
    await supabase.from('quran_reading_position').upsert({
      user_id: userId,
      page: newPage,
      updated_at: new Date().toISOString(),
    });
  }, [userId]);

  // Record pages read and check goal
  const recordReading = useCallback((prevPage: number, newPage: number) => {
    const pagesRead = Math.abs(newPage - prevPage);
    if (pagesRead !== 1) return; // Jumping through the index is not reading all skipped pages.
    const before = getTodayProgress();
    const after = recordPagesRead(pagesRead);
    if (!before.goalMet && after.goalMet) {
      setShowGoalCelebration(true);
      window.setTimeout(() => setShowGoalCelebration(false), 4000);
    }
    // Update server log
    const today = new Date().toISOString().slice(0, 10);
    void supabase.from('quran_reading_log').upsert({
      user_id: userId,
      log_date: today,
      pages_read: after.pagesRead,
      goal_met: after.goalMet,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,log_date' });
  }, [userId]);

  // Save position when page changes
  useEffect(() => {
    if (loadedPage !== page || loading || loadError) return;
    void savePosition(page);
    if (prevPageRef.current !== page) {
      recordReading(prevPageRef.current, page);
      prevPageRef.current = page;
    }
  }, [page, loadedPage, loading, loadError, savePosition, recordReading]);

  const goToPage = (target: number) => {
    const clamped = Math.max(1, Math.min(TOTAL_PAGES, target));
    if (clamped === page) return;
    setAnimDirection(clamped > page ? 'left' : 'right');
    setSwipeOffset(0);
    setPage(clamped);
    window.setTimeout(() => setAnimDirection('none'), 300);
  };

  const nextPage = () => {
    if (page >= TOTAL_PAGES) return;
    setAnimDirection('left');
    setSwipeOffset(0);
    setPage((p) => p + 1);
    window.setTimeout(() => setAnimDirection('none'), 300);
  };

  const prevPage = () => {
    if (page <= 1) return;
    setAnimDirection('right');
    setSwipeOffset(0);
    setPage((p) => p - 1);
    window.setTimeout(() => setAnimDirection('none'), 300);
  };

  const toggleBookmark = async () => {
    if (isBookmarked) {
      const bm = bookmarks.find((b) => b.page === page);
      if (bm) {
        await supabase.from('quran_bookmarks').delete().eq('id', bm.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== bm.id));
      }
    } else {
      const surah = getSurahByPage(page);
      const label = surah ? surah.name : `Page ${page}`;
      const { data } = await supabase.from('quran_bookmarks').insert({
        user_id: userId,
        page,
        label,
      }).select('id,page,label').maybeSingle();
      if (data) setBookmarks((prev) => [...prev, data as BookmarkRow]);
    }
  };

  const handleGoToSubmit = () => {
    const num = parseInt(goToValue, 10);
    if (isNaN(num) || num < 1 || num > TOTAL_PAGES) return;
    goToPage(num);
    setShowGoTo(false);
    setGoToValue('');
  };

  // Swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || zoomed) return;
    setSwipeStartX(e.touches[0].clientX);
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (swipeStartX == null) return;
    if (e.touches.length !== 1 || (touchStartY.current != null && Math.abs(e.touches[0].clientY - touchStartY.current) >= 50)) {
      setSwipeOffset(0); setSwipeStartX(null); return;
    }
    const diff = e.touches[0].clientX - swipeStartX;
    // Only horizontal swipe, not vertical scroll
    if (touchStartY.current != null && Math.abs(e.touches[0].clientY - touchStartY.current) < 50) {
      setSwipeOffset(diff);
    }
  };

  const onTouchEnd = () => {
    if (Math.abs(swipeOffset) > 80) {
      if (swipeOffset < 0) nextPage();
      else prevPage();
    }
    setSwipeOffset(0);
    setSwipeStartX(null);
    touchStartY.current = null;
  };

  const surah = getSurahByPage(page);
  const juz = getJuzByPage(page);
  const sections: { surah: number; verses: QuranVerse[] }[] = [];
  for (const verse of verses) {
    if (sections[sections.length - 1]?.surah !== verse.surah) sections.push({ surah: verse.surah, verses: [] });
    sections[sections.length - 1].verses.push(verse);
  }
  const arabicNumber = (value: number) => value.toLocaleString('ar-EG', { useGrouping: false });

  const transform = `translateX(${swipeOffset}px)${animDirection === 'left' ? ' translateX(-20px)' : animDirection === 'right' ? ' translateX(20px)' : ''}`;
  const transition = swipeOffset === 0 ? 'transform 0.3s ease' : 'none';

  return (
    <div className={`quran-reader ${zoomed ? 'zoomed' : ''} ${controlsVisible ? '' : 'controls-hidden'}`} dir={isAr ? 'rtl' : 'ltr'}>
      {/* Top bar */}
      <div className="quran-reader-top">
        <button className="icon-button" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ChevronLeft size={20} /></button>
        <div className="quran-reader-info">
          {surah && <span className="quran-reader-surah">{surah.name}</span>}
          {juz && <span className="quran-reader-juz"><Layers size={12} />{copy.juz} {juz.number}</span>}
        </div>
        <div className="quran-reader-actions">
          <button className="icon-button" onClick={() => setShowGoTo(true)} aria-label={copy.goTo}><Search size={18} /></button>
          <button className="icon-button" onClick={toggleBookmark} aria-label={copy.bookmark}>
            {isBookmarked ? <BookmarkCheck size={18} className="quran-bookmark-active" /> : <Bookmark size={18} />}
          </button>
          <button className="icon-button" onClick={() => setZoomed(!zoomed)} aria-label={isAr ? 'تكبير الخط' : 'Larger text'} aria-pressed={zoomed}>
            {zoomed ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      {/* Page area */}
      <div ref={pageAreaRef} className="quran-reader-page-area" onClick={event => { if (event.target === event.currentTarget) setControlsVisible(!controlsVisible); }}>
        {loading ? (
          <div className="quran-reader-loading">
            <div className="loader-dot" />
            <span>SHARek</span>
          </div>
        ) : !loadError ? (
          <article
            lang="ar" dir="rtl" aria-label={`القرآن الكريم — صفحة ${page}`}
            className="quran-text-content"
            style={{ transform, transition }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {sections.map(section => <section key={section.surah}>
              {section.verses[0].ayah === 1 && <h3 className="quran-surah-heading">سورة {surahs[section.surah - 1].name}</h3>}
              <p className="quran-verses">{section.verses.map(verse => <span key={`${verse.surah}:${verse.ayah}`} data-verse={`${verse.surah}:${verse.ayah}`}><span className="quran-verse-text">{verse.text}</span><span className="quran-ayah-number" aria-label={`الآية ${verse.ayah}`}> ﴿{arabicNumber(verse.ayah)}﴾ </span></span>)}</p>
            </section>)}
            <footer className="quran-text-source"><span>النص العثماني — مشروع تنزيل</span><button onClick={() => void openLegalPage('https://tanzil.net')}>Tanzil.net · CC BY 3.0</button></footer>
          </article>
        ) : (
          <div className="quran-reader-error">
            <span>{isAr ? 'تعذر تحميل الصفحة' : 'Could not load page'}</span>
            <button className="quran-cache-btn" onClick={() => setRetry(value => value + 1)}>{isAr ? 'إعادة المحاولة' : 'Retry'}</button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="quran-reader-bottom">
        <button className="quran-nav-btn" onClick={prevPage} disabled={page <= 1} aria-label={isAr ? 'الصفحة السابقة' : 'Previous page'}>
          {isAr ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
        <span className="quran-page-indicator">{copy.page} {page} {copy.of} {TOTAL_PAGES}</span>
        <button className="quran-nav-btn" onClick={nextPage} disabled={page >= TOTAL_PAGES} aria-label={isAr ? 'الصفحة التالية' : 'Next page'}>
          {isAr ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {/* Go to page modal */}
      {showGoTo && (
        <div className="quran-goto-overlay" onClick={() => setShowGoTo(false)}>
          <div className="quran-goto-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quran-goto-header">
              <h3>{copy.goTo}</h3>
              <button className="icon-button" onClick={() => setShowGoTo(false)}><X size={18} /></button>
            </div>
            <input
              type="number"
              min={1}
              max={TOTAL_PAGES}
              value={goToValue}
              onChange={(e) => setGoToValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGoToSubmit()}
              placeholder={`1 - ${TOTAL_PAGES}`}
              autoFocus
              className="quran-goto-input"
            />
            <button className="primary-button quran-goto-submit" onClick={handleGoToSubmit}>{copy.goTo}</button>
            {/* Quick surah links */}
            <div className="quran-goto-quick">
              <button className="quran-goto-section-btn" onClick={onOpenIndex}><ListOrdered size={15} />{copy.index}</button>
            </div>
            {/* Surah quick jump */}
            <div className="quran-goto-surah-list">
              {surahs.slice(0, 12).map((s) => (
                <button key={s.number} className="quran-goto-surah-btn" onClick={() => { goToPage(s.startPage); setShowGoTo(false); }}>
                  <span className="quran-goto-surah-num">{s.number}</span>
                  <span className="quran-goto-surah-name">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Goal celebration */}
      {showGoalCelebration && (
        <div className="quran-goal-celebration">
          <span>{copy.goalMet}</span>
        </div>
      )}
    </div>
  );
}
