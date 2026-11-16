import {useEffect,useState} from 'react';
import {supabase,type ChatMessage,type Language} from '@/lib/supabase';
import {marketPhoto,marketLabel,marketStatusLabel,type MarketStatus} from './GoodnessMarket';
import {MarketEmoji} from './MarketEmoji';
// The card stays in the conversation for the life of the thread and follows the
// listing's current state instead of disappearing when it is no longer offered.
export function MarketChatCard({card,language}:{card:NonNullable<ChatMessage['marketplace_card']>;language:Language}){
 const ar=language==='ar',[status,setStatus]=useState<MarketStatus|null>(null),[subtype,setSubtype]=useState<string|null>(null);
 useEffect(()=>{let active=true;const refresh=()=>void supabase.from('marketplace_listings').select('status,expires_at,subtype').eq('id',card.id).maybeSingle().then(({data,error})=>{if(!active||error)return;if(!data){setStatus('deleted');return;}setSubtype((data as {subtype?:string}).subtype??null);const ended=data.status==='available'&&data.expires_at&&Date.parse(data.expires_at)<=Date.now();setStatus(ended?'expired':data.status as MarketStatus);});refresh();const channel=supabase.channel(`market-card-${card.id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'marketplace_listings',filter:`id=eq.${card.id}`},refresh).subscribe();return()=>{active=false;void supabase.removeChannel(channel);};},[card.id]);
 const tone=status==='paused'||status==='unavailable'?'paused':status??'';
 return <button className="market-chat-card" onClick={()=>window.dispatchEvent(new CustomEvent('sharek-open-marketplace',{detail:card.id}))}>{card.photo?<img src={marketPhoto(card.photo)} alt=""/>:<MarketEmoji category={card.category} subtype={subtype} title={card.title} size="chip"/>}<span className="market-chat-card-text"><strong>{card.title}</strong><small>{marketLabel(card.category,ar)}</small>{status&&<em className={`market-status ${tone}`}>{status==='deleted'?(ar?'لم يعد متاحًا':'No longer available'):marketStatusLabel(status,ar)}</em>}</span></button>;
}
