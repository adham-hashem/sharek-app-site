import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, Building2, Check, Clock, Plus, RefreshCw, ShieldCheck, Trash2, X,
  Flag, AlertCircle, FileText, ChevronRight, User as UserIcon, Ban, Eye,
} from 'lucide-react';
import {downloadCsv,printTablePdf} from '@/lib/admin-export';
import {
  supabase, formatPrice,
  type AdminVerificationRequest, type AdminReportListItem, type AdminReportDetail,
  type Language, type ReportAuditEntry, type VerificationPricing,
} from '@/lib/supabase';

type Props = {
  language: Language;
  profileId: string;
  onBack: () => void;
};

type PricingRow = VerificationPricing & { updated_at: string };

export function AdminDashboard({ language, profileId, onBack }: Props) {
  const isAr = language === 'ar';
  const [tab, setTab] = useState<'requests' | 'pricing' | 'reports' | 'users' | 'finance' | 'charities'>('requests');
  const [requests, setRequests] = useState<AdminVerificationRequest[]>([]);
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddPricing, setShowAddPricing] = useState(false);

  const copy = {
    back: isAr ? 'رجوع' : 'Back',
    title: isAr ? 'لوحة الإدارة' : 'Admin Dashboard',
    tabRequests: isAr ? 'طلبات التوثيق' : 'Verification Requests',
    tabPricing: isAr ? 'أسعار التوثيق' : 'Pricing',
    tabReports: isAr ? 'البلاغات' : 'Reports',
    tabUsers: isAr ? 'المستخدمون' : 'Users',
    tabFinance: isAr ? 'الدعم المالي' : 'Financial support',
    noRequests: isAr ? 'لا توجد طلبات توثيق' : 'No verification requests',
    noPricing: isAr ? 'لا توجد أسعار مضافة' : 'No pricing configured',
    noReports: isAr ? 'لا توجد بلاغات' : 'No reports',
    approve: isAr ? 'بانتظار تفعيل الدفع' : 'Payment unavailable',
    reject: isAr ? 'رفض' : 'Reject',
    refund: isAr ? 'الاسترداد غير متاح' : 'Refund unavailable',
    user: isAr ? 'المستخدم' : 'User',
    amount: isAr ? 'المبلغ' : 'Amount',
    status: isAr ? 'الحالة' : 'Status',
    date: isAr ? 'التاريخ' : 'Date',
    actions: isAr ? 'إجراءات' : 'Actions',
    statusUnpaid: isAr ? 'غير مدفوع' : 'Unpaid',
    statusPending: isAr ? 'قيد المراجعة' : 'Under review',
    statusApproved: isAr ? 'موثق' : 'Verified',
    statusRejected: isAr ? 'مرفوض' : 'Rejected',
    statusRefunded: isAr ? 'مسترد' : 'Refunded',
    addPricing: isAr ? 'إضافة سعر' : 'Add pricing',
    countryCode: isAr ? 'رمز الدولة' : 'Country code',
    countryName: isAr ? 'اسم الدولة' : 'Country name',
    currencyCode: isAr ? 'رمز العملة' : 'Currency code',
    currencySymbol: isAr ? 'رمز العملة' : 'Currency symbol',
    amountLabel: isAr ? 'المبلغ (بالوحدة الصغرى)' : 'Amount (smallest unit)',
    save: isAr ? 'حفظ' : 'Save',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    delete: isAr ? 'حذف' : 'Delete',
    deactivate: isAr ? 'تعطيل' : 'Deactivate',
    activate: isAr ? 'تفعيل' : 'Activate',
    error: isAr ? 'حدث خطأ' : 'An error occurred',
    totalRequests: isAr ? 'إجمالي الطلبات' : 'Total requests',
    pending: isAr ? 'قيد المراجعة' : 'Pending',
    approved: isAr ? 'موثق' : 'Approved',
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      UNPAID: copy.statusUnpaid, PAID_PENDING_REVIEW: copy.statusPending,
      APPROVED: copy.statusApproved, REJECTED: copy.statusRejected, REFUNDED: copy.statusRefunded,
    };
    return map[status] ?? status;
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      UNPAID: '#967f70', PAID_PENDING_REVIEW: '#d97706',
      APPROVED: '#0f766e', REJECTED: '#b14c38', REFUNDED: '#967f70',
    };
    return map[status] ?? '#967f70';
  };

  const fetchData = useCallback(async () => {
    const [reqRes, priceRes] = await Promise.all([
      supabase.rpc('get_verification_requests_admin'),
      supabase.rpc('get_all_verification_pricing'),
    ]);
    if (reqRes.data) setRequests(reqRes.data as AdminVerificationRequest[]);
    if (priceRes.data) setPricing(priceRes.data as PricingRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    const { error } = await supabase.rpc('approve_verification_request', { p_request_id: requestId, p_admin_id: profileId });
    setActionLoading(null);
    if (error) { alert(copy.error); return; }
    void fetchData();
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    const { error } = await supabase.rpc('reject_verification_request', { p_request_id: requestId, p_admin_id: profileId, p_notes: '' });
    setActionLoading(null);
    if (error) { alert(copy.error); return; }
    void fetchData();
  };

  const handleRefund = async (requestId: string) => {
    setActionLoading(requestId);
    const { error } = await supabase.rpc('refund_verification_request', { p_request_id: requestId, p_admin_id: profileId });
    setActionLoading(null);
    if (error) { alert(copy.error); return; }
    void fetchData();
  };

  const handleTogglePricing = async (row: PricingRow) => {
    const { error } = await supabase.from('verification_pricing').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) { alert(copy.error); return; }
    void fetchData();
  };

  const handleDeletePricing = async (row: PricingRow) => {
    const { error } = await supabase.from('verification_pricing').delete().eq('id', row.id);
    if (error) { alert(copy.error); return; }
    void fetchData();
  };

  const pendingCount = requests.filter((r) => r.status === 'PAID_PENDING_REVIEW').length;
  const approvedCount = requests.filter((r) => r.status === 'APPROVED').length;

  return (
    <div className="notif-settings-page admin-dashboard" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="notif-center-header">
        <button className="icon-button" onClick={onBack} aria-label={copy.back}><ArrowLeft size={20} /></button>
        <h2>{copy.title}</h2>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'requests' ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab('requests')}>
          <ShieldCheck size={16} />{copy.tabRequests}
          {pendingCount > 0 && <span className="admin-tab-badge">{pendingCount}</span>}
        </button>
        <button className={tab === 'pricing' ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab('pricing')}>
          <Plus size={16} />{copy.tabPricing}
        </button>
        <button className={tab === 'reports' ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab('reports')}>
          <Flag size={16} />{copy.tabReports}
        </button>
        <button className={tab === 'users' ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab('users')}>
          <UserIcon size={16} />{copy.tabUsers}
        </button>
        <button className={tab === 'finance' ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab('finance')}>
          <FileText size={16} />{copy.tabFinance}
        </button>
        <button className={tab === 'charities' ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab('charities')}>
          <Building2 size={16} />{isAr ? 'المؤسسات الخيرية' : 'Charities'}
        </button>
      </div>

      {loading ? (
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      ) : tab === 'requests' ? (
        <div className="admin-body">
          <div className="admin-stats-row">
            <div className="admin-stat"><strong>{requests.length}</strong><span>{copy.totalRequests}</span></div>
            <div className="admin-stat"><strong>{pendingCount}</strong><span>{copy.pending}</span></div>
            <div className="admin-stat"><strong>{approvedCount}</strong><span>{copy.approved}</span></div>
          </div>

          {requests.length === 0 ? (
            <div className="admin-empty">{copy.noRequests}</div>
          ) : (
            <div className="admin-requests-list">
              {requests.map((req) => (
                <div key={req.id} className="admin-request-card">
                  <div className="admin-request-header">
                    <div className="admin-request-user">
                      {req.avatar_url
                        ? <img src={req.avatar_url} alt="" className="admin-request-avatar" />
                        : <span className="admin-request-avatar placeholder"><ShieldCheck size={18} /></span>}
                      <div>
                        <strong>{req.display_name ?? '—'}</strong>
                        <small>{req.country_code} · {new Date(req.created_at).toLocaleDateString(isAr ? 'ar' : 'en')}</small>
                      </div>
                    </div>
                    <span className="admin-status-pill" style={{ background: statusColor(req.status) + '22', color: statusColor(req.status) }}>
                      {req.status === 'APPROVED' ? <BadgeCheck size={13} /> : <Clock size={13} />}
                      {statusLabel(req.status)}
                    </span>
                  </div>
                  <div className="admin-request-amount">
                    {formatPrice(req.amount, req.currency_symbol, language)}
                  </div>
                  {req.status === 'PAID_PENDING_REVIEW' && (
                    <div className="admin-request-actions">
                      <button className="admin-action-btn approve" disabled>
                        {actionLoading === req.id ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}{copy.approve}
                      </button>
                      <button className="admin-action-btn reject" onClick={() => void handleReject(req.id)} disabled={actionLoading === req.id}>
                        <X size={14} />{copy.reject}
                      </button>
                    </div>
                  )}
                  {req.status === 'APPROVED' && (
                    <div className="admin-request-actions">
                      <button className="admin-action-btn refund" disabled>
                        <RefreshCw size={14} />{copy.refund}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'reports' ? (
        <AdminReportsTab language={language} />
      ) : tab === 'users' ? (
        <AdminUsersTab language={language} />
      ) : tab === 'charities' ? (
        <AdminCharitiesTab language={language} />
      ) : tab === 'finance' ? (
        <div className="admin-body"><div className="admin-empty">{isAr?'الدعم المالي غير مفعّل حاليًا. لا توجد معاملات مالية مؤكدة لعرضها.':'Financial support is not enabled. There are no confirmed transactions to report.'}</div></div>
      ) : (
        <div className="admin-body">
          <button className="admin-add-pricing-btn" onClick={() => setShowAddPricing(true)}>
            <Plus size={16} />{copy.addPricing}
          </button>

          {pricing.length === 0 ? (
            <div className="admin-empty">{copy.noPricing}</div>
          ) : (
            <div className="admin-pricing-list">
              {pricing.map((row) => (
                <div key={row.id} className="admin-pricing-card">
                  <div className="admin-pricing-info">
                    <strong>{row.country_name}</strong>
                    <small>{row.country_code} · {row.currency_code} {row.currency_symbol}</small>
                  </div>
                  <div className="admin-pricing-amount">
                    {formatPrice(row.amount, row.currency_symbol, language)}
                  </div>
                  <div className="admin-pricing-actions">
                    <span className={`admin-pricing-status ${row.is_active ? 'active' : 'inactive'}`}>
                      {row.is_active ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
                    </span>
                    <button className="admin-action-btn toggle" onClick={() => void handleTogglePricing(row)}>
                      {row.is_active ? copy.deactivate : copy.activate}
                    </button>
                    <button className="admin-action-btn delete" onClick={() => void handleDeletePricing(row)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAddPricing && (
            <AddPricingModal
              language={language}
              onSave={async (data) => {
                const { error } = await supabase.rpc('update_verification_price', {
                  p_country_code: data.countryCode,
                  p_country_name: data.countryName,
                  p_currency_code: data.currencyCode,
                  p_currency_symbol: data.currencySymbol,
                  p_amount: data.amount,
                });
                if (error) { alert(copy.error); return; }
                setShowAddPricing(false);
                void fetchData();
              }}
              onClose={() => setShowAddPricing(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

const REPORT_STATUS_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  new: { ar: 'جديد', en: 'New', color: '#d97706' },
  under_review: { ar: 'قيد المراجعة', en: 'Under Review', color: '#3b82f6' },
  action_taken: { ar: 'تم اتخاذ إجراء', en: 'Action Taken', color: '#0f766e' },
  closed: { ar: 'تم الحل', en: 'Resolved', color: '#0f766e' },
  unfounded: { ar: 'مرفوض', en: 'Rejected', color: '#967f70' },
};

const REPORT_REASON_LABELS: Record<string, { ar: string; en: string }> = {
  inappropriate_behavior: { ar: 'سلوك غير لائق', en: 'Inappropriate behavior' },
  harassment: { ar: 'مضايقة أو إساءة', en: 'Harassment' },
  fake_account: { ar: 'حساب مزيف', en: 'Fake account' },
  fake_requests: { ar: 'طلبات وهمية', en: 'Fake requests' },
  fraud: { ar: 'احتيال', en: 'Fraud' },
  food_issue: { ar: 'مشكلة وجبة', en: 'Food issue' },
  pickup_issue: { ar: 'مشكلة استلام', en: 'Pickup issue' },
  inappropriate_content: { ar: 'محتوى غير مناسب', en: 'Inappropriate content' },
  other: { ar: 'سبب آخر', en: 'Other' },
};

const ADMIN_ACTIONS: { value: string; ar: string; en: string }[] = [
  { value: 'none', ar: 'لا يوجد إجراء', en: 'No action' },
  { value: 'warning', ar: 'تحذير المستخدم', en: 'Warn user' },
  { value: 'limited_restriction', ar: 'تقييد بعض الوظائف مؤقتًا', en: 'Temporary restriction' },
  { value: 'temporary_suspension', ar: 'إيقاف مؤقت', en: 'Temporary suspension' },
  { value: 'permanent_suspension', ar: 'إيقاف نهائي', en: 'Permanent suspension' },
  { value: 'remove_meal', ar: 'إزالة وجبة مخالفة', en: 'Remove meal' },
  { value: 'close_report', ar: 'إغلاق البلاغ', en: 'Close report' },
];

type UserStats={total_users:number;new_users:number;previous_new_users:number;beneficiaries:number;donors:number;active_daily:null;restaurants:null;charities:null;organizations:null};
const localDate=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
function AdminUsersTab({language}:{language:Language}){
  const isAr=language==='ar';
  const [from,setFrom]=useState(()=>localDate(new Date()));
  const [to,setTo]=useState(()=>localDate(new Date()));
  const [stats,setStats]=useState<UserStats|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const load=useCallback(async()=>{
    const start=new Date(`${from}T00:00:00`),end=new Date(`${to}T00:00:00`);end.setDate(end.getDate()+1);
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end){setError(isAr?'اختر فترة صحيحة.':'Choose a valid period.');return;}
    setLoading(true);setError('');
    const result=await supabase.rpc('get_admin_user_stats',{p_from:start.toISOString(),p_to:end.toISOString()});
    setLoading(false);if(result.error){setError(isAr?'تعذر تحميل الإحصائيات.':'Could not load statistics.');return;}
    setStats(result.data as UserStats);
  },[from,to,isAr]);
  useEffect(()=>{void load();},[load]);
  const items=stats?[
    [isAr?'إجمالي المستخدمين':'Total users',stats.total_users],
    [isAr?'مستخدمون جدد في الفترة':'New users in period',stats.new_users],
    [isAr?'مستخدمون جدد في الفترة السابقة':'New users in previous period',stats.previous_new_users],
    [isAr?'المستفيدون':'Beneficiaries',stats.beneficiaries],
    [isAr?'مقدمو الطعام':'Food donors',stats.donors],
  ] as [string,number][]:[];
  const exportStats=(format:'csv'|'pdf')=>{if(!stats)return;const title=isAr?'إحصائيات المستخدمين':'User statistics',period=`${from} – ${to}`;
    const work=format==='csv'?downloadCsv(`SHARek-users-${from}-${to}.csv`,title,language,[isAr?'المؤشر':'Metric',isAr?'العدد':'Count'],items,period)
      :printTablePdf(title,language,[isAr?'المؤشر':'Metric',isAr?'العدد':'Count'],items,period);
    void work.catch(()=>setError(isAr?'تعذر تصدير التقرير.':'Could not export the report.'));
  };
  return <div className="admin-body">
    <div className="admin-report-filters admin-stats-filters">
      <label>{isAr?'من':'From'}<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label>
      <label>{isAr?'إلى':'To'}<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label>
      <button className="admin-report-view-btn" disabled={!stats||loading} onClick={()=>exportStats('csv')}>{isAr?'تصدير CSV':'Export CSV'}</button>
      <button className="admin-report-view-btn" disabled={!stats||loading} onClick={()=>exportStats('pdf')}>{isAr?'تصدير PDF':'Export PDF'}</button>
    </div>
    {loading&&<div className="community-loading"><div className="loader-dot"/><span>SHARek</span></div>}
    {error&&<div className="feedback error" role="alert">{error}</div>}
    {!loading&&stats&&<><div className="admin-stats-row">{items.map(([label,value])=><div className="admin-stat" key={label}><strong>{value.toLocaleString(isAr?'ar-EG':'en-US')}</strong><span>{label}</span></div>)}</div>
      <p className="admin-data-note">{isAr?'النشاط اليومي وتصنيف المطاعم والجمعيات والمؤسسات غير متاح لأن البيانات اللازمة غير مسجلة في الحسابات الحالية.':'Daily activity and restaurant, charity and organization counts are unavailable because the current profiles do not record those fields.'}</p>
    </>}
  </div>;
}

function AdminReportsTab({ language }: { language: Language }) {
  const isAr = language === 'ar';
  const [reports, setReports] = useState<AdminReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterReason, setFilterReason] = useState<string | null>(null);
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const c = {
    filterAll: isAr ? 'الكل' : 'All',
    filterNew: isAr ? 'جديد' : 'New',
    filterReview: isAr ? 'قيد المراجعة' : 'Under Review',
    filterAction: isAr ? 'تم اتخاذ إجراء' : 'Action Taken',
    filterClosed: isAr ? 'تم الحل' : 'Resolved',
    filterUnfounded: isAr ? 'مرفوض' : 'Rejected',
    reportNo: isAr ? 'رقم البلاغ' : 'Report #',
    reporter: isAr ? 'المُبلِّغ' : 'Reporter',
    reported: isAr ? 'المُبلَّغ عنه' : 'Reported User',
    reason: isAr ? 'السبب' : 'Reason',
    description: isAr ? 'الوصف' : 'Description',
    noDesc: isAr ? 'لا يوجد وصف' : 'No description',
    relatedMeal: isAr ? 'الوجبة المرتبطة' : 'Related Meal',
    relatedRequest: isAr ? 'الطلب المرتبط' : 'Related Request',
    none: isAr ? 'لا يوجد' : 'None',
    viewDetails: isAr ? 'عرض التفاصيل' : 'View Details',
    noReports: isAr ? 'لا توجد بلاغات' : 'No reports',
    loading: isAr ? 'جارٍ التحميل...' : 'Loading...',
    filterByReason: isAr ? 'حسب السبب' : 'By reason',
    date: isAr ? 'التاريخ' : 'Date',
    evidence: isAr ? 'الأدلة' : 'Evidence',
    evidenceFiles: isAr ? 'ملفات' : 'file(s)',
    customReason: isAr ? 'سبب مخصص' : 'Custom reason',
    auditLog: isAr ? 'سجل الإجراءات' : 'Audit Log',
    adminNotes: isAr ? 'ملاحظات الإدارة' : 'Admin Notes',
    saveNotes: isAr ? 'حفظ الملاحظات' : 'Save Notes',
    takeAction: isAr ? 'اتخاذ إجراء' : 'Take Action',
    applyAction: isAr ? 'تطبيق' : 'Apply',
    back: isAr ? 'رجوع للقائمة' : 'Back to list',
    action: isAr ? 'الإجراء' : 'Action',
    by: isAr ? 'بواسطة' : 'By',
    error: isAr ? 'حدث خطأ' : 'An error occurred',
    notesPlaceholder: isAr ? 'أضف ملاحظات داخلية...' : 'Add internal notes...',
    reviewer: isAr ? 'المراجع' : 'Reviewer',
    reviewedAt: isAr ? 'تاريخ المراجعة' : 'Reviewed at',
  };

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const end=to?new Date(`${to}T00:00:00`):null;end?.setDate(end.getDate()+1);
    const { data, error } = await supabase.rpc('get_admin_reports_by_period', {
      p_from:from?new Date(`${from}T00:00:00`).toISOString():null,
      p_to:end?.toISOString()??null,
      p_status: filterStatus,
      p_reason: filterReason,
      p_limit: 100,
      p_offset: 0,
    });
    setLoadError(Boolean(error));
    if (!error && data) setReports(data as AdminReportListItem[]);
    else setReports([]);
    setLoading(false);
  }, [filterStatus, filterReason,from,to]);

  useEffect(() => { void fetchReports(); }, [fetchReports]);

  const reasonLabel = (reason: string) => {
    const r = REPORT_REASON_LABELS[reason];
    return r ? (isAr ? r.ar : r.en) : reason;
  };
  const exportReports=async(format:'csv'|'pdf')=>{
    const all:AdminReportListItem[]=[];let offset=0;
    const end=to?new Date(`${to}T00:00:00`):null;end?.setDate(end.getDate()+1);
    while(true){
      const {data,error}=await supabase.rpc('get_admin_reports_by_period',{p_from:from?new Date(`${from}T00:00:00`).toISOString():null,p_to:end?.toISOString()??null,p_status:filterStatus,p_reason:filterReason,p_limit:100,p_offset:offset});
      if(error){alert(isAr?'تعذر تصدير البلاغات.':'Could not export reports.');return;}
      const page=(data??[]) as AdminReportListItem[];all.push(...page);if(page.length<100)break;offset+=100;
    }
    const title=isAr?'تقرير البلاغات':'Reports',headers=[c.reportNo,c.reporter,c.reported,c.reason,c.date,isAr?'الحالة':'Status'];
    const rows=all.map(row=>[row.report_number,row.reporter_name,row.reported_name,reasonLabel(row.reason),row.created_at,isAr?statusInfo(row.status).ar:statusInfo(row.status).en]);
    const period=`${from||'…'} – ${to||'…'}`;
    try{if(format==='csv')await downloadCsv('SHARek-reports.csv',title,language,headers,rows,period);
      else await printTablePdf(title,language,headers,rows,period);
    }catch{alert(isAr?'تعذر تصدير البلاغات.':'Could not export reports.');}
  };

  const statusInfo = (status: string) => REPORT_STATUS_LABELS[status] ?? { ar: status, en: status, color: '#967f70' };

  if (selectedReportId) {
    return <AdminReportDetail language={language} reportId={selectedReportId} onBack={() => { setSelectedReportId(null); void fetchReports(); }} />;
  }

  const statusFilters = [
    { value: null, label: c.filterAll },
    { value: 'new', label: c.filterNew },
    { value: 'under_review', label: c.filterReview },
    { value: 'action_taken', label: c.filterAction },
    { value: 'closed', label: c.filterClosed },
    { value: 'unfounded', label: c.filterUnfounded },
  ];

  return (
    <div className="admin-body">
      <div className="admin-report-filters">
        <button className="admin-report-view-btn" onClick={()=>void exportReports('csv')}>{isAr?'تصدير CSV':'Export CSV'}</button>
        <button className="admin-report-view-btn" onClick={()=>void exportReports('pdf')}>{isAr?'تصدير PDF':'Export PDF'}</button>
        <div className="admin-stats-filters"><label>{isAr?'من':'From'}<input type="date" value={from} max={to||undefined} onChange={event=>setFrom(event.target.value)}/></label><label>{isAr?'إلى':'To'}<input type="date" value={to} min={from||undefined} onChange={event=>setTo(event.target.value)}/></label></div>
        <div className="admin-filter-row">
          {statusFilters.map((f) => (
            <button
              key={f.value ?? 'all'}
              className={`admin-filter-chip ${filterStatus === f.value ? 'active' : ''}`}
              onClick={() => setFilterStatus(f.value)}
            >{f.label}</button>
          ))}
        </div>
        <select
          className="admin-filter-select"
          value={filterReason ?? ''}
          onChange={(e) => setFilterReason(e.target.value || null)}
        >
          <option value="">{c.filterByReason}</option>
          {Object.entries(REPORT_REASON_LABELS).map(([val, info]) => (
            <option key={val} value={val}>{isAr ? info.ar : info.en}</option>
          ))}
        </select>
      </div>

      {loadError&&<div className="feedback error" role="alert">{c.error}</div>}
      {loading ? (
        <div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div>
      ) : reports.length === 0 ? (
        <div className="admin-empty">{c.noReports}</div>
      ) : (
        <div className="admin-requests-list">
          {reports.map((r) => {
            const si = statusInfo(r.status);
            return (
              <div key={r.id} className="admin-request-card admin-report-card" onClick={() => setSelectedReportId(r.id)}>
                <div className="admin-request-header">
                  <div className="admin-request-user">
                    <span className="admin-report-number">#{r.report_number}</span>
                    <div>
                      <strong>{r.reported_name ?? '—'}</strong>
                      <small>{c.reporter}: {r.reporter_name ?? '—'} · {new Date(r.created_at).toLocaleDateString(isAr ? 'ar' : 'en')}</small>
                    </div>
                  </div>
                  <span className="admin-status-pill" style={{ background: si.color + '22', color: si.color }}>
                    {isAr ? si.ar : si.en}
                  </span>
                </div>
                <div className="admin-report-reason">
                  <Flag size={14} /> {reasonLabel(r.reason)}
                  {r.evidence_urls && r.evidence_urls.length > 0 && (
                    <span className="admin-report-evidence-count">
                      <FileText size={12} /> {r.evidence_urls.length} {c.evidenceFiles}
                    </span>
                  )}
                </div>
                <button className="admin-report-view-btn">
                  {c.viewDetails} <ChevronRight size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminReportDetail({ language, reportId, onBack }: { language: Language; reportId: string; onBack: () => void }) {
  const isAr = language === 'ar';
  const [report, setReport] = useState<AdminReportDetail | null>(null);
  const [auditLog, setAuditLog] = useState<ReportAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState('');

  const c = {
    back: isAr ? 'رجوع للقائمة' : 'Back to list',
    reporter: isAr ? 'صاحب البلاغ' : 'Reporter',
    reportedUser: isAr ? 'المستخدم المُبلَّغ عنه' : 'Reported User',
    reason: isAr ? 'السبب' : 'Reason',
    customReason: isAr ? 'سبب مخصص' : 'Custom reason',
    description: isAr ? 'الوصف' : 'Description',
    noDesc: isAr ? 'لا يوجد وصف' : 'No description',
    evidence: isAr ? 'الأدلة المرفقة' : 'Attached Evidence',
    noEvidence: isAr ? 'لا توجد أدلة' : 'No evidence attached',
    relatedMeal: isAr ? 'الوجبة المرتبطة' : 'Related Meal',
    relatedRequest: isAr ? 'الطلب المرتبط' : 'Related Request',
    relatedThread: isAr ? 'المحادثة المرتبطة' : 'Related Thread',
    none: isAr ? 'لا يوجد' : 'None',
    status: isAr ? 'الحالة' : 'Status',
    adminAction: isAr ? 'الإجراء الإداري' : 'Admin Action',
    selectAction: isAr ? 'اختر الإجراء' : 'Select action',
    selectStatus: isAr ? 'اختر الحالة' : 'Select status',
    adminNotes: isAr ? 'ملاحظات الإدارة' : 'Admin Notes',
    notesPlaceholder: isAr ? 'أضف ملاحظات داخلية...' : 'Add internal notes...',
    apply: isAr ? 'تطبيق' : 'Apply',
    auditLog: isAr ? 'سجل الإجراءات' : 'Audit Log',
    action: isAr ? 'الإجراء' : 'Action',
    from: isAr ? 'من' : 'From',
    to: isAr ? 'إلى' : 'To',
    by: isAr ? 'بواسطة' : 'By',
    noAudit: isAr ? 'لا توجد إجراءات مسجلة' : 'No actions recorded',
    error: isAr ? 'حدث خطأ' : 'An error occurred',
    success: isAr ? 'تم بنجاح' : 'Done',
    reportNo: isAr ? 'بلاغ رقم' : 'Report #',
    created: isAr ? 'تاريخ البلاغ' : 'Created',
    reviewer: isAr ? 'المراجع' : 'Reviewer',
    notReviewed: isAr ? 'لم يُراجع بعد' : 'Not reviewed yet',
  };

  const reasonLabel = (reason: string) => {
    const r = REPORT_REASON_LABELS[reason];
    return r ? (isAr ? r.ar : r.en) : reason;
  };

  const statusInfo = (status: string) => REPORT_STATUS_LABELS[status] ?? { ar: status, en: status, color: '#967f70' };

  const fetchDetail = useCallback(async () => {
    const [detailRes, auditRes] = await Promise.all([
      supabase.rpc('get_admin_report_details', { p_report_id: reportId }),
      supabase.rpc('get_report_audit_log', { p_report_id: reportId }),
    ]);
    if (detailRes.data) {
      const d = Array.isArray(detailRes.data) ? detailRes.data[0] : detailRes.data;
      if (d) {
        setReport(d as AdminReportDetail);
        setSelectedStatus((d as AdminReportDetail).status);
        setSelectedAction((d as AdminReportDetail).admin_action ?? '');
        setAdminNotes((d as AdminReportDetail).admin_notes ?? '');
      }
    }
    if (auditRes.data) setAuditLog(auditRes.data as ReportAuditEntry[]);
    setLoading(false);
  }, [reportId]);

  useEffect(() => { void fetchDetail(); }, [fetchDetail]);

  const handleApplyAction = async () => {
    if (!selectedStatus) return;
    setActionLoading(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('update_report_status', {
      p_report_id: reportId,
      p_status: selectedStatus,
      p_admin_action: selectedAction || null,
      p_admin_notes: adminNotes || null,
    });
    setActionLoading(false);
    if (rpcError) { setError(c.error); return; }
    void fetchDetail();
  };

  if (loading) return <div className="admin-body"><div className="community-loading"><div className="loader-dot" /><span>SHARek</span></div></div>;
  if (!report) return <div className="admin-body"><div className="admin-empty">{c.error}</div></div>;

  const si = statusInfo(report.status);
  const detailRows:unknown[][]=[
    [c.reportNo,report.report_number],[c.reporter,report.reporter_name],[c.reportedUser,report.reported_name],
    [c.reason,reasonLabel(report.reason)],[c.description,report.description],[c.status,isAr?si.ar:si.en],
    [c.created,report.created_at],[c.relatedMeal,report.meal_id],[c.relatedRequest,report.request_id],
    [c.adminAction,report.admin_action],[c.adminNotes,report.admin_notes],
    ...auditLog.map(entry=>[c.auditLog,`${entry.created_at} · ${entry.admin_name??''} · ${entry.action} · ${entry.notes??''}`])
  ];
  const exportDetail=(format:'csv'|'pdf')=>{
    const title=`${c.reportNo} ${report.report_number}`,headers=[isAr?'البند':'Field',isAr?'القيمة':'Value'];
    const work=format==='csv'?downloadCsv(`SHARek-report-${report.report_number}.csv`,title,language,headers,detailRows,report.created_at)
      :printTablePdf(title,language,headers,detailRows,report.created_at);
    void work.catch(()=>setError(c.error));
  };

  return (
    <div className="admin-body admin-report-detail" dir={isAr ? 'rtl' : 'ltr'}>
      <button className="admin-back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> {c.back}
      </button>
      <div className="admin-detail-export"><button className="admin-report-view-btn" onClick={()=>exportDetail('csv')}>{isAr?'تصدير CSV':'Export CSV'}</button><button className="admin-report-view-btn" onClick={()=>exportDetail('pdf')}>{isAr?'تصدير PDF':'Export PDF'}</button></div>

      <div className="admin-report-detail-header">
        <span className="admin-report-number-large">{c.reportNo} {report.report_number}</span>
        <span className="admin-status-pill" style={{ background: si.color + '22', color: si.color }}>
          {isAr ? si.ar : si.en}
        </span>
      </div>

      {/* Reporter & Reported User */}
      <div className="admin-report-section">
        <h3>{c.reporter}</h3>
        <div className="admin-report-user-card">
          {report.reporter_avatar
            ? <img src={report.reporter_avatar} alt="" className="admin-request-avatar" />
            : <span className="admin-request-avatar placeholder"><UserIcon size={18} /></span>}
          <div>
            <strong>{report.reporter_name ?? '—'}</strong>
            <small>{new Date(report.created_at).toLocaleString(isAr ? 'ar-EG' : 'en-US')}</small>
          </div>
        </div>
      </div>

      <div className="admin-report-section">
        <h3>{c.reportedUser}</h3>
        <div className="admin-report-user-card">
          {report.reported_avatar
            ? <img src={report.reported_avatar} alt="" className="admin-request-avatar" />
            : <span className="admin-request-avatar placeholder"><UserIcon size={18} /></span>}
          <div>
            <strong>{report.reported_name ?? '—'}</strong>
          </div>
        </div>
      </div>

      {/* Report info */}
      <div className="admin-report-section">
        <h3>{c.reason}</h3>
        <div className="admin-report-info-row">
          <Flag size={16} />
          <strong>{reasonLabel(report.reason)}</strong>
        </div>
        {report.custom_reason && (
          <div className="admin-report-info-row">
            <small>{c.customReason}: {report.custom_reason}</small>
          </div>
        )}
        {report.description && (
          <div className="admin-report-desc">
            <small>{c.description}</small>
            <p>{report.description}</p>
          </div>
        )}
      </div>

      {/* Related activity */}
      <div className="admin-report-section">
        <h3>{isAr ? 'النشاط المرتبط' : 'Related Activity'}</h3>
        <div className="admin-report-related">
          <div><span>{c.relatedMeal}</span><strong>{report.meal_id ? report.meal_id.slice(0, 8) + '...' : c.none}</strong></div>
          <div><span>{c.relatedRequest}</span><strong>{report.request_id ? report.request_id.slice(0, 8) + '...' : c.none}</strong></div>
          <div><span>{c.relatedThread}</span><strong>{report.thread_id ? report.thread_id.slice(0, 8) + '...' : c.none}</strong></div>
        </div>
      </div>

      {/* Evidence */}
      <div className="admin-report-section">
        <h3>{c.evidence}</h3>
        {report.evidence_urls && report.evidence_urls.length > 0 ? (
          <div className="admin-report-evidence-grid">
            {report.evidence_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="admin-report-evidence-item">
                <img src={url} alt={`Evidence ${i + 1}`} />
              </a>
            ))}
          </div>
        ) : (
          <div className="admin-empty">{c.noEvidence}</div>
        )}
      </div>

      {/* Admin action panel */}
      <div className="admin-report-section admin-action-panel">
        <h3>{c.adminAction}</h3>
        <div className="admin-action-form">
          <label>
            <small>{c.status}</small>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              {Object.entries(REPORT_STATUS_LABELS).map(([val, info]) => (
                <option key={val} value={val}>{isAr ? info.ar : info.en}</option>
              ))}
            </select>
          </label>
          <label>
            <small>{c.selectAction}</small>
            <select value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)}>
              <option value="">{c.selectAction}</option>
              {ADMIN_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{isAr ? a.ar : a.en}</option>
              ))}
            </select>
          </label>
          <label>
            <small>{c.adminNotes}</small>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder={c.notesPlaceholder}
              rows={3}
              maxLength={2000}
            />
          </label>
          {error && <div className="feedback error"><AlertCircle size={16} />{error}</div>}
          <button
            className="primary-button admin-apply-btn"
            disabled={actionLoading || !selectedStatus}
            onClick={() => void handleApplyAction()}
          >
            {actionLoading ? '...' : c.apply}
            <Check size={16} />
          </button>
        </div>
      </div>

      {/* Audit log */}
      <div className="admin-report-section">
        <h3>{c.auditLog}</h3>
        {auditLog.length === 0 ? (
          <div className="admin-empty">{c.noAudit}</div>
        ) : (
          <div className="admin-audit-list">
            {auditLog.map((entry) => (
              <div key={entry.id} className="admin-audit-entry">
                <div className="admin-audit-action">
                  <Ban size={14} />
                  <strong>{entry.action}</strong>
                </div>
                <div className="admin-audit-meta">
                  <small>{c.from}: {isAr ? (REPORT_STATUS_LABELS[entry.previous_status]?.ar ?? entry.previous_status) : (REPORT_STATUS_LABELS[entry.previous_status]?.en ?? entry.previous_status)}</small>
                  <small>→ {isAr ? (REPORT_STATUS_LABELS[entry.new_status]?.ar ?? entry.new_status) : (REPORT_STATUS_LABELS[entry.new_status]?.en ?? entry.new_status)}</small>
                </div>
                <div className="admin-audit-by">
                  <small>{c.by}: {entry.admin_name ?? '—'} · {new Date(entry.created_at).toLocaleString(isAr ? 'ar-EG' : 'en-US')}</small>
                </div>
                {entry.notes && <div className="admin-audit-notes"><small>{entry.notes}</small></div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddPricingModal({ language, onSave, onClose }: {
  language: Language;
  onSave: (data: { countryCode: string; countryName: string; currencyCode: string; currencySymbol: string; amount: number }) => void;
  onClose: () => void;
}) {
  const isAr = language === 'ar';
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [amount, setAmount] = useState('');

  const c = {
    title: isAr ? 'إضافة سعر توثيق' : 'Add verification pricing',
    countryCode: isAr ? 'رمز الدولة (مثل EG)' : 'Country code (e.g. EG)',
    countryName: isAr ? 'اسم الدولة' : 'Country name',
    currencyCode: isAr ? 'رمز العملة (مثل EGP)' : 'Currency code (e.g. EGP)',
    currencySymbol: isAr ? 'رمز العملة (مثل ج.م)' : 'Currency symbol (e.g. ج.م)',
    amount: isAr ? 'المبلغ بالوحدة الصغرى (مثل 10000)' : 'Amount in smallest unit (e.g. 10000)',
    save: isAr ? 'حفظ' : 'Save',
    cancel: isAr ? 'إلغاء' : 'Cancel',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{c.title}</h3>
        <div className="admin-pricing-form">
          <input placeholder={c.countryCode} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} maxLength={2} />
          <input placeholder={c.countryName} value={countryName} onChange={(e) => setCountryName(e.target.value)} />
          <input placeholder={c.currencyCode} value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} />
          <input placeholder={c.currencySymbol} value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} />
          <input type="number" placeholder={c.amount} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button className="text-button" style={{ flex: 1 }} onClick={onClose}>{c.cancel}</button>
          <button
            className="primary-button"
            style={{ flex: 1 }}
            onClick={() => onSave({ countryCode, countryName, currencyCode, currencySymbol, amount: parseInt(amount, 10) })}
            disabled={!countryCode || !countryName || !currencyCode || !currencySymbol || !amount || parseInt(amount, 10) <= 0}
          >{c.save}</button>
        </div>
      </div>
    </div>
  );
}

type AdminCharity={id:string;name:string;address:string;logo_url:string|null;latitude:number;longitude:number;status:'pending'|'approved'|'rejected';verified:boolean;suggester_name:string|null;created_at:string};
const blankCharity=():AdminCharity=>({id:'',name:'',address:'',logo_url:'',latitude:NaN,longitude:NaN,status:'approved',verified:false,suggester_name:null,created_at:''});

// Admins review suggestions and maintain the directory. Only approved rows are
// visible to users, and "verified" can only be set on an approved row.
function AdminCharitiesTab({language}:{language:Language}){
  const isAr=language==='ar',tr=(a:string,b:string)=>isAr?a:b;
  const [status,setStatus]=useState<AdminCharity['status']>('pending');
  const [rows,setRows]=useState<AdminCharity[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [editing,setEditing]=useState<AdminCharity|null>(null),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    const {data,error:issue}=await supabase.rpc('admin_list_charities',{p_status:status});
    setLoading(false);
    if(issue){setRows([]);setError(isAr?'تعذر تحميل المؤسسات.':'Could not load charities.');return;}
    setRows((data??[]) as AdminCharity[]);
  },[status,isAr]);
  useEffect(()=>{void load();},[load]);
  const save=async(row:AdminCharity)=>{
    if(busy)return;
    if(row.name.trim().length<2||!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||Math.abs(row.latitude)>90||Math.abs(row.longitude)>180){setError(tr('أدخل الاسم وإحداثيات صحيحة.','Enter a name and valid coordinates.'));return;}
    if(row.logo_url&&!/^https:\/\//.test(row.logo_url)){setError(tr('رابط الشعار يجب أن يبدأ بـ https://','The logo URL must start with https://'));return;}
    setBusy(true);setError('');
    const {error:issue}=await supabase.rpc('admin_save_charity',{p_charity:{...row,verified:row.status==='approved'&&row.verified}});
    setBusy(false);
    if(issue){setError(tr('تعذر حفظ المؤسسة.','Could not save the charity.'));return;}
    setEditing(null);void load();
  };
  const field=(label:string,value:string,change:(next:string)=>void,props:Record<string,unknown>={})=>
    <label className="admin-charity-field">{label}<input value={value} onChange={event=>change(event.target.value)} {...props}/></label>;
  return <div className="admin-body">
    <div className="market-chips">
      {(['pending','approved','rejected'] as const).map(value=><button key={value} className={status===value?'active':''} onClick={()=>setStatus(value)}>{value==='pending'?tr('قيد المراجعة','Pending'):value==='approved'?tr('معتمدة','Approved'):tr('مرفوضة','Rejected')}</button>)}
      <button onClick={()=>setEditing(blankCharity())}><Plus size={14}/>{tr('إضافة مؤسسة','Add charity')}</button>
    </div>
    {error&&<p className="feedback error" role="alert">{error}</p>}
    {loading?<div className="community-loading"><div className="loader-dot"/><span>SHARek</span></div>
      :!rows.length?<div className="admin-empty">{tr('لا توجد مؤسسات في هذه الحالة.','No charities in this state.')}</div>
      :rows.map(row=><div key={row.id} className="admin-charity-row">
        <div><strong>{row.name}{row.verified&&<BadgeCheck size={14}/>}</strong><small>{row.address||'—'} · <span dir="ltr">{row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}</span></small>{row.suggester_name&&<small>{tr('اقترحها','Suggested by')}: {row.suggester_name}</small>}</div>
        <div className="admin-charity-actions">
          {row.status!=='approved'&&<button className="primary-button" disabled={busy} onClick={()=>void save({...row,status:'approved'})}><Check size={14}/>{tr('اعتماد','Approve')}</button>}
          {row.status!=='rejected'&&<button className="secondary-button" disabled={busy} onClick={()=>void save({...row,status:'rejected'})}><X size={14}/>{tr('رفض','Reject')}</button>}
          <button className="secondary-button" disabled={busy} onClick={()=>setEditing({...row,logo_url:row.logo_url??''})}>{tr('تعديل','Edit')}</button>
        </div>
      </div>)}
    {editing&&<div className="modal-overlay"><div className="modal-card market-sheet">
      <h3>{editing.id?tr('تعديل مؤسسة','Edit charity'):tr('إضافة مؤسسة','Add charity')}</h3>
      {field(tr('الاسم','Name'),editing.name,next=>setEditing({...editing,name:next}),{maxLength:160})}
      {field(tr('العنوان المختصر','Short address'),editing.address,next=>setEditing({...editing,address:next}),{maxLength:300})}
      {field(tr('رابط الشعار (https)','Logo URL (https)'),editing.logo_url??'',next=>setEditing({...editing,logo_url:next}),{dir:'ltr',inputMode:'url'})}
      <div className="admin-charity-coords">
        {field(tr('خط العرض','Latitude'),Number.isFinite(editing.latitude)?String(editing.latitude):'',next=>setEditing({...editing,latitude:next===''?NaN:Number(next)}),{dir:'ltr',inputMode:'decimal'})}
        {field(tr('خط الطول','Longitude'),Number.isFinite(editing.longitude)?String(editing.longitude):'',next=>setEditing({...editing,longitude:next===''?NaN:Number(next)}),{dir:'ltr',inputMode:'decimal'})}
      </div>
      <label className="admin-charity-field">{tr('الحالة','Status')}<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as AdminCharity['status']})}><option value="pending">{tr('قيد المراجعة','Pending')}</option><option value="approved">{tr('معتمدة','Approved')}</option><option value="rejected">{tr('مرفوضة','Rejected')}</option></select></label>
      <label className="admin-charity-check"><input type="checkbox" disabled={editing.status!=='approved'} checked={editing.status==='approved'&&editing.verified} onChange={event=>setEditing({...editing,verified:event.target.checked})}/>{tr('شارة التوثيق (للمؤسسات المعتمدة فقط)','Verified badge (approved only)')}</label>
      <div className="market-sheet-actions"><button className="primary-button" disabled={busy} onClick={()=>void save(editing)}>{busy?'…':tr('حفظ','Save')}</button><button className="secondary-button" disabled={busy} onClick={()=>setEditing(null)}>{tr('إلغاء','Cancel')}</button></div>
    </div></div>}
  </div>;
}
