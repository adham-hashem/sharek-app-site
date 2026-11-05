import { useRef, useState } from 'react';
import { Flag, X, Camera, Check, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';

type Props = {
  language: Language;
  reporterId: string;
  reportedUserId: string;
  reportedUserName?: string | null;
  mealId?: string | null;
  requestId?: string | null;
  threadId?: string | null;
  onClose: () => void;
  onSubmitted?: (reportId: string) => void;
  onBlockOption?: () => void;
};

const REPORT_REASONS: { value: string; ar: string; en: string }[] = [
  { value: 'inappropriate_behavior', ar: 'سلوك غير لائق', en: 'Inappropriate behavior' },
  { value: 'harassment', ar: 'مضايقة أو إساءة', en: 'Harassment or abuse' },
  { value: 'fake_account', ar: 'حساب مزيف أو معلومات غير صحيحة', en: 'Fake account or false info' },
  { value: 'fake_requests', ar: 'طلبات وهمية أو متكررة', en: 'Fake or repeated requests' },
  { value: 'fraud', ar: 'احتيال أو محاولة استغلال', en: 'Fraud or exploitation' },
  { value: 'food_issue', ar: 'مشكلة متعلقة بالوجبة', en: 'Meal-related issue' },
  { value: 'pickup_issue', ar: 'مشكلة أثناء الاستلام', en: 'Pickup issue' },
  { value: 'inappropriate_content', ar: 'محتوى غير مناسب', en: 'Inappropriate content' },
  { value: 'other', ar: 'سبب آخر', en: 'Other reason' },
];

type Phase = 'reason' | 'details' | 'confirm' | 'success';

export function ReportUserSheet({
  language, reporterId, reportedUserId, reportedUserName,
  mealId, requestId, threadId, onClose, onSubmitted, onBlockOption,
}: Props) {
  const isAr = language === 'ar';
  const [phase, setPhase] = useState<Phase>('reason');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reportNumber, setReportNumber] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copy = {
    title: isAr ? 'الإبلاغ عن المستخدم' : 'Report User',
    subtitle: isAr ? 'لماذا تريد الإبلاغ عن هذا المستخدم؟' : 'Why do you want to report this user?',
    reasonLabel: isAr ? 'اختر السبب' : 'Select a reason',
    customReasonPlaceholder: isAr ? 'اكتب السبب هنا...' : 'Write the reason here...',
    descLabel: isAr ? 'اشرح المشكلة بالتفصيل...' : 'Describe the problem in detail...',
    descPlaceholder: isAr ? 'اشرح المشكلة بالتفصيل...' : 'Explain the issue (optional)...',
    evidenceLabel: isAr ? 'إرفاق دليل (اختياري)' : 'Attach evidence (optional)',
    evidenceHint: isAr ? 'صورة أو لقطة شاشة' : 'Photo or screenshot',
    next: isAr ? 'متابعة' : 'Continue',
    back: isAr ? 'رجوع' : 'Back',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    confirmTitle: isAr ? 'إرسال البلاغ؟' : 'Send report?',
    confirmBody: isAr ? 'سيتم إرسال البلاغ إلى فريق SHARek للمراجعة.' : 'Your report will be sent to the SHARek team for review.',
    send: isAr ? 'إرسال البلاغ' : 'Send Report',
    success: isAr ? 'تم إرسال البلاغ بنجاح.' : 'Report submitted successfully.',
    trackingNo: isAr ? 'رقم البلاغ' : 'Report number',
    close: isAr ? 'إغلاق' : 'Close',
    blockUser: isAr ? 'حظر هذا المستخدم' : 'Block this user',
    otherLabel: isAr ? 'سبب آخر' : 'Other reason',
    duplicateError: isAr ? 'لقد أرسلت بلاغًا مشابهًا بالفعل. يرجى الانتظار قبل إرسال بلاغ جديد.' : 'You already submitted a similar report. Please wait before submitting again.',
    rateLimitError: isAr ? 'لقد أرسلت عدداً كبيراً من البلاغات مؤخراً.' : 'You have submitted too many reports recently.',
    genericError: isAr ? 'تعذر إرسال البلاغ. حاول مرة أخرى.' : 'Could not submit report. Try again.',
    uploading: isAr ? 'جارٍ الرفع...' : 'Uploading...',
    removeEvidence: isAr ? 'إزالة' : 'Remove',
    reportedUser: isAr ? 'المُبلّغ عنه' : 'Reported user',
  };

  const selectedReasonObj = REPORT_REASONS.find((r) => r.value === reason);
  const isOther = reason === 'other';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    setError('');
    try {
      const fileName = `${reporterId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('report-evidence')
        .upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('report-evidence')
        .getPublicUrl(fileName);
      setEvidenceUrls((prev) => [...prev, urlData.publicUrl]);
    } catch {
      setError(copy.genericError);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeEvidence = (index: number) => {
    setEvidenceUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!reason || (isOther && !customReason.trim())) return;
    setSubmitting(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('submit_report', {
      p_reported_user_id: reportedUserId,
      p_reason: reason,
      p_custom_reason: isOther ? customReason.trim() : null,
      p_description: description.trim() || null,
      p_evidence_urls: evidenceUrls,
      p_meal_id: mealId ?? null,
      p_request_id: requestId ?? null,
      p_thread_id: threadId ?? null,
    });
    setSubmitting(false);
    if (rpcError) {
      const msg = rpcError.message.toLowerCase();
      if (msg.includes('duplicate')) setError(copy.duplicateError);
      else if (msg.includes('rate limit')) setError(copy.rateLimitError);
      else setError(copy.genericError);
      return;
    }
    if (data) {
      const { data: reportData } = await supabase
        .from('user_reports')
        .select('report_number')
        .eq('id', data as string)
        .maybeSingle();
      if (reportData) setReportNumber((reportData as { report_number: number }).report_number);
      setPhase('success');
      onSubmitted?.(data as string);
    }
  };

  const canProceed = () => {
    if (phase === 'reason') return reason && (!isOther || customReason.trim());
    return true;
  };

  return (
    <div className="share-meal-overlay" dir={isAr ? 'rtl' : 'ltr'} onClick={onClose}>
      <div className="share-meal-sheet report-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={copy.close}><X size={20} /></button>

        {phase === 'reason' && (
          <>
            <div className="report-sheet-header">
              <span className="report-sheet-icon"><Flag size={22} /></span>
              <h2>{copy.title}</h2>
              <p>{copy.subtitle}</p>
              {reportedUserName && <p className="report-reported-name">{copy.reportedUser}: {reportedUserName}</p>}
            </div>
            <div className="report-reasons-list">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  className={`report-reason-item ${reason === r.value ? 'selected' : ''}`}
                  onClick={() => { setReason(r.value); setError(''); }}
                >
                  <span>{isAr ? r.ar : r.en}</span>
                  {reason === r.value && <Check size={16} />}
                </button>
              ))}
            </div>
            {isOther && (
              <div className="share-field-label" style={{ marginTop: '12px' }}>
                <input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder={copy.customReasonPlaceholder}
                  maxLength={200}
                />
              </div>
            )}
            {error && <div className="feedback error" style={{ marginTop: '10px' }}><AlertCircle size={16} />{error}</div>}
            <div className="report-sheet-actions">
              <button className="text-button" onClick={onClose}>{copy.cancel}</button>
              <button
                className="primary-button report-submit-btn"
                disabled={!canProceed()}
                onClick={() => { setError(''); setPhase('details'); }}
              >
                {copy.next}
                {isAr ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
            </div>
          </>
        )}

        {phase === 'details' && (
          <>
            <div className="report-sheet-header">
              <span className="report-sheet-icon"><Flag size={22} /></span>
              <h2>{isAr ? 'تفاصيل البلاغ' : 'Report Details'}</h2>
            </div>
            <div className="share-field-label">
              <small>{copy.descLabel}</small>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={copy.descPlaceholder}
                rows={4}
                maxLength={1000}
              />
            </div>
            <div className="share-field-label">
              <small>{copy.evidenceLabel}</small>
              <small className="share-field-hint">{copy.evidenceHint}</small>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
              <div className="share-photo-gallery">
                {evidenceUrls.map((url, i) => (
                  <div key={i} className="share-photo-thumb">
                    <img src={url} alt="" />
                    <button className="share-photo-remove" onClick={() => removeEvidence(i)}><X size={16} /></button>
                  </div>
                ))}
                <button className="share-photo-add" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <span className="loader-dot" /> : <Camera size={22} />}
                  <span>{uploading ? copy.uploading : copy.evidenceHint}</span>
                </button>
              </div>
            </div>
            {error && <div className="feedback error" style={{ marginTop: '10px' }}><AlertCircle size={16} />{error}</div>}
            <div className="report-sheet-actions">
              <button className="text-button" onClick={() => setPhase('reason')}>{copy.back}</button>
              <button
                className="primary-button report-submit-btn"
                disabled={isOther && !customReason.trim()}
                onClick={() => { setError(''); setPhase('confirm'); }}
              >
                {copy.next}
                {isAr ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
            </div>
          </>
        )}

        {phase === 'confirm' && (
          <>
            <div className="report-sheet-header">
              <span className="report-sheet-icon"><AlertCircle size={22} /></span>
              <h2>{copy.confirmTitle}</h2>
              <p>{copy.confirmBody}</p>
            </div>
            <div className="report-confirm-summary">
              <div className="report-summary-row">
                <span>{isAr ? 'السبب' : 'Reason'}</span>
                <strong>{isAr ? (selectedReasonObj?.ar ?? copy.otherLabel) : (selectedReasonObj?.en ?? copy.otherLabel)}</strong>
              </div>
              {description.trim() && (
                <div className="report-summary-row">
                  <span>{isAr ? 'الوصف' : 'Description'}</span>
                  <strong>{description.length > 80 ? description.slice(0, 80) + '...' : description}</strong>
                </div>
              )}
              {evidenceUrls.length > 0 && (
                <div className="report-summary-row">
                  <span>{isAr ? 'الأدلة' : 'Evidence'}</span>
                  <strong>{evidenceUrls.length} {isAr ? 'ملف' : 'file(s)'}</strong>
                </div>
              )}
            </div>
            {error && <div className="feedback error" style={{ marginTop: '10px' }}><AlertCircle size={16} />{error}</div>}
            <div className="report-sheet-actions">
              <button className="text-button" onClick={() => setPhase('details')} disabled={submitting}>{copy.back}</button>
              <button
                className="primary-button report-submit-btn danger"
                disabled={submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? '...' : copy.send}
                <Flag size={18} />
              </button>
            </div>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="report-success-content">
              <span className="report-success-icon"><Check size={40} /></span>
              <h2>{copy.success}</h2>
              {reportNumber != null && (
                <div className="report-tracking">
                  <span>{copy.trackingNo}</span>
                  <strong>#{reportNumber}</strong>
                </div>
              )}
            </div>
            <div className="report-sheet-actions">
              {onBlockOption && (
                <button className="text-button report-block-option" onClick={() => { onClose(); onBlockOption(); }}>
                  {copy.blockUser}
                </button>
              )}
              <button className="primary-button report-submit-btn" onClick={onClose}>{copy.close}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
