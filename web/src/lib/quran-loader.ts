import textUrl from '../../assets/quran/quran-uthmani.txt?url';
import { parseQuranText, type QuranVerse } from './quran-text';
let text: Promise<QuranVerse[]> | null = null;
export function loadQuranText(): Promise<QuranVerse[]> {
  if (!text) text = fetch(textUrl).then(response => {
    if (!response.ok) throw new Error('Quran asset unavailable');
    return response.text();
  }).then(parseQuranText).catch(error => { text = null; throw error; });
  return text;
}
