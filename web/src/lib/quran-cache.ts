// Reading progress for the bundled Arabic Quran. No remote page-image downloads.
// Local storage fallback for reading position (instant offline access)
const POSITION_KEY = 'quran-reading-position';
const PROGRESS_KEY_PREFIX = 'quran-daily-progress-';

export type ReadingPosition = {
  page: number;
  updatedAt: string;
};

export function getLocalReadingPosition(): ReadingPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReadingPosition;
  } catch {
    return null;
  }
}

export function setLocalReadingPosition(page: number): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ page, updatedAt: new Date().toISOString() }));
  } catch {
    // localStorage not available
  }
}

export type DailyProgress = {
  date: string;
  pagesRead: number;
  goalMet: boolean;
};

export function getTodayProgress(): DailyProgress {
  const today = new Date().toISOString().slice(0, 10);
  const key = PROGRESS_KEY_PREFIX + today;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as DailyProgress;
  } catch {
    // pass
  }
  return { date: today, pagesRead: 0, goalMet: false };
}

export function recordPagesRead(pages: number): DailyProgress {
  const today = getTodayProgress();
  today.pagesRead += pages;
  if (today.pagesRead >= DAILY_GOAL_PAGES) today.goalMet = true;
  const key = PROGRESS_KEY_PREFIX + today.date;
  try {
    localStorage.setItem(key, JSON.stringify(today));
  } catch {
    // pass
  }
  return today;
}

export function getReadingHistory(days: number = 30): DailyProgress[] {
  const result: DailyProgress[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const key = PROGRESS_KEY_PREFIX + dateStr;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        result.push(JSON.parse(raw) as DailyProgress);
      } else {
        result.push({ date: dateStr, pagesRead: 0, goalMet: false });
      }
    } catch {
      result.push({ date: dateStr, pagesRead: 0, goalMet: false });
    }
  }
  return result;
}

export const DAILY_GOAL_PAGES = 3;
