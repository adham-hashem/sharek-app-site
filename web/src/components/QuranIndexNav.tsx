import { useMemo, useState } from 'react';
import { ChevronLeft, Layers, ListOrdered, Search, FileText, X } from 'lucide-react';
import { surahs, juzList, hizbList, TOTAL_PAGES, type Surah, type Juz, type Hizb } from '@/lib/quran-data';
import { supabase, type Language } from '@/lib/supabase';

type Props = {
  language: Language;
  userId: string;
  onNavigate: (page: number) => void;
  onBack: () => void;
  onOpenBookmarks: () => void;
};

type Tab = 'surah' | 'juz' | 'hizb' | 'page';
type BookmarkRow = { id: string; page: number; label: string | null; created_at: string };

export function QuranIndexNav({ language, userId, onNavigate, onBack, onOpenBookmarks }: Props) {
  const isAr = language === 'ar';
  const [tab, setTab] = useState<Tab>('surah');
  const [query, setQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  const copy = {
    title: isAr ? 'فهرس القرآن' : 'Quran Index',
    surah: isAr ? 'السور' : 'Surahs',
    juz: isAr ? 'الأجزاء' : 'Juz',
    hizb: isAr ? 'الأحزاب' : 'Hizbs',
    page: isAr ? 'صفحة' : 'Page',
    search: isAr ? 'بحث...' : 'Search...',
    bookmarks: isAr ? 'الإشارات' : 'Bookmarks',
    noBookmarks: isAr ? 'لا توجد إشارات' : 'No bookmarks',
    ayahs: isAr ? 'آية' : 'ayahs',
    meccan: isAr ? 'مكية' : 'Meccan',
    medinan: isAr ? 'مدنية' : 'Medinan',
    goPage: isAr ? 'اذهب' : 'Go',
  };

  // Load bookmarks when bookmark panel opens
  const handleShowBookmarks = async () => {
    const { data } = await supabase.from('quran_bookmarks').select('id,page,label,created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (data) setBookmarks(data as BookmarkRow[]);
    setShowBookmarks(true);
  };

  const deleteBookmark = async (id: string) => {
    await supabase.from('quran_bookmarks').delete().eq('id', id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const filteredSurahs = useMemo(() => {
    if (!query.trim()) return surahs;
    const q = query.trim().toLowerCase();
    return surahs.filter((s) =>
      s.name.includes(q) ||
      s.englishName.toLowerCase().includes(q) ||
      s.englishNameTranslation.toLowerCase().includes(q) ||
      String(s.number).includes(q)
    );
  }, [query]);

  const filteredJuz = useMemo(() => {
    if (!query.trim()) return juzList;
    const q = query.trim();
    return juzList.filter((j) => j.name.includes(q) || String(j.number).includes(q));
  }, [query]);

  const tabs: { key: Tab; label: string; icon: typeof Layers }[] = [
    { key: 'surah', label: copy.surah, icon: ListOrdered },
    { key: 'juz', label: copy.juz, icon: Layers },
    { key: 'hizb', label: copy.hizb, icon: FileText },
    { key: 'page', label: copy.page, icon: FileText },
  ];

  return (
    <div className="quran-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="quran-header">
        <button className="icon-button" onClick={onBack} aria-label="Back"><ChevronLeft size={20} /></button>
        <h2>{copy.title}</h2>
        <button className="icon-button" onClick={handleShowBookmarks} aria-label={copy.bookmarks}><ListOrdered size={18} /></button>
      </header>

      <div className="quran-index-search">
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={copy.search} />
      </div>

      <div className="quran-index-tabs">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              <Icon size={15} /><span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="quran-index-list">
        {tab === 'surah' && filteredSurahs.map((s: Surah) => (
          <button key={s.number} className="quran-index-row" onClick={() => onNavigate(s.startPage)}>
            <span className="quran-index-num">{s.number}</span>
            <span className="quran-index-name">
              <b>{s.name}</b>
              <small>{s.englishName} · {s.revelationType === 'Meccan' ? copy.meccan : copy.medinan} · {s.ayahCount} {copy.ayahs}</small>
            </span>
            <span className="quran-index-page">{copy.page} {s.startPage}</span>
          </button>
        ))}

        {tab === 'juz' && filteredJuz.map((j: Juz) => (
          <button key={j.number} className="quran-index-row" onClick={() => onNavigate(j.startPage)}>
            <span className="quran-index-num">{j.number}</span>
            <span className="quran-index-name">
              <b>{copy.juz} {j.number}</b>
              <small>{j.name}</small>
            </span>
            <span className="quran-index-page">{copy.page} {j.startPage}</span>
          </button>
        ))}

        {tab === 'hizb' && hizbList.map((h: Hizb) => (
          <button key={h.number} className="quran-index-row" onClick={() => onNavigate(h.startPage)}>
            <span className="quran-index-num">{h.number}</span>
            <span className="quran-index-name">
              <b>{copy.hizb} {h.number}</b>
              <small>{isAr ? 'بداية الحزب' : 'Start of hizb'}</small>
            </span>
            <span className="quran-index-page">{copy.page} {h.startPage}</span>
          </button>
        ))}

        {tab === 'page' && (
          <div className="quran-page-grid">
            {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map((p) => (
              <button key={p} className="quran-page-grid-btn" onClick={() => onNavigate(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bookmarks modal */}
      {showBookmarks && (
        <div className="quran-goto-overlay" onClick={() => setShowBookmarks(false)}>
          <div className="quran-bookmarks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quran-goto-header">
              <h3>{copy.bookmarks}</h3>
              <button className="icon-button" onClick={() => setShowBookmarks(false)}><X size={18} /></button>
            </div>
            {bookmarks.length === 0 ? (
              <p className="quran-history-empty">{copy.noBookmarks}</p>
            ) : (
              <div className="quran-bookmarks-list">
                {bookmarks.map((bm) => (
                  <div key={bm.id} className="quran-bookmark-row">
                    <button className="quran-bookmark-info" onClick={() => { onNavigate(bm.page); setShowBookmarks(false); }}>
                      <span className="quran-bookmark-label">{bm.label || `${copy.page} ${bm.page}`}</span>
                      <span className="quran-bookmark-page">{copy.page} {bm.page}</span>
                    </button>
                    <button className="quran-bookmark-delete" onClick={() => deleteBookmark(bm.id)}><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
