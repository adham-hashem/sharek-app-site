import { useCallback, useEffect, useState } from 'react';
import { Check, Heart, Loader2, Star, X } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';

type Props = {
  language: Language;
  requestId: string;
  reviewType: 'beneficiary_to_donor' | 'donor_to_beneficiary';
  partnerName: string;
  partnerAvatar: string | null;
  onComplete: () => void;
  onSkip: () => void;
};

export function RatingModal({ language, requestId, reviewType, partnerName, partnerAvatar, onComplete, onSkip }: Props) {
  const isAr = language === 'ar';
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingReview, setExistingReview] = useState<{ id: string; rating: number; comment: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,setError]=useState('');

  const copy = {
    beneficiaryTitle: isAr ? 'كيف كانت تجربتك مع مقدم المساعدة؟' : 'How was your experience with the helper?',
    beneficiarySub: isAr ? 'تم استلام الوجبة بنجاح' : 'Meal received successfully',
    donorTitle: isAr ? 'قيّم تجربة التعامل مع المحتاج' : 'Rate your experience with the beneficiary',
    donorSub: isAr ? 'اكتملت عملية المساعدة' : 'Help operation completed',
    addComment: isAr ? 'أضف تعليقًا...' : 'Add a comment...',
    submit: isAr ? 'إرسال التقييم' : 'Submit review',
    submitting: isAr ? 'جارٍ الإرسال...' : 'Submitting...',
    skip: isAr ? 'تخطي' : 'Skip',
    thankYou: isAr ? 'شكرًا لتقييمك!' : 'Thank you for your review!',
    alreadyReviewed: isAr ? 'تم تقييم هذه العملية بالفعل' : 'This operation has already been reviewed',
    yourRating: isAr ? 'تقييمك' : 'Your rating',
    close: isAr ? 'إغلاق' : 'Close',
  };

  const checkExisting = useCallback(async () => {
    const { data,error } = await supabase.rpc('get_my_review_for_request', {
      p_request_id: requestId,
      p_review_type: reviewType,
    });
    if(error)setError(isAr?'تعذر التحقق من التقييم السابق. حاول مجددًا.':'Could not check your previous review. Please retry.');
    if (data && Array.isArray(data) && data.length > 0) {
      setExistingReview({ id: data[0].id, rating: data[0].rating, comment: data[0].comment });
    }
    setLoading(false);
  }, [requestId, reviewType,isAr]);

  useEffect(() => { void checkExisting(); }, [checkExisting]);

  const submit = async (): Promise<void> => {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { data,error } = await supabase.rpc('submit_review', {
        p_request_id: requestId,
        p_rating: rating,
        p_comment: comment.trim() || null,
        p_review_type: reviewType,
      });
      if (error||typeof data!=='string'||!data) throw error??new Error('Review not saved');
      onComplete();
    } catch {
      setError(isAr?'تعذر حفظ التقييم. تحقق من تأكيد الاستلام والاتصال، أو أعد فحص التقييم السابق.':'Could not save your rating. Check receipt and connection, or recheck your previous rating.');
      void checkExisting();
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rating-modal-overlay" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="rating-modal-card">
          <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
        </div>
      </div>
    );
  }

  if (existingReview) {
    return (
      <div className="rating-modal-overlay" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="rating-modal-card">
          <button className="modal-close" onClick={onComplete} aria-label={copy.close}><X size={18} /></button>
          <span className="rating-success-icon"><Check size={32} /></span>
          <h2 className="rating-title">{copy.alreadyReviewed}</h2>
          <div className="rating-stars-display">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={28} fill={i < existingReview.rating ? 'currentColor' : 'none'} className={i < existingReview.rating ? 'star-filled' : 'star-empty'} />
            ))}
          </div>
          {existingReview.comment && <p className="rating-existing-comment">"{existingReview.comment}"</p>}
          <button className="primary-button" onClick={onComplete}>{copy.close}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rating-modal-overlay" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="rating-modal-card">
        <button className="modal-close" onClick={onSkip} aria-label={copy.skip}><X size={18} /></button>
        <span className="rating-success-icon"><Heart size={32} fill="currentColor" /></span>
        <p className="rating-subtitle">{reviewType === 'beneficiary_to_donor' ? copy.beneficiarySub : copy.donorSub}</p>
        <h2 className="rating-title">{reviewType === 'beneficiary_to_donor' ? copy.beneficiaryTitle : copy.donorTitle}</h2>

        <div className="rating-partner-info">
          {partnerAvatar ? <img src={partnerAvatar} alt="" className="rating-partner-avatar" /> : <span className="rating-partner-avatar placeholder"><Heart size={22} fill="currentColor" /></span>}
          <strong>{partnerName}</strong>
        </div>

        <div className="rating-stars-input">
          {Array.from({ length: 5 }).map((_, i) => {
            const starValue = i + 1;
            const active = hover > 0 ? starValue <= hover : starValue <= rating;
            return (
              <button
                key={i}
                className={`star-button ${active ? 'active' : ''}`}
                onClick={() => setRating(starValue)}
                onMouseEnter={() => setHover(starValue)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${starValue} ${isAr ? 'نجوم' : 'stars'}`}
              >
                <Star size={34} fill={active ? 'currentColor' : 'none'} />
              </button>
            );
          })}
        </div>

        <textarea
          className="rating-comment-input"
          placeholder={copy.addComment}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={500}
        />

        <div className="rating-actions">
          {error&&<p role="alert">{error}</p>}
          <button className="text-button" onClick={onSkip} disabled={submitting}>{copy.skip}</button>
          <button className="primary-button" onClick={() => void submit()} disabled={rating < 1 || submitting}>
            {submitting ? <><Loader2 size={16} className="spin" />{copy.submitting}</> : <><Star size={16} fill="currentColor" />{copy.submit}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
