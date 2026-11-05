import { mealDeadline } from '@/lib/meal-sharing';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Clock, MapPin, PackageOpen, Trash2, Utensils } from 'lucide-react';
import { supabase, type Language, type Meal } from '@/lib/supabase';
import { MealDetail } from './MealDetail';
import {MealShareButton} from './MealShareButton';

type Props = {
  language: Language;
  userId: string;
  onBack: () => void;
};

type StatusTab = 'active' | 'reserved' | 'completed' | 'expired';

const statusFilter: Record<StatusTab, string[]> = {
  active: ['ACTIVE'],
  reserved: ['RESERVED'],
  completed: ['COMPLETED'],
  expired: ['CANCELLED'],
};

export function MyMeals({ language, userId, onBack }: Props) {
  const isAr = language === 'ar';
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StatusTab>('active');
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [selectedIds,setSelectedIds]=useState<Set<string>>(()=>new Set());
  const [confirmDelete,setConfirmDelete]=useState(false),[deleting,setDeleting]=useState(false),[error,setError]=useState('');

  const copy = {
    title: isAr ? 'وجباتي المنشورة' : 'My published meals',
    active: isAr ? 'متاحة' : 'Available',
    reserved: isAr ? 'محجوزة' : 'Reserved',
    completed: isAr ? 'مكتملة' : 'Completed',
    expired: isAr ? 'منتهية' : 'Expired',
    empty: isAr ? 'لا توجد وجبات في هذا القسم' : 'No meals in this section',
    emptySub: isAr ? 'شارك وجبتك الأولى الآن' : 'Share your first meal now',
    meals: isAr ? 'وجبات' : 'meals',
    selectAll:isAr?'تحديد الكل':'Select all',cancelSelection:isAr?'إلغاء التحديد':'Clear selection',deleteSelected:isAr?'حذف المحدد':'Delete selected',
  };

  const fetchMeals = useCallback(async () => {
    const { data, error } = await supabase.from('meals').select('*').eq('donor_id', userId).neq('status','DELETED').order('created_at', { ascending: false });
    if (!error) {
      const nextMeals = (data ?? []) as Meal[];
      setMeals(nextMeals);
      const { data: photos } = nextMeals.length ? await supabase.from('meal_photos').select('meal_id').in('meal_id', nextMeals.map((meal) => meal.id)) : {data:[]};
      if (photos) setPhotoCounts(photos.reduce<Record<string, number>>((counts, photo) => ({ ...counts, [photo.meal_id]: (counts[photo.meal_id] ?? 0) + 1 }), {}));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchMeals();
    const channel = supabase.channel(`my-meals-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, () => { void fetchMeals(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchMeals, userId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (selectedMeal) {
    return <MealDetail language={language} mealId={selectedMeal.id} isOwn onBack={() => setSelectedMeal(null)} />;
  }

  const filtered = meals.filter((m) => {
    const statuses = statusFilter[activeTab];
    if (activeTab === 'expired') return m.status!=='DELETED' && (statuses.includes(m.status) || new Date(mealDeadline(m)).getTime() < now);
    if (activeTab === 'active') return m.status === 'ACTIVE' && m.quantity > (m.reserved_quantity ?? 0) && new Date(mealDeadline(m)).getTime() > now && new Date(m.availability_start).getTime() <= now;
    if (activeTab === 'reserved') return (m.status === 'RESERVED' || (m.status === 'ACTIVE' && m.quantity <= (m.reserved_quantity ?? 0))) && new Date(mealDeadline(m)).getTime() > now;
    return statuses.includes(m.status) && new Date(mealDeadline(m)).getTime() >= now;
  });

  const tabs: { key: StatusTab; label: string; dot: string }[] = [
    { key: 'active', label: copy.active, dot: '#4caf50' },
    { key: 'reserved', label: copy.reserved, dot: '#ff9800' },
    { key: 'completed', label: copy.completed, dot: '#2196f3' },
    { key: 'expired', label: copy.expired, dot: '#9e9e9e' },
  ];

  const toggle=(id:string)=>setSelectedIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const removeSelected=async()=>{
    if(deleting||!selectedIds.size)return;
    setDeleting(true);setError('');
    try{
      const {data,error:deleteError}=await supabase.rpc('delete_expired_meals',{p_meal_ids:[...selectedIds]});
      if(deleteError)throw deleteError;
      const removed=new Set<string>((data?.deleted??[]) as string[]);
      if(removed.size)setMeals(current=>current.filter(meal=>!removed.has(meal.id)));
      setSelectedIds(new Set());setConfirmDelete(false);
      if(data?.failed?.length)setError(isAr?`تعذر حذف ${data.failed.length} من الوجبات المحددة. راجع حالتها وحاول مجددًا.`:`Could not delete ${data.failed.length} selected meals. Check their status and retry.`);
      await fetchMeals();
    }catch{setError(isAr?'تعذر حذف الوجبات. تحقق من الاتصال وحاول مجددًا.':'Could not delete meals. Check your connection and retry.');}
    finally{setDeleting(false);}
  };

  const timeLeft = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) return isAr ? 'منتهي' : 'Expired';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="my-meals-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="my-meals-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.title}><ArrowLeft size={20} /></button>
        <h2>{copy.title}</h2>
      </header>
      <div className="my-meals-tabs">
        {tabs.map((tab) => (
          <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => {setActiveTab(tab.key);setSelectedIds(new Set());setError('');}}>
            <span className="my-meals-tab-dot" style={{ background: tab.dot }} />
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab==='expired'&&filtered.length>0&&<div className="my-meals-selection"><button className="text-button" disabled={deleting} onClick={()=>setSelectedIds(new Set(filtered.map(meal=>meal.id)))}>{copy.selectAll}</button><button className="text-button" disabled={deleting} onClick={()=>setSelectedIds(new Set())}>{copy.cancelSelection}</button>{selectedIds.size>0&&<button className="primary-button danger" disabled={deleting} onClick={()=>setConfirmDelete(true)}><Trash2 size={16}/>{copy.deleteSelected} ({selectedIds.size})</button>}</div>}
      {error&&<p className="feedback error" role="alert">{error}</p>}
      <div className="my-meals-list">
        {loading ? (
          <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
        ) : filtered.length === 0 ? (
          <div className="community-empty"><span className="community-empty-icon"><PackageOpen size={24} /></span><h3>{copy.empty}</h3><p>{copy.emptySub}</p></div>
        ) : (
          filtered.map((meal) => (
            <div key={meal.id} className={selectedIds.has(meal.id)?'my-meal-selected':''}>{activeTab==='expired'&&<label className="my-meal-select"><input type="checkbox" checked={selectedIds.has(meal.id)} disabled={deleting} onChange={()=>toggle(meal.id)}/>{isAr?'تحديد الوجبة':'Select meal'}</label>}<button className="my-meal-card" onClick={() => setSelectedMeal(meal)}>
              <div className="my-meal-thumb">
                {meal.photo_url ? <img src={meal.photo_url} alt={meal.name} /> : <span className="community-meal-image-placeholder small"><Utensils size={20} /></span>}
                {(photoCounts[meal.id] ?? 0) > 1 && <span className="my-meal-photo-count">1/{photoCounts[meal.id]}</span>}
              </div>
              <div className="my-meal-info">
                <strong>{meal.name}</strong>
                <span className="my-meal-status"><i className={`meal-status-dot ${meal.status.toLowerCase()}`} />{meal.status === 'RESERVED' ? (isAr ? 'محجوزة' : 'Reserved') : meal.status === 'ACTIVE' ? (isAr ? 'متاحة' : 'Available') : (isAr ? 'منتهية' : 'Unavailable')}</span>
                <small><Utensils size={12} /> {Math.max(0, meal.quantity - (meal.reserved_quantity ?? 0))} {copy.meals} · <Clock size={12} /> {timeLeft(mealDeadline(meal))}</small>
                {meal.latitude != null && <small><MapPin size={12} /> {isAr ? 'موقع الاستلام محفوظ' : 'Pickup location saved'} </small>}
              </div>
              <ChevronRight size={18} />
            </button><MealShareButton mealId={meal.id} language={language}/></div>
          ))
        )}
      </div>
      {confirmDelete&&<div className="modal-overlay"><div className="modal-card" role="alertdialog" aria-modal="true"><h3>{isAr?'حذف الوجبات المحددة؟':'Delete selected meals?'}</h3><p>{isAr?`سيتم حذف ${selectedIds.size} من وجباتك المنتهية.`:`${selectedIds.size} expired meals will be removed.`}</p><button className="primary-button danger" disabled={deleting} onClick={()=>void removeSelected()}>{deleting?'…':isAr?'تأكيد الحذف':'Confirm deletion'}</button><button className="text-button" disabled={deleting} onClick={()=>setConfirmDelete(false)}>{isAr?'إلغاء':'Cancel'}</button></div></div>}
    </div>
  );
}
