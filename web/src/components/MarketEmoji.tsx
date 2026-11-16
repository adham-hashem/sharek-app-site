import {EMOJI_TINT,marketEmoji} from '@/lib/market-emoji';

// Shown instead of a photo when a donated item has none. Looks like a deliberate cover, not a
// missing-image placeholder, and keeps the same box as a real photo.
export function MarketEmoji({category,subtype,title,size='card',label}:{category:string;subtype?:string|null;title?:string|null;size?:'card'|'hero'|'chip'|'form';label?:string}){
  const [from,to]=EMOJI_TINT[category]??['#fff1e8','#ffe0cf'];
  return <span className={`market-emoji market-emoji-${size}`} style={{background:`linear-gradient(145deg,${from},${to})`}} role="img" aria-label={label??title??''}><span aria-hidden="true">{marketEmoji(category,subtype,title)}</span></span>;
}
