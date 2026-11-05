import { mealDeadline, sharingLabel, collectionLabel } from '@/lib/meal-sharing';
import { useEffect, useRef, useState } from 'react';
import { Heart, MapPin, Star, Utensils, BadgeCheck, Award, Clock, ChevronRight, PackageOpen } from 'lucide-react';
import { formatDistance, type CommunityMeal, type Language } from '@/lib/supabase';
import { ProviderProfile } from './ProviderProfile';
import { MealDetail } from './MealDetail';
import { locationMessage } from '@/lib/geo';
import type { ChatOpenResult } from '@/lib/community-chat';
import {useCommunityMeals} from '@/lib/use-community-meals';
import {communityAreas,type BoundaryDataset} from '@/lib/community-areas';
import {findCommunityArea,filterCommunityMeals,type CommunityOrigin,type CommunityScope} from '@/lib/community-filters';
import {resolveLocationAreaInfo,type AreaInfo} from '@/lib/location-area';
import {validCoordinates} from '@/lib/geo';
import {CommunityAreaPicker} from './CommunityAreaPicker';

type Props = {
  language: Language;
  currentUserId: string;
  userLat: number | null;
  userLng: number | null;
  locationAccuracy?: number | null;
  locationError?: string | null;
  areaName?: string | null;
  radiusKm?: number;
  onRetryLocation?: () => void;
  meals: CommunityMeal[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onReserve?: (meal: CommunityMeal, quantity?: number) => Promise<{ ok: boolean; message: string }>;
  onShareMeal?: () => void;
  onMessageDonor?: (mealId: string, donorId: string) => Promise<ChatOpenResult>;
  highlightMealId?: string | null;
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
  return <span className="community-badge"><Icon size={12} />{isAr ? info.ar : info.en}</span>;
}

function formatCountdown(expiresAt: string, now: number, language: Language): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return language === 'ar' ? 'منتهي' : 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatExpiry(expiresAt: string, language: Language): string {
  return new Date(expiresAt).toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

export function CommunitySection({ language, currentUserId, userLat, userLng, locationAccuracy = null, locationError = null, areaName = null, onRetryLocation, meals: allMeals, loading, loadError, onRetry, onReserve, onShareMeal, onMessageDonor, highlightMealId = null }: Props) {
  const isAr = language === 'ar';
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const preferenceKey=`sharek-community-filters-v1:${currentUserId}`;
  const [preferences,setPreferences]=useState<{scope:CommunityScope;radius:number;manual:CommunityOrigin|null}>(()=>{try{const value=JSON.parse(localStorage.getItem(preferenceKey)??'null');if(value&&['nearby','same','other','all'].includes(value.scope)&&(!value.manual||validCoordinates(value.manual.latitude,value.manual.longitude)))return{scope:value.scope as CommunityScope,radius:5,manual:value.manual as CommunityOrigin|null};}catch{/* User preferences are optional. */}return{scope:'nearby',radius:5,manual:null};});
  useEffect(()=>{setPreferences(current=>{const name=current.manual?.names?.[language];return name&&current.manual&&name!==current.manual.name?{...current,manual:{...current.manual,name}}:current;});},[language]);
  const [areaPicker,setAreaPicker]=useState(false),[info,setInfo]=useState<AreaInfo|null>(null),[areaResolved,setAreaResolved]=useState(false),[boundaries,setBoundaries]=useState<BoundaryDataset|null>(null),[boundaryError,setBoundaryError]=useState(false),[boundaryRetry,setBoundaryRetry]=useState(0),[content,setContent]=useState<'meals'|'donors'>('meals');
  const lookupAt=useRef(0),latestPosition=useRef({userLat,userLng});latestPosition.current={userLat,userLng};
  const locationCell=validCoordinates(userLat,userLng)?`${language}:${userLat!.toFixed(3)}:${userLng!.toFixed(3)}`:'';
  useEffect(()=>{if(!locationCell)return;let active=true;setAreaResolved(false);const timer=window.setTimeout(()=>{const current=latestPosition.current;if(!validCoordinates(current.userLat,current.userLng))return;lookupAt.current=Date.now();void resolveLocationAreaInfo(current.userLat!,current.userLng!,language).then(value=>{if(active){setInfo(value);setAreaResolved(true);}}).catch(()=>{if(active){setInfo(null);setAreaResolved(true);}});},Math.max(0,lookupAt.current+30000-Date.now()));return()=>{active=false;window.clearTimeout(timer);};},[locationCell,language]);
  useEffect(()=>{try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));window.dispatchEvent(new Event('sharek-community-filters'));}catch{/* Do not block discovery when storage is unavailable. */}},[preferenceKey,preferences]);
  const gps=validCoordinates(userLat,userLng)?{latitude:userLat!,longitude:userLng!,name:areaName}:null;
  const origin=preferences.scope==='other'?preferences.manual:gps??preferences.manual;
  const manualFeed=useCommunityMeals(currentUserId,origin?.latitude??null,origin?.longitude??null,Boolean(origin&&(preferences.scope==='other'||!gps)));
  const manualActive=Boolean(origin&&(preferences.scope==='other'||!gps));
  const country=manualActive?preferences.manual?.countryCode:info?.countryCode;
  useEffect(()=>{if(!country){setBoundaries(null);return;}let active=true;setBoundaryError(false);setBoundaries(null);void communityAreas(country).then(data=>{if(active)setBoundaries(data);}).catch(()=>{if(active)setBoundaryError(true);});return()=>{active=false;};},[country,boundaryRetry]);
  const currentArea=origin&&boundaries?findCommunityArea(boundaries.features,origin.latitude,origin.longitude):null;
  const displayedLoading=manualActive?manualFeed.loading:loading,displayedError=manualActive?manualFeed.error:loadError;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!highlightMealId) return;
    let attempt = 0;
    const tryHighlight = () => {
      const el = document.querySelector<HTMLElement>(`[data-meal-id="${highlightMealId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('community-meal-highlighted');
        window.setTimeout(() => el.classList.remove('community-meal-highlighted'), 3500);
      } else if (attempt < 10) {
        attempt++;
        window.setTimeout(tryHighlight, 350);
      }
    };
    tryHighlight();
  }, [highlightMealId]);

  const meals=filterCommunityMeals(manualActive?manualFeed.allMeals:allMeals,origin,gps,preferences.radius,preferences.scope,currentArea,now);
  const donors=[...new Map(meals.map(meal=>[meal.donor_id,meals.find(row=>row.donor_id===meal.donor_id)!])).values()].sort((a,b)=>a.distance_km-b.distance_km);

  if (selectedMealId) {
    const selectedMeal = meals.find((meal) => meal.id === selectedMealId);
    return <MealDetail language={language} mealId={selectedMealId} isOwn={selectedMeal?.is_own} currentUserId={currentUserId} userLat={userLat} userLng={userLng} onBack={() => setSelectedMealId(null)} onReserve={onReserve} onMessageDonor={onMessageDonor ? async (id, donorId) => { const result = await onMessageDonor(id, donorId); if (result.ok) setSelectedMealId(null); return result; } : undefined} />;
  }
  if (selectedDonorId) {
    return <ProviderProfile language={language} donorId={selectedDonorId} currentUserId={currentUserId} userLat={userLat} userLng={userLng} communityMeals={meals} onBack={() => setSelectedDonorId(null)} />;
  }

  const copy = {
    title: isAr ? 'مجتمع SHARek 🌍' : 'SHARek Community 🌍',
    subtitle: isAr ? 'وجبات متاحة الآن من أفراد المجتمع' : 'Available meals from community members',
    empty: isAr ? 'لا توجد وجبات متاحة حاليًا' : 'No meals available right now',
    emptySub: isAr ? 'كن أول من يشارك وجبة!' : 'Be the first to share a meal!',
    meals: isAr ? 'وجبات' : 'meals',
    available: isAr ? 'متاح' : 'Available',
    yourMeal: isAr ? 'وجبتك' : 'Your meal',
    shareFirst: isAr ? 'انشر أول وجبة' : 'Share the first meal',
  };

  return (
    <div className="community-section" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="community-header">
        <h2>{copy.title}</h2>
        <p>{copy.subtitle}</p>
        <p className="community-current-area"><MapPin size={16}/>{gps?(areaName??(areaResolved?(isAr?'اسم المنطقة غير متاح حاليًا':'Area name currently unavailable'):(isAr?'جارٍ تحديد اسم المنطقة…':'Resolving your area…'))):preferences.manual?.name??(isAr?'اختر منطقة أو فعّل الموقع':'Choose an area or enable location')}</p>
      </div>
      <div className="community-filters"><div className="community-scope-buttons">{(['nearby','same','other','all'] as const).map((scope,i)=><button key={scope} className={preferences.scope===scope?'active':''} aria-pressed={preferences.scope===scope} onClick={()=>{if(scope==='other'&&!preferences.manual){setAreaPicker(true);return;}setPreferences(p=>({...p,scope}));}}>{(isAr?['بالقرب مني','نفس المنطقة','منطقة أخرى','الكل']:['Near me','Same area','Other area','All'])[i]}</button>)}</div><label>{isAr?'نطاق البحث':'Search radius'}<select aria-label={isAr?'نطاق البحث':'Search radius'} value={preferences.radius} onChange={e=>setPreferences(p=>({...p,radius:Number(e.target.value)}))}>{[1,3,5,10,50].map(radius=><option key={radius} value={radius}>{radius===50?(isAr?'جميع المسافات المتاحة (حتى 50 كم)':'All available distances (up to 50 km)'):`${radius} ${isAr?'كم':'km'}`}</option>)}</select></label><button className="text-button" onClick={()=>setAreaPicker(true)}>{isAr?'اختيار / تغيير المنطقة':'Choose / change area'}</button><div className="community-scope-buttons"><button className={content==='meals'?'active':''} onClick={()=>setContent('meals')}>{isAr?'الوجبات':'Meals'}</button><button className={content==='donors'?'active':''} onClick={()=>setContent('donors')}>{isAr?'المتبرعون':'Donors'}</button></div></div>
      {manualActive&&origin&&<p className="community-distance">{isAr?'البحث حول: ':'Searching around: '}{origin.name??(isAr?'المنطقة المختارة':'Selected area')}{!gps&&(isAr?' · المسافات من مركز منطقة البحث':' · Distances from the search area center')}</p>}
      {preferences.scope==='same'&&!currentArea&&<div role="status" className="feedback error">{(boundaryError||(!country&&areaResolved)||Boolean(boundaries&&!currentArea))?(isAr?'تعذر تحميل حدود المنطقة. اختر بالقرب مني أو أعد المحاولة.':'Area boundaries unavailable. Choose Near me or retry.'):(isAr?'جارٍ التحقق من الحدود الإدارية للمنطقة. لن تُعرض نتائج غير مؤكدة.':'Checking administrative boundaries. Unverified area results are hidden.')}<button className="text-button" onClick={()=>setBoundaryRetry(n=>n+1)}>{isAr?'إعادة المحاولة':'Retry'}</button></div>}
      {displayedError && <div className="feedback error" role="alert">{isAr ? 'تعذر تحديث الوجبات. تحقق من الاتصال.' : 'Could not update meals. Check your connection.'}<button className="text-button" onClick={manualActive?manualFeed.refresh:onRetry}>{isAr ? 'إعادة المحاولة' : 'Retry'}</button></div>}
      {(locationError || userLat == null || userLng == null) && <div className="feedback error" role="alert">{locationMessage(locationError, isAr)}{onRetryLocation && <button className="text-button" onClick={onRetryLocation}>{locationError==='services_off'?(isAr?'تشغيل الموقع':'Turn on location'):locationError==='denied'?(isAr?'السماح بالموقع':'Allow location'):(isAr ? 'إعادة تحديد الموقع' : 'Retry location')}</button>}</div>}
      {userLat != null && locationAccuracy != null && <p className="community-distance">{isAr ? 'المسافات جغرافية تقريبية؛ دقة موقعك' : 'Approximate geographic distances; your location accuracy'} ±{Math.round(locationAccuracy)} {isAr ? 'م' : 'm'}</p>}
      {displayedLoading ? (
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      ) : meals.length === 0 ? (
        <div className="community-empty"><span className="community-empty-icon"><Utensils size={24} /></span><h3>{copy.empty}</h3><p>{copy.emptySub}</p>{onShareMeal && <button className="primary-button community-empty-action" onClick={onShareMeal}><PackageOpen size={18} />{copy.shareFirst}</button>}</div>
      ) : content==='donors'?<div className="community-meal-grid">{donors.map(meal=><article key={meal.donor_id} className="community-meal-card"><button className="community-provider-area" onClick={()=>setSelectedDonorId(meal.donor_id)}>{meal.donor_avatar?<img className="community-provider-avatar" src={meal.donor_avatar} alt=""/>:<span className="community-provider-avatar placeholder"><Heart size={16}/></span>}<div className="community-provider-info"><strong>{meal.donor_name}</strong>{meal.donor_verified&&<BadgeCheck size={14}/>}<span className="community-rating"><Star size={13}/>{meal.donor_rating>0?meal.donor_rating.toFixed(1):(isAr?'جديد':'New')}</span><span className="community-distance">{isAr?'أقرب نقطة استلام: ':'Nearest pickup point: '}{formatDistance(meal.distance_km,language)}</span><span>{isAr?'عرض الملف والمحادثة':'View profile and chat'}</span></div></button><div className="community-badge-row">{meal.donor_badges.slice(0,3).map(b=><BadgeChip key={b} badge={b} language={language}/>)}</div></article>)}</div>:(
        <div className="community-meal-grid">
          {meals.map((meal) => (
            <article key={meal.id} data-meal-id={meal.id} className="community-meal-card">
              <div className="community-meal-image">
                <button className="community-meal-image-button" onClick={() => setSelectedMealId(meal.id)} aria-label={isAr ? `عرض تفاصيل ${meal.name}` : `View ${meal.name} details`}>
                  {meal.photo_url ? <img src={meal.photo_url} alt={meal.name} /> : <div className="community-meal-image-placeholder"><Utensils size={28} /></div>}
                </button>
                <span className="community-meal-cover-countdown"><Clock size={12} />{isAr ? 'متبقي' : 'Remaining'} {formatCountdown(mealDeadline(meal), now, language)}</span>
                <span className="community-meal-quantity-badge">{meal.quantity} {copy.meals}</span>
                {meal.is_own && <span className="community-meal-own-badge">{copy.yourMeal}</span>}
                {meal.photo_count > 1 && <span className="community-meal-photo-count">1/{meal.photo_count}</span>}
              </div>
              <div className="community-meal-body" onClick={() => setSelectedMealId(meal.id)}>
                <h3>{meal.name}</h3><span className="meal-sharing-badge">{sharingLabel(meal.sharing_mode, language)} · {collectionLabel(meal.collection_state, language)}</span>
                <div className="community-meal-expiry"><Clock size={12} />{isAr ? 'يختفي الساعة' : 'Disappears at'} {formatExpiry(mealDeadline(meal), language)}</div>
                <div className="community-meal-meta">
                  <span className="community-meal-quantity"><Utensils size={13} />{meal.quantity} {copy.meals}</span>
                  <span className="community-rating"><Star size={13} fill="currentColor" />{meal.donor_rating > 0 ? meal.donor_rating.toFixed(1) : (isAr ? 'جديد' : 'New')}</span>
                </div>
                <span className="community-distance"><MapPin size={14} />{meal.distance_km != null ? `${isAr ? 'على بُعد' : 'Distance'} ${formatDistance(meal.distance_km, language)}` : userLat == null || userLng == null ? (isAr ? 'فعّل الموقع لعرض المسافة' : 'Enable location to see distance') : meal.latitude == null || meal.longitude == null ? (isAr ? 'موقع الوجبة غير متاح' : 'Meal location unavailable') : (isAr ? 'المسافة غير متاحة حاليًا' : 'Distance currently unavailable')}</span>
                {meal.donor_badges.length > 0 && (
                  <div className="community-badge-row">{meal.donor_badges.slice(0, 3).map((b) => <BadgeChip key={b} badge={b} language={language} />)}</div>
                )}
              </div>
              <button className="community-provider-area" onClick={() => setSelectedDonorId(meal.donor_id)}>
                {meal.donor_avatar ? <img src={meal.donor_avatar} alt="" className="community-provider-avatar" /> : <span className="community-provider-avatar placeholder"><Heart size={16} fill="currentColor" /></span>}
                <div className="community-provider-info">
                  <span className="community-provider-name">{meal.donor_name || (isAr ? 'مساعد' : 'Helper')}{meal.donor_rating > 0 && <span className="community-provider-rating"><Star size={11} fill="currentColor" />{meal.donor_rating.toFixed(1)}</span>}{meal.donor_verified && <BadgeCheck size={14} className="community-verified" />}</span>
                  <span className="community-provider-action">{isAr ? 'عرض الملف' : 'View profile'} <ChevronRight size={13} /></span>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}
      {boundaries&&<small className="community-boundary-credit"><a href={boundaries.sourceUrl} target="_blank" rel="noreferrer">© geoBoundaries</a> · {isAr?'حدود إدارية منشورة':'Published administrative boundaries'} ({boundaries.year})</small>}
      {areaPicker&&<CommunityAreaPicker language={language} initialCountry={country} onClose={()=>setAreaPicker(false)} onChoose={point=>{setPreferences(p=>({...p,scope:'other',manual:point}));setAreaPicker(false);}}/>}
    </div>
  );
}
