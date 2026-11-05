// Exact navigation metadata from Tanzil, not estimated page divisions.
// Source/license: https://tanzil.net/docs/quran_metadata (CC BY).
import { quranMetadata } from './quran-metadata.ts';
export type Surah = { number: number; name: string; englishName: string; englishNameTranslation: string;
  revelationType: 'Meccan' | 'Medinan'; ayahCount: number; startPage: number };
export type Juz = { number: number; name: string; startPage: number };
export type Hizb = { number: number; startPage: number };
export const TOTAL_PAGES = 604;
export const surahs: Surah[] = quranMetadata.surahs.map(row => ({ ...row }));
export const juzList: Juz[] = quranMetadata.juzList.map(row => ({ ...row }));
export const hizbList: Hizb[] = quranMetadata.hizbList.map(row => ({ ...row }));
export const pageStarts = quranMetadata.pageStarts;
export function getSurahByPage(page: number): Surah | null {
  return surahs[(pageStarts[page - 1]?.surah ?? 0) - 1] ?? null;
}
export function getJuzByPage(page: number): Juz | null {
  return [...juzList].reverse().find(row => page >= row.startPage) ?? null;
}
export function getHizbByPage(page: number): Hizb | null {
  return [...hizbList].reverse().find(row => page >= row.startPage) ?? null;
}
