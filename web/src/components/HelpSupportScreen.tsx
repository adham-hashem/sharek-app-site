import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  MessageSquare,
  Flag,
  Plus,
  Check,
  X,
  Camera,
  Send,
  AlertCircle,
  Inbox,
  Clock,
} from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';

type Props = {
  language: Language;
  userId: string;
  onBack: () => void;
  onOpenReport: () => void;
};

type View = 'main' | 'faq' | 'tickets';

type TicketStatus = 'new' | 'under_review' | 'replied' | 'closed';

type SupportTicket = {
  id: string;
  ticket_number: number;
  category: string;
  subject: string;
  description: string;
  attachment_url: string | null;
  status: TicketStatus;
  created_at: string;
};

type TicketMessage = {
  id: string;
  sender_id: string;
  sender_role: 'user' | 'support';
  body: string;
  created_at: string;
};

const FAQ_ITEMS: { ar: string; en: string }[] = [
  {
    ar: 'كيف أطلب وجبة؟',
    en: 'How do I request a meal?',
  },
  {
    ar: 'كيف أشارك وجبة؟',
    en: 'How do I share a meal?',
  },
  {
    ar: 'كيف يعمل البحث عن وجبة؟',
    en: 'How does meal search work?',
  },
  {
    ar: 'كيف أعرف مكان استلام الوجبة؟',
    en: 'How do I know the pickup location?',
  },
  {
    ar: 'كيف أتواصل مع مقدم المساعدة؟',
    en: 'How do I contact the helper?',
  },
  {
    ar: 'ماذا يحدث إذا انتهى وقت البحث؟',
    en: 'What happens if the search time expires?',
  },
  {
    ar: 'ماذا يحدث إذا تم رفض طلبي؟',
    en: 'What happens if my request is rejected?',
  },
  {
    ar: 'كيف أبلغ عن مشكلة؟',
    en: 'How do I report a problem?',
  },
  {
    ar: 'كيف أعدل بيانات حسابي؟',
    en: 'How do I edit my account details?',
  },
  {
    ar: 'كيف تعمل الإشعارات؟',
    en: 'How do notifications work?',
  },
];

const FAQ_ANSWERS: Record<string, { ar: string; en: string }> = {
  'How do I request a meal?': {
    ar: 'اضغط «أحتاج وجبة» من الصفحة الرئيسية، وحدد عدد الوجبات ووقت حاجتك إليها، ثم ابدأ البحث. يستخدم التطبيق موقعك التقريبي للعثور على مقدم مساعدة قريب. ويمكنك أيضًا فتح المجتمع واختيار وجبة متاحة.',
    en: 'Tap “I need a meal” on the home screen, choose the number of meals and when you need them, then start the search. The app uses your approximate location to find a nearby helper. You can also open Community and choose an available meal.',
  },
  'How do I share a meal?': {
    ar: 'إذا كان حسابك لمشاركة الطعام، اضغط «شارك طعام الآن»، وأدخل بيانات الوجبة المطلوبة وحدد طريقة مشاركتها ومكانها، ثم انشرها. ستظهر الوجبة المتاحة للأشخاص القريبين.',
    en: 'If your account shares food, tap “Share food now”, enter the required meal details, choose how and where to share it, then publish it. The available meal will appear to people nearby.',
  },
  'How does meal search work?': {
    ar: 'عند بدء طلب وجبة، يبحث التطبيق عن مقدمي مساعدة قريبين من موقعك التقريبي ويعرض حالة البحث. ويمكنك فتح تبويب «المجتمع» لتصفح الوجبات المتاحة قربك واختيار المناسب.',
    en: 'When you start a meal request, the app looks for helpers near your approximate location and shows the search status. You can also open the Community tab to browse nearby available meals and choose one.',
  },
  'How do I know the pickup location?': {
    ar: 'افتح تفاصيل طلبك بعد قبوله لمعرفة نقطة الاستلام. إذا كان الاستلام مباشرًا، يمكنك بدء الطريق إلى موقع الوجبة من شاشة الطلب. ويمكنك استخدام المحادثة للتنسيق مع مقدم الطعام.',
    en: 'Open your request details after it is accepted to see the pickup point. For direct pickup, you can start a route to the meal from the request screen. Use the chat to coordinate with the food provider.',
  },
  'How do I contact the helper?': {
    ar: 'افتح الطلب أو الوجبة واضغط زر المحادثة للتواصل مع الطرف الآخر. يمكنك أيضًا فتح المحادثات من القائمة لمتابعة الرسائل.',
    en: 'Open the request or meal and tap the chat button to contact the other person. You can also open Chats from the menu to continue the conversation.',
  },
  'What happens if the search time expires?': {
    ar: 'إذا انتهى الوقت دون العثور على مقدم مساعدة، تظهر لك رسالة توضح ذلك. اضغط «حاول مرة أخرى» لإعادة البحث، أو عد إلى الوجبات المتاحة.',
    en: 'If the time runs out without finding a helper, the app shows a message. Tap “Try again” to search again, or return to the available meals.',
  },
  'What happens if my request is rejected?': {
    ar: 'إذا رُفض طلبك، تظهر حالته في شاشة الطلب. ارجع إلى الوجبات المتاحة لاختيار وجبة أخرى، أو ابدأ طلبًا جديدًا لاحقًا.',
    en: 'If your request is rejected, its status appears on the request screen. Return to the available meals to choose another one, or start a new request later.',
  },
  'How do I report a problem?': {
    ar: 'افتح «المساعدة والدعم» من القائمة، ثم اختر «الإبلاغ عن مشكلة» واتبع الخطوات الظاهرة. ويمكنك اختيار «التواصل مع دعم SHARek» لإنشاء تذكرة دعم وشرح المشكلة.',
    en: 'Open Help & Support from the menu, choose “Report a Problem”, and follow the steps shown. You can also choose “Contact SHARek Support” to create a support ticket and describe the issue.',
  },
  'How do I edit my account details?': {
    ar: 'افتح القائمة واضغط على اسمك، ثم اضغط زر التعديل في ملفك الشخصي لتغيير الاسم أو الصورة وحفظ التغييرات. لتغيير اللغة، افتح «الإعدادات» ثم «اللغة».',
    en: 'Open the menu and tap your name, then tap the edit button in your profile to change your name or photo and save. To change the language, open Settings, then Language.',
  },
  'How do notifications work?': {
    ar: 'اضغط جرس الإشعارات لعرض التحديثات مثل الطلبات والرسائل. اضغط إشعارًا لفتحه أو تعليمه كمقروء، ويمكنك ضبط أنواع الإشعارات من «الإعدادات» ثم «إعدادات الإشعارات».',
    en: 'Tap the notification bell to see updates such as requests and messages. Tap a notification to open it or mark it as read. You can choose notification types in Settings, then Notification settings.',
  },
};

const TICKET_CATEGORIES: { value: string; ar: string; en: string }[] = [
  { value: 'meal_problem', ar: 'مشكلة في وجبة', en: 'Meal problem' },
  { value: 'request_problem', ar: 'مشكلة في طلب', en: 'Request problem' },
  { value: 'pickup_problem', ar: 'مشكلة في الاستلام', en: 'Pickup problem' },
  { value: 'user_problem', ar: 'مشكلة مع مستخدم', en: 'User problem' },
  { value: 'technical', ar: 'مشكلة تقنية في التطبيق', en: 'Technical issue' },
  { value: 'other', ar: 'سبب آخر', en: 'Other' },
];

function statusLabel(status: TicketStatus, isAr: boolean): string {
  const labels: Record<TicketStatus, { ar: string; en: string }> = {
    new: { ar: 'جديدة', en: 'New' },
    under_review: { ar: 'قيد المراجعة', en: 'Under review' },
    replied: { ar: 'تم الرد', en: 'Replied' },
    closed: { ar: 'مغلقة', en: 'Closed' },
  };
  return isAr ? labels[status].ar : labels[status].en;
}

function statusColor(status: TicketStatus): string {
  const colors: Record<TicketStatus, string> = {
    new: '#0f766e',
    under_review: '#d97706',
    replied: '#2563eb',
    closed: '#6b7280',
  };
  return colors[status];
}

export function HelpSupportScreen({ language, userId, onBack, onOpenReport }: Props) {
  const isAr = language === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const [view, setView] = useState<View>('main');

  return (
    <div className="help-support-overlay" dir={dir}>
      <div className="help-support-sheet">
        {view === 'main' && <MainView isAr={isAr} onBack={onBack} onNavigate={setView} onOpenReport={onOpenReport} />}
        {view === 'faq' && <FaqView isAr={isAr} onBack={() => setView('main')} />}
        {view === 'tickets' && <TicketsView isAr={isAr} userId={userId} onBack={() => setView('main')} />}
      </div>
    </div>
  );
}

function MainView({ isAr, onBack, onNavigate, onOpenReport }: { isAr: boolean; onBack: () => void; onNavigate: (v: View) => void; onOpenReport: () => void }) {
  const options = [
    {
      icon: <HelpCircle size={24} />,
      title: isAr ? 'الأسئلة الشائعة' : 'FAQ',
      subtitle: isAr ? 'إجابات للأسئلة الأكثر شيوعًا' : 'Answers to common questions',
      onClick: () => onNavigate('faq'),
      color: '#0f766e',
    },
    {
      icon: <MessageSquare size={24} />,
      title: isAr ? 'التواصل مع دعم SHARek' : 'Contact SHARek Support',
      subtitle: isAr ? 'أنشئ تذكرة وتواصل مع فريق الدعم' : 'Create a ticket and chat with support',
      onClick: () => onNavigate('tickets'),
      color: '#2563eb',
    },
    {
      icon: <Flag size={24} />,
      title: isAr ? 'الإبلاغ عن مشكلة' : 'Report a Problem',
      subtitle: isAr ? 'بلغ عن مشكلة في وجبة، طلب، استلام، أو مستخدم' : 'Report an issue with a meal, request, pickup, or user',
      onClick: onOpenReport,
      color: '#dc2626',
    },
  ];

  return (
    <>
      <div className="help-support-header">
        <button className="modal-close" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={20} /></button>
        <div className="help-support-title">
          <h2>{isAr ? 'المساعدة والدعم' : 'Help & Support'}</h2>
          <p>{isAr ? 'كيف يمكننا مساعدتك اليوم؟' : 'How can we help you today?'}</p>
        </div>
      </div>
      <div className="help-support-options">
        {options.map((opt, i) => (
          <button key={i} className="help-support-option" onClick={opt.onClick}>
            <span className="help-support-option-icon" style={{ color: opt.color }}>{opt.icon}</span>
            <span className="help-support-option-text">
              <b>{opt.title}</b>
              <small>{opt.subtitle}</small>
            </span>
            <ArrowLeft size={18} className="help-support-option-arrow" style={{ transform: isAr ? 'scaleX(1)' : 'scaleX(-1)' }} />
          </button>
        ))}
      </div>
    </>
  );
}

function FaqView({ isAr, onBack }: { isAr: boolean; onBack: () => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <div className="help-support-header">
        <button className="modal-close" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={20} /></button>
        <div className="help-support-title">
          <h2>{isAr ? 'الأسئلة الشائعة' : 'FAQ'}</h2>
          <p>{isAr ? 'إجابات للأسئلة الأكثر شيوعًا' : 'Answers to common questions'}</p>
        </div>
      </div>
      <div className="faq-list">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIndex === i;
          const answer = FAQ_ANSWERS[item.en];
          return (
            <div key={i} className={`faq-item ${isOpen ? 'open' : ''}`}>
              <button className="faq-question" onClick={() => setOpenIndex(isOpen ? null : i)} aria-expanded={isOpen}>
                <span>{isAr ? item.ar : item.en}</span>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {isOpen && answer && (
                <div className="faq-answer">
                  <p>{isAr ? answer.ar : answer.en}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function TicketsView({ isAr, userId, onBack }: { isAr: boolean; userId: string; onBack: () => void }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  if (selectedTicket) {
    return (
      <TicketConversation
        isAr={isAr}
        ticket={selectedTicket}
        userId={userId}
        onBack={() => { setSelectedTicket(null); void loadTickets(); }}
      />
    );
  }

  if (showCreate) {
    return (
      <CreateTicketForm
        isAr={isAr}
        userId={userId}
        onBack={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); void loadTickets(); }}
      />
    );
  }

  return (
    <>
      <div className="help-support-header">
        <button className="modal-close" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={20} /></button>
        <div className="help-support-title">
          <h2>{isAr ? 'الدعم الفني' : 'Support Tickets'}</h2>
          <p>{isAr ? 'تذاكرك ومحادثاتك مع فريق الدعم' : 'Your tickets and conversations with support'}</p>
        </div>
      </div>
      <div className="tickets-container">
        <button className="primary-button tickets-create-btn" onClick={() => setShowCreate(true)}>
          <Plus size={18} />
          {isAr ? 'إنشاء طلب دعم جديد' : 'New support ticket'}
        </button>
        {loading ? (
          <div className="tickets-empty"><div className="loader-dot" /></div>
        ) : tickets.length === 0 ? (
          <div className="tickets-empty">
            <Inbox size={40} />
            <p>{isAr ? 'لا توجد تذاكر دعم بعد' : 'No support tickets yet'}</p>
            <small>{isAr ? 'أنشئ تذكرة جديدة وسيتواصل معك فريق الدعم' : 'Create a new ticket and our team will get back to you'}</small>
          </div>
        ) : (
          <div className="tickets-list">
            {tickets.map((ticket) => (
              <button key={ticket.id} className="ticket-card" onClick={() => setSelectedTicket(ticket)}>
                <div className="ticket-card-header">
                  <span className="ticket-number">#{ticket.ticket_number}</span>
                  <span className="ticket-status-badge" style={{ background: statusColor(ticket.status), color: '#fff' }}>
                    {statusLabel(ticket.status, isAr)}
                  </span>
                </div>
                <b className="ticket-subject">{ticket.subject}</b>
                <small className="ticket-category">
                  {TICKET_CATEGORIES.find((c) => c.value === ticket.category)?.[isAr ? 'ar' : 'en'] ?? ticket.category}
                </small>
                <div className="ticket-card-footer">
                  <Clock size={13} />
                  <span>{new Date(ticket.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' })}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CreateTicketForm({ isAr, userId, onBack, onCreated }: { isAr: boolean; userId: string; onBack: () => void; onCreated: () => void }) {
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    setError('');
    try {
      const fileName = `${userId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('report-evidence')
        .upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('report-evidence')
        .getPublicUrl(fileName);
      setAttachmentUrl(urlData.publicUrl);
    } catch {
      setError(isAr ? 'تعذر رفع الصورة. حاول مرة أخرى.' : 'Could not upload image. Try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!category || !subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setError('');
    const { data, error: insertError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        category,
        subject: subject.trim(),
        description: description.trim(),
        attachment_url: attachmentUrl,
      })
      .select()
      .maybeSingle();
    setSubmitting(false);
    if (insertError) {
      setError(isAr ? 'تعذر إنشاء التذكرة. حاول مرة أخرى.' : 'Could not create ticket. Try again.');
      return;
    }
    if (data) {
      setSuccess(true);
      setTimeout(() => onCreated(), 1500);
    }
  };

  if (success) {
    return (
      <div className="ticket-success">
        <span className="ticket-success-icon"><Check size={40} /></span>
        <h2>{isAr ? 'تم إنشاء التذكرة بنجاح' : 'Ticket created successfully'}</h2>
        <p>{isAr ? 'سيتواصل معك فريق الدعم قريبًا' : 'Our support team will get back to you soon'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="help-support-header">
        <button className="modal-close" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={20} /></button>
        <div className="help-support-title">
          <h2>{isAr ? 'طلب دعم جديد' : 'New Support Ticket'}</h2>
        </div>
      </div>
      <div className="ticket-form">
        <div className="share-field-label">
          <small>{isAr ? 'نوع المشكلة' : 'Problem type'}</small>
          <div className="ticket-categories">
            {TICKET_CATEGORIES.map((c) => (
              <button
                key={c.value}
                className={`ticket-category-chip ${category === c.value ? 'selected' : ''}`}
                onClick={() => setCategory(c.value)}
              >
                {isAr ? c.ar : c.en}
                {category === c.value && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
        <div className="share-field-label">
          <small>{isAr ? 'العنوان' : 'Subject'}</small>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={isAr ? 'اكتب عنوانًا مختصرًا' : 'Write a short subject'}
            maxLength={100}
          />
        </div>
        <div className="share-field-label">
          <small>{isAr ? 'تفاصيل المشكلة' : 'Problem details'}</small>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isAr ? 'اشرح المشكلة بالتفصيل...' : 'Describe the problem in detail...'}
            rows={5}
            maxLength={2000}
          />
        </div>
        <div className="share-field-label">
          <small>{isAr ? 'إرفاق صورة (اختياري)' : 'Attach image (optional)'}</small>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
          {attachmentUrl ? (
            <div className="ticket-attachment-preview">
              <img src={attachmentUrl} alt="" />
              <button className="share-photo-remove" onClick={() => setAttachmentUrl(null)}><X size={16} /></button>
            </div>
          ) : (
            <button className="ticket-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <span className="loader-dot" /> : <Camera size={20} />}
              <span>{uploading ? (isAr ? 'جارٍ الرفع...' : 'Uploading...') : (isAr ? 'صورة أو لقطة شاشة' : 'Photo or screenshot')}</span>
            </button>
          )}
        </div>
        {error && <div className="feedback error"><AlertCircle size={16} />{error}</div>}
        <button
          className="primary-button"
          disabled={!category || !subject.trim() || !description.trim() || submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? '...' : (isAr ? 'إرسال الطلب' : 'Submit ticket')}
          <Send size={18} />
        </button>
      </div>
    </>
  );
}

function TicketConversation({ isAr, ticket, userId, onBack }: { isAr: boolean; ticket: SupportTicket; userId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    const { data } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as TicketMessage[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadMessages();
  }, [ticket.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    const { data } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: userId,
        sender_role: 'user',
        body: reply.trim(),
      })
      .select()
      .maybeSingle();
    setSending(false);
    if (data) {
      setReply('');
      void loadMessages();
    }
  };

  return (
    <>
      <div className="help-support-header">
        <button className="modal-close" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={20} /></button>
        <div className="help-support-title">
          <h2>#{ticket.ticket_number}</h2>
          <span className="ticket-status-badge" style={{ background: statusColor(ticket.status), color: '#fff' }}>
            {statusLabel(ticket.status, isAr)}
          </span>
        </div>
      </div>
      <div className="ticket-conversation">
        <div className="ticket-convo-meta">
          <b>{ticket.subject}</b>
          <small>{TICKET_CATEGORIES.find((c) => c.value === ticket.category)?.[isAr ? 'ar' : 'en'] ?? ticket.category}</small>
          {ticket.attachment_url && (
            <div className="ticket-convo-attachment">
              <img src={ticket.attachment_url} alt="" />
            </div>
          )}
        </div>
        <div className="ticket-convo-messages">
          {loading ? (
            <div className="tickets-empty"><div className="loader-dot" /></div>
          ) : messages.length === 0 ? (
            <div className="ticket-convo-empty">
              <MessageSquare size={32} />
              <p>{isAr ? 'لا توجد رسائل بعد. اكتب أول رد.' : 'No messages yet. Write the first reply.'}</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`ticket-msg ${msg.sender_role === 'user' ? 'own' : 'support'}`}>
                <div className="ticket-msg-bubble">
                  <p>{msg.body}</p>
                  <small>{new Date(msg.created_at).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</small>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="ticket-convo-input">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={isAr ? 'اكتب ردك...' : 'Type your reply...'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !sending) void handleSend(); }}
            disabled={ticket.status === 'closed'}
          />
          <button
            className="ticket-send-btn"
            onClick={() => void handleSend()}
            disabled={!reply.trim() || sending || ticket.status === 'closed'}
          >
            <Send size={18} />
          </button>
        </div>
        {ticket.status === 'closed' && (
          <p className="ticket-closed-notice">{isAr ? 'هذه التذكرة مغلقة. لا يمكن الرد عليها.' : 'This ticket is closed. No further replies.'}</p>
        )}
      </div>
    </>
  );
}
