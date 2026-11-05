// Tanzil Quran Text (Uthmani 1.1), Copyright (C) 2007-2026 Tanzil Project.
// CC BY 3.0, verbatim text only. Full notice travels in the original text asset
// and public/licenses/tanzil-quran.txt. Source: https://tanzil.net
import { pageStarts, surahs, TOTAL_PAGES } from './quran-data.ts';
export type QuranVerse = { surah: number; ayah: number; text: string };
export function parseQuranText(source: string): QuranVerse[] {
  const verses: QuranVerse[] = [];
  let surah = 1, ayah = 1;
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const match = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (!match || Number(match[1]) !== surah || Number(match[2]) !== ayah) throw new Error('Invalid Quran sequence');
    // Preserve every source code point, including diacritics and the supplied basmala.
    verses.push({ surah, ayah, text: match[3] });
    if (ayah === surahs[surah - 1].ayahCount) { surah++; ayah = 1; } else ayah++;
  }
  if (verses.length !== 6236 || surah !== 115 || ayah !== 1) throw new Error('Incomplete Quran text');
  return verses;
}
export function quranPage(verses: QuranVerse[], page: number): QuranVerse[] {
  if (!Number.isInteger(page) || page < 1 || page > TOTAL_PAGES) throw new Error('Invalid Quran page');
  return verses.slice(pageStarts[page - 1].offset, pageStarts[page]?.offset ?? verses.length);
}
