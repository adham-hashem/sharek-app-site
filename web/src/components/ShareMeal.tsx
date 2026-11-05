import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Clock, ImagePlus, MapPin, MapPinned, PackageOpen, Trash2, Utensils, X } from 'lucide-react';
import { supabase, type Language, type Meal, type MealCategory } from '@/lib/supabase';
import { prepareSuccessSound, playSuccessSoundOnce } from '@/lib/success-sound';
import { PickupMap } from './PickupMap';
import { sharingLabel, type PickupPoint, type SharingMode } from '@/lib/meal-sharing';
import { type LocationFix } from '@/lib/geo';
import { resolveLocationAreaInfo } from '@/lib/location-area';

type Props = {
  language: Language;
  userLat: number | null;
  userLng: number | null;
  locationFix?: LocationFix | null;
  locationError?: string | null;
  onRetryLocation?: () => void;
  onClose: () => void;
  onPublished: (meal: Meal) => void;
};

type PhotoItem = { id: string; url: string; file: File };

const categoryOptions: { value: MealCategory; ar: string; en: string; icon: string }[] = [
  { value: 'cooked', ar: 'وجبات مطبوخة', en: 'Cooked meals', icon: '🍚' },
  { value: 'sandwiches', ar: 'ساندويتشات', en: 'Sandwiches', icon: '🥪' },
  { value: 'bakery', ar: 'مخبوزات', en: 'Bakery', icon: '🍞' },
  { value: 'ready', ar: 'أطعمة جاهزة', en: 'Ready food', icon: '🍲' },
  { value: 'fruit', ar: 'فواكه', en: 'Fruits', icon: '🍎' },
  { value: 'vegetables', ar: 'خضروات', en: 'Vegetables', icon: '🥗' },
  { value: 'sweets', ar: 'حلويات', en: 'Sweets', icon: '🍰' },
  { value: 'other', ar: 'أخرى', en: 'Other', icon: '🍽️' },
];

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ShareMeal({ language, locationFix = null, locationError = null, onRetryLocation, onClose, onPublished }: Props) {
  const isAr = language === 'ar';
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MealCategory>('cooked');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [availableFrom, setAvailableFrom] = useState(toLocalDateTimeInput(new Date()));
  const [availableUntil, setAvailableUntil] = useState(toLocalDateTimeInput(new Date(Date.now() + 4 * 60 * 60 * 1000)));
  const [pickupLocation, setPickupLocation] = useState<PickupPoint | null>(null);
  const [pickupArea, setPickupArea] = useState<string | null>(null);
  const pickupLatitude = pickupLocation?.latitude;
  const pickupLongitude = pickupLocation?.longitude;
  useEffect(() => {
    if (pickupLatitude == null || pickupLongitude == null) { setPickupArea(null); return; }
    let active = true;
    setPickupArea(null);
    void resolveLocationAreaInfo(pickupLatitude, pickupLongitude, language)
      .then(info => { if (active) setPickupArea(info.name); })
      .catch(() => {});
    return () => { active = false; };
  }, [pickupLatitude, pickupLongitude, language]);
  const [sharingMode, setSharingMode] = useState<SharingMode>('request');
  const [pickupUntil, setPickupUntil] = useState(availableUntil);
  const [instructions, setInstructions] = useState('');
  const [choosingPickup, setChoosingPickup] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmQuantity, setConfirmQuantity] = useState<number | null>(null);
  const publishingRef = useRef(false);
  const uncertainPublicationRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [error, setError] = useState('');
  const [attempted,setAttempted]=useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copy = {
    title: isAr ? 'شارك وجبة' : 'Share a meal',
    photos: isAr ? 'صور الوجبة' : 'Meal photos',
    addPhoto: isAr ? '+ إضافة صورة' : '+ Add photo',
    photoHint: isAr ? 'الصورة الأولى هي الصورة الرئيسية' : 'First photo is the cover',
    mealName: isAr ? 'اسم الوجبة' : 'Meal name',
    namePlaceholder: isAr ? 'مثلًا: وجبات أرز ودجاج' : 'e.g. Rice and chicken meals',
    category: isAr ? 'نوع الطعام' : 'Food category',
    description: isAr ? 'وصف الوجبة' : 'Description',
    descPlaceholder: isAr ? 'وجبات طازجة ومجهزة اليوم...' : 'Fresh meals prepared today...',
    optional: isAr ? 'اختياري' : 'Optional',
    quantity: isAr ? 'عدد الوجبات المتاحة للمشاركة' : 'Number of meals available to share',
    sharingMode: isAr ? 'طريقة المشاركة' : 'Sharing mode',
    requestDescription: isAr ? 'تراجع طلبات المحتاجين وتقبلها أو ترفضها بنفسك.' : 'Review requests and accept or decline them yourself.',
    directDescription: isAr ? 'يُؤكَّد الحجز تلقائيًا ويذهب المحتاج إلى نقطة الاستلام المحددة.' : 'Reservations are confirmed automatically at your chosen pickup point.',
    confirmQuantity: (count: number) => isAr ? `أنت على وشك مشاركة ${count} وجبات، هل الكمية صحيحة؟` : `You're about to share ${count} meals. Is this quantity correct?`,
    editQuantity: isAr ? 'تعديل الكمية' : 'Edit quantity',
    confirmAndPublish: isAr ? 'تأكيد ونشر' : 'Confirm and publish',
    availability: isAr ? 'وقت التوفر' : 'Availability',
    from: isAr ? 'متاحة من' : 'Available from',
    until: isAr ? 'متاحة حتى' : 'Available until',
    location: isAr ? 'موقع الاستلام' : 'Pickup location',
    useMyLocation: isAr ? 'استخدام موقعي الحالي للاستلام' : 'Use my current location for pickup',
    locationSet: isAr ? 'تم حفظ موقع الاستلام' : 'Pickup location saved',
    noLocation: isAr ? 'فعّل GPS لتحديد موقع الاستلام' : 'Enable GPS to set pickup location',
    preview: isAr ? 'معاينة' : 'Preview',
    publish: isAr ? 'نشر الوجبة' : 'Publish meal',
    publishing: isAr ? 'جارٍ نشر الوجبة...' : 'Publishing meal...',
    back: isAr ? 'رجوع' : 'Back',
    close: isAr ? 'إغلاق' : 'Close',
    errorGeneric: isAr ? 'تعذر حفظ الوجبة. تحقق من الاتصال وحاول مرة أخرى.' : 'Could not save the meal. Check your connection and try again.',
    errorUncertain: isAr ? 'تعذر تأكيد النشر. تحقق من قائمة وجباتك قبل إعادة المحاولة.' : 'Could not confirm publication. Check your meals before retrying.',
    meals: isAr ? 'وجبات' : 'meals',
    availableNow: isAr ? 'متاحة الآن' : 'Available now',
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const url = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { id, url, file }]);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const movePhoto = (index: number, direction: -1 | 1) => {
    setPhotos((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const availabilityValid=()=>Date.parse(availableUntil)>Date.now()&&Date.parse(availableFrom)<Date.parse(availableUntil);
  const pickupValid=()=>sharingMode!=='direct'||(Date.parse(pickupUntil)>Math.max(Date.now(),Date.parse(availableFrom))&&Date.parse(pickupUntil)<=Date.parse(availableUntil));
  const datesValid=availabilityValid()&&pickupValid();
  const canPublish = name.trim() && Number.isInteger(quantity) && quantity > 0 && quantity <= 1000 && datesValid && photos.length > 0 && pickupLocation != null;
  const getMissing=()=>[
    !name.trim()?{id:'name',label:copy.mealName}:null,
    !photos.length?{id:'photos',label:copy.photos}:null,
    !Number.isInteger(quantity)||quantity<1||quantity>1000?{id:'quantity',label:copy.quantity}:null,
    !availabilityValid()?{id:'availability',label:copy.availability}:null,
    !pickupValid()?{id:'pickupDeadline',label:isAr?'انتهاء الاستلام':'Pickup deadline'}:null,
    !pickupLocation?{id:'location',label:copy.location}:null,
  ].filter((field):field is {id:string;label:string}=>field!==null);
  const missing=getMissing();
  const focusMissing=(id:string)=>{setStep('form');window.setTimeout(()=>{const field=document.getElementById(`share-field-${id}`);field?.scrollIntoView({behavior:'smooth',block:'center'});field?.classList.add('validation-target');(field?.querySelector('input,button,select') as HTMLElement|null)?.focus({preventScroll:true});window.setTimeout(()=>field?.classList.remove('validation-target'),2500);},50);};
  const validate=()=>{setAttempted(true);const missing=getMissing();if(missing.length){focusMissing(missing[0].id);return false;}return true;};
  const choosePickupLocation = () => { setError(''); setChoosingPickup(true); };

  const uploadPhotos = async (mealId: string): Promise<string> => {
    const uploads = await Promise.allSettled(photos.map(async (photo, i) => {
      const ext = photo.file.name.split('.').pop() || 'jpg';
      const path = `${mealId}/${i}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('meal-photos').upload(path, photo.file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('meal-photos').getPublicUrl(path);
      const { error: insertError } = await supabase.from('meal_photos').insert({ meal_id: mealId, url: urlData.publicUrl, position: i });
      if (insertError) throw insertError;
      return urlData.publicUrl;
    }));
    const failed = uploads.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    const cover = uploads[0];
    if (cover?.status !== 'fulfilled') throw new Error('Cover photo was not saved');
    return cover.value;
  };

  const publish = async (confirmedQuantity: number): Promise<void> => {
    if (!validate()) return;
    if (!canPublish) return;
    if (publishingRef.current || confirmedQuantity !== quantity) return;
    const publicationQuantity = quantity;
    const publicationMode = sharingMode;
    publishingRef.current = true;
    setPublishing(true);
    setError('');
    prepareSuccessSound();
    let insertedId: string | null = null;
    try {
      // If the final response was lost, confirm the same meal instead of publishing a duplicate.
      if (uncertainPublicationRef.current) {
        const previousId = uncertainPublicationRef.current;
        const { data: previous, error: previousError } = await supabase.from('meals').select('*').eq('id', previousId).maybeSingle();
        if (previousError || !previous) throw new Error('Previous publication could not be verified');
        if (previous.status === 'ACTIVE') {
          if (previous.quantity !== publicationQuantity || previous.sharing_mode !== publicationMode) throw new Error('Previous publication differs from the confirmed meal');
          if (mountedRef.current) { setPublishing(false); onPublished(previous as Meal); void playSuccessSoundOnce('published', previous.id); }
          return;
        }
        if (previous.status === 'DRAFT') {
          const { error: cancelError } = await supabase.from('meals').update({ status: 'CANCELLED' }).eq('id', previousId).eq('status', 'DRAFT');
          if (cancelError) throw cancelError;
        }
        uncertainPublicationRef.current = null;
      }
      const expiresAt = new Date(availableUntil).toISOString();
      const availabilityStart = new Date(availableFrom).toISOString();
      const payload: Record<string, unknown> = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        quantity: publicationQuantity,
        availability_start: availabilityStart,
        expires_at: expiresAt,
        status: 'DRAFT',
        sharing_mode: publicationMode,
        pickup_until: publicationMode === 'direct' ? new Date(pickupUntil).toISOString() : null,
        pickup_instructions: publicationMode === 'direct' ? instructions.trim() || null : null,
      };
      if (!pickupLocation) throw new Error('Pickup location required');
      payload.latitude = pickupLocation.latitude;
      payload.longitude = pickupLocation.longitude;
      payload.pickup_accuracy_m = pickupLocation.accuracy;
      payload.pickup_location_source = pickupLocation.source;
      payload.pickup_location_confirmed_at = new Date(pickupLocation.timestamp).toISOString();
      const resolvedArea = pickupArea ?? await Promise.race<string | null>([
        resolveLocationAreaInfo(pickupLocation.latitude, pickupLocation.longitude, language)
          .then(info => info.name).catch(() => null),
        new Promise(resolve => window.setTimeout(() => resolve(null), 1000)),
      ]);
      if (resolvedArea) payload.area_name = resolvedArea;
      let { data: mealData, error: insertError } = await supabase.from('meals').insert(payload).select('id,quantity,sharing_mode').maybeSingle();
      // An older database schema must not prevent saving a real meal while the
      // location-label migration is being rolled out.
      if (insertError?.code === 'PGRST204' && insertError.message.includes('area_name') && payload.area_name) {
        delete payload.area_name;
        ({ data: mealData, error: insertError } = await supabase.from('meals').insert(payload).select('id,quantity,sharing_mode').maybeSingle());
      }
      if (insertError || !mealData) throw new Error('insert failed');
      insertedId = mealData.id;
      if (mealData.quantity !== publicationQuantity || mealData.sharing_mode !== publicationMode) throw new Error('Saved meal quantity or sharing mode differs from the confirmed choice');
      const coverUrl = await uploadPhotos(mealData.id);
      uncertainPublicationRef.current = mealData.id;
      const { data: published, error: publishError } = await supabase.from('meals').update({ photo_url: coverUrl, status: 'ACTIVE' }).eq('id', mealData.id).eq('status', 'DRAFT').select('*').maybeSingle();
      if (publishError || !published || published.id !== mealData.id || published.status !== 'ACTIVE' || published.quantity !== publicationQuantity || published.sharing_mode !== publicationMode) throw new Error('Published meal details could not be confirmed');
      if (mountedRef.current) {
        setPublishing(false);
        onPublished(published as Meal);
        void playSuccessSoundOnce('published', mealData.id);
      }
    } catch (err) {
      if (insertedId) {
        uncertainPublicationRef.current = insertedId;
        const { data: cancelled, error: cancelError } = await supabase.from('meals').update({ status: 'CANCELLED' }).eq('id', insertedId).eq('status', 'DRAFT').select('id').maybeSingle();
        if (!cancelError && cancelled?.id === insertedId) uncertainPublicationRef.current = null;
      }
      console.error('meal publish failed', err);
      if (mountedRef.current) setError(uncertainPublicationRef.current ? copy.errorUncertain : copy.errorGeneric);
      setPublishing(false);
    } finally {
      publishingRef.current = false;
    }
  };

  const formatUntil = (): string => {
    const d = new Date(availableUntil);
    return d.toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="share-meal-overlay" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="share-meal-sheet">
        <button className="modal-close" onClick={onClose} disabled={publishing} aria-label={copy.close}><X size={18} /></button>
        <span className="modal-icon green"><PackageOpen size={23} /></span>
        <h2>{copy.title}</h2>
        {attempted&&missing.length>0&&<div className="feedback error" role="alert"><strong>{isAr?'باقي خطوة صغيرة! أكمل البيانات المطلوبة للمتابعة':'Almost there! Complete the required fields to continue'} ({missing.length})</strong>{missing.map(field=><button key={field.id} className="text-button" onClick={()=>focusMissing(field.id)}>{isAr?'من فضلك أكمل: ':'Please complete: '}{field.label}</button>)}</div>}

        {step === 'form' ? (
          <>
            <label className="share-field-label">{copy.sharingMode}<small>{isAr?'مطلوب':'Required'}</small></label>
            <div className="share-mode-grid" role="group" aria-label={copy.sharingMode}>
              {(['request', 'direct'] as const).map(mode => <button key={mode} type="button" className={`share-mode-option ${sharingMode === mode ? 'selected' : ''}`} aria-pressed={sharingMode === mode} onClick={() => setSharingMode(mode)}><span className="share-mode-heading">{mode === 'request' ? <ClipboardCheck size={18} /> : <MapPinned size={18} />}<b>{sharingLabel(mode, language)}</b>{sharingMode === mode && <Check className="share-mode-check" size={16} />}</span><small>{mode === 'request' ? copy.requestDescription : copy.directDescription}</small></button>)}
            </div>
            <label className="share-field-label">{copy.photos}<small>{isAr?'مطلوب · ':'Required · '}{copy.photoHint}</small></label>
            <div id="share-field-photos" className="share-photo-gallery">
              {photos.map((photo, index) => (
                <div className="share-photo-thumb" key={photo.id}>
                  <img src={photo.url} alt="" />
                  {index === 0 && <span className="share-photo-cover-badge">{isAr ? 'رئيسية' : 'Cover'}</span>}
                  <button className="share-photo-remove" onClick={() => removePhoto(photo.id)}><Trash2 size={14} /></button>
                  <div className="share-photo-order">
                    {index > 0 && <button onClick={() => movePhoto(index, -1)}><ArrowLeft size={13} /></button>}
                    {index < photos.length - 1 && <button onClick={() => movePhoto(index, 1)}><ArrowRight size={13} /></button>}
                  </div>
                </div>
              ))}
              <button className="share-photo-add" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={24} />
                <span>{copy.addPhoto}</span>
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} hidden />

            <label id="share-field-name" className="share-field-label">{copy.mealName}<small>{isAr?'مطلوب':'Required'}</small>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.namePlaceholder} />
            </label>

            <label className="share-field-label">{copy.category}<small>{isAr?'مطلوب':'Required'}</small>
              <div className="share-category-grid">
                {categoryOptions.map((opt) => (
                  <button key={opt.value} className={`share-category-chip ${category === opt.value ? 'selected' : ''}`} onClick={() => setCategory(opt.value)}>
                    <span>{opt.icon}</span><span>{isAr ? opt.ar : opt.en}</span>
                  </button>
                ))}
              </div>
            </label>

            <label className="share-field-label">{copy.description}<small>{copy.optional}</small>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={copy.descPlaceholder} rows={2} />
            </label>

            <label id="share-field-quantity" className="share-field-label">{copy.quantity}<small>{isAr?'مطلوب':'Required'}</small>
              <input type="number" min="1" max="1000" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
            </label>

            <label id="share-field-availability" className="share-field-label">{copy.availability}<small>{isAr?'مطلوب':'Required'}</small>
              <div className="share-time-grid">
                <div><small>{copy.from}</small><input type="datetime-local" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} /></div>
                <div><small>{copy.until}</small><input type="datetime-local" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} /></div>
              </div>
            </label>

            {sharingMode === 'direct' && <>
              <label id="share-field-pickupDeadline" className="share-field-label">{isAr ? 'انتهاء الاستلام (مطلوب)' : 'Pickup deadline (required)'}<input type="datetime-local" value={pickupUntil} min={availableFrom} max={availableUntil} onChange={e => setPickupUntil(e.target.value)} /></label>
              <label className="share-field-label">{isAr ? 'تعليمات الوصول للطعام (اختياري)' : 'Pickup instructions (optional)'}<textarea rows={2} maxLength={1000} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
            </>}
            {!datesValid && <p role="alert">{isAr ? 'اختر وقت توفر قبل انتهاء الصلاحية، ووقت استلام مستقبليًا لا يتجاوز الصلاحية.' : 'Availability must precede expiry. Pickup must end in the future, no later than expiry.'}</p>}
            <label id="share-field-location" className="share-field-label">{copy.location}<small>{isAr?'مطلوب':'Required'}</small>
              <button className={`share-location-toggle ${pickupLocation ? 'enabled' : ''}`} aria-label={pickupLocation ? copy.locationSet : (isAr ? 'تحديد نقطة الاستلام على الخريطة' : 'Choose pickup point on map')} onClick={choosePickupLocation}>
                <MapPin size={16} />
                <span>{pickupLocation ? copy.locationSet : (isAr ? 'تحديد نقطة الاستلام على الخريطة' : 'Choose pickup point on map')}</span>
                {pickupLocation && <Check size={15} />}
              </button>
            </label>

            {error && <div className="feedback error"><X size={16} />{error}</div>}

            <button className="primary-button" onClick={() => {if(validate())setStep('preview');}}>
              {copy.preview}<ArrowRight size={18} />
            </button>
          </>
        ) : (
          <div className="share-preview">
            <div className="share-preview-gallery">
              {photos[0] && <img src={photos[0].url} alt={name} className="share-preview-cover" />}
              {photos.length > 1 && <span className="share-preview-photo-count">{photos.length} {isAr ? 'صور' : 'photos'}</span>}
            </div>
            <h3>{name.trim()}</h3>
            <div className="share-preview-meta">
              <span><Utensils size={15} /> {quantity} {copy.meals}</span>
              <span><Clock size={15} /> {isAr ? 'حتى' : 'until'} {formatUntil()}</span>
              {pickupLocation && <span><MapPin size={15} /> {copy.locationSet}</span>}
            </div>
            {description.trim() && <p className="share-preview-desc">{description.trim()}</p>}
            <span className="share-preview-status">{sharingLabel(sharingMode, language)}</span>
            {sharingMode === 'direct' && <p>{isAr ? 'انتهاء الاستلام: ' : 'Pickup ends: '}{new Date(pickupUntil).toLocaleString(language)}{instructions.trim() && <><br />{instructions.trim()}</>}</p>}
            {pickupLocation && <PickupMap language={language} point={pickupLocation} />}
            {error && <div className="feedback error"><X size={16} />{error}</div>}
            <button className="primary-button" disabled={publishing} aria-busy={publishing} aria-label={publishing ? copy.publishing : copy.publish} onClick={() => { if(!validate())return; if (quantity > 1) setConfirmQuantity(quantity); else void publish(quantity); }}>
              {publishing ? <><span className="share-publish-spinner" aria-hidden="true" /><span role="status">{copy.publishing}</span></> : <>{copy.publish}<Check size={18} /></>}
            </button>
            <button className="text-button" disabled={publishing} onClick={() => setStep('form')}>{copy.back}</button>
          </div>
        )}
      </div>
      {choosingPickup && <div className="pickup-picker-overlay"><PickupMap language={language} point={pickupLocation} fix={locationFix} error={locationError} onRetry={onRetryLocation} onConfirm={point => { setPickupLocation(point); setChoosingPickup(false); }} onClose={() => setChoosingPickup(false)} /></div>}
      {confirmQuantity !== null && <div className="modal-overlay share-quantity-confirm"><div className="modal-card" role="alertdialog" aria-modal="true"><h3>{copy.confirmQuantity(confirmQuantity)}</h3><button className="primary-button" disabled={publishing} onClick={() => { const confirmed = confirmQuantity; setConfirmQuantity(null); void publish(confirmed); }}>{copy.confirmAndPublish}</button><button className="text-button" disabled={publishing} onClick={() => { setConfirmQuantity(null); setStep('form'); }}>{copy.editQuantity}</button></div></div>}
    </div>
  );
}
