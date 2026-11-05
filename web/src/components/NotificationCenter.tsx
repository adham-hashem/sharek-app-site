import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Check, CheckCheck, Trash2, Utensils, Heart, MessageCircle, Award, Megaphone, Clock } from 'lucide-react';
import { type Language } from '@/lib/supabase';
import { useNotifications, type AppNotification } from './NotificationProvider';

type Props = {
  language: Language;
  onBack: () => void;
  onNavigate?: (relatedType: string, relatedId: string) => void;
};

function timeAgo(iso: string, language: Language): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const isAr = language === 'ar';
  if (seconds < 60) return isAr ? `منذ ${seconds} ثانية` : `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return isAr ? `منذ ${mins} دقيقة` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isAr ? `منذ ${hours} ساعة` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isAr ? `منذ ${days} يوم` : `${days}d ago`;
}

function notifIcon(type: string) {
  if (type.includes('MEAL_REQUEST') || type.includes('NEARBY_MEAL') || type.includes('COMMUNITY')) return Utensils;
  if (type.includes('ACCEPTED') || type.includes('RECEIVED') || type.includes('COMPLETED') || type.includes('READY') || type.includes('HELPER')) return Heart;
  if (type === 'NEW_CHAT_MESSAGE') return MessageCircle;
  if (type === 'NEW_ACHIEVEMENT') return Award;
  if (type === 'GENERAL_SHAReK_NOTIFICATION') return Megaphone;
  return Bell;
}

export function NotificationCenter({ language, onBack, onNavigate }: Props) {
  const isAr = language === 'ar';
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, deleteNotifications, getAllNotificationIds, error:loadError,hasMore,loadMore } = useNotifications();
  const [actionError,setActionError]=useState(false),[working,setWorking]=useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const perform=async(action:()=>Promise<void>):Promise<boolean>=>{if(working)return false;setWorking(true);setActionError(false);try{await action();return true;}catch{setActionError(true);return false;}finally{setWorking(false);}};
  const toggleSelected = (id: string) => setSelectedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const cancelSelection = () => { setSelecting(false); setSelectedIds(new Set()); setConfirmDelete(false); };
  const selectAll = () => void perform(async () => { setSelectedIds(new Set(await getAllNotificationIds())); });
  const removeSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (await perform(() => deleteNotifications(ids))) cancelSelection();
    else setConfirmDelete(false);
  };
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const copy = {
    title: isAr ? 'الإشعارات' : 'Notifications',
    markAll: isAr ? 'تحديد الكل كمقروء' : 'Mark all read',
    empty: isAr ? 'لا توجد إشعارات' : 'No notifications',
    emptySub: isAr ? 'ستظهر هنا جميع الإشعارات الجديدة' : 'New notifications will appear here',
    today: isAr ? 'اليوم' : 'Today',
    earlier: isAr ? 'سابقًا' : 'Earlier',
    select: isAr ? 'تحديد' : 'Select',
    selectAll: isAr ? 'تحديد الكل' : 'Select all',
    cancelSelection: isAr ? 'إلغاء التحديد' : 'Cancel selection',
    deleteSelected: isAr ? 'حذف المحدد' : 'Delete selected',
    confirmTitle: isAr ? 'حذف الإشعارات المحددة؟' : 'Delete selected notifications?',
    confirmBody: isAr ? `سيتم حذف ${selectedIds.size} من الإشعارات نهائيًا.` : `${selectedIds.size} notifications will be permanently deleted.`,
    cancel: isAr ? 'إلغاء' : 'Cancel',
  };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayNotifs = notifications.filter((n) => new Date(n.created_at) >= startOfToday);
  const earlierNotifs = notifications.filter((n) => new Date(n.created_at) < startOfToday);

  const renderNotif = (notif: AppNotification) => {
    const Icon = notifIcon(notif.type);
    return (
      <div key={notif.id} className={`notif-item ${notif.is_read ? '' : 'unread'} ${selectedIds.has(notif.id) ? 'selected' : ''}`}>
        <button className="notif-item-main" disabled={working} aria-pressed={selecting ? selectedIds.has(notif.id) : undefined} onClick={() => {
          if (selecting) { toggleSelected(notif.id); return; }
          void perform(async()=>{
          if (!notif.is_read) await markAsRead(notif.id);
          if (notif.related_id && notif.related_type && onNavigate) onNavigate(notif.related_type, notif.related_id);
          });
        }}>
          {selecting && <span className="notif-select-indicator" aria-hidden="true">{selectedIds.has(notif.id) && <Check size={14} />}</span>}
          <span className="notif-icon"><Icon size={18} /></span>
          <span className="notif-content">
            <strong>{notif.title}</strong>
            <small>{notif.body}</small>
            <span className="notif-time"><Clock size={11} /> {timeAgo(notif.created_at, language)}</span>
          </span>
          {!notif.is_read && <span className="notif-dot" />}
        </button>
        {!selecting && <button className="notif-delete" disabled={working} onClick={() =>void perform(()=>deleteNotification(notif.id))} aria-label={isAr ? 'حذف' : 'Delete'}>
          <Trash2 size={15} />
        </button>}
      </div>
    );
  };

  return (
    <div className="notif-center-page" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="notif-center-header">
        <button className="icon-button" onClick={onBack} aria-label={isAr ? 'رجوع' : 'Back'}><ArrowLeft size={20} /></button>
        <h2>{copy.title}</h2>
        {!selecting && unreadCount > 0 && <button className="notif-mark-all" disabled={working} onClick={()=>void perform(markAllAsRead)}><CheckCheck size={16} />{copy.markAll}</button>}
        {selecting ? <button className="notif-mark-all" disabled={working} onClick={cancelSelection}>{copy.cancelSelection}</button> : notifications.length > 0 && <button className="notif-mark-all" disabled={working} onClick={() => setSelecting(true)}>{copy.select}</button>}
      </header>
      {selecting && <div className="notif-selection-toolbar">
        <button className="notif-mark-all" disabled={working} onClick={selectAll}>{copy.selectAll}</button>
        {selectedIds.size > 0 && <button className="notif-mark-all notif-delete-selected" disabled={working} onClick={() => setConfirmDelete(true)}><Trash2 size={15} />{copy.deleteSelected} ({selectedIds.size})</button>}
      </div>}
      <div className="notif-center-list">
        {(actionError||loadError)&&<p role="alert">{isAr?'تعذر تحديث الإشعارات. تحقق من الاتصال وحاول مجددًا.':'Could not update notifications. Check your connection and retry.'}</p>}
        {notifications.length === 0 ? (
          <div className="community-empty">
            <span className="community-empty-icon"><Bell size={24} /></span>
            <h3>{copy.empty}</h3>
            <p>{copy.emptySub}</p>
          </div>
        ) : (
          <>
            {todayNotifs.length > 0 && (
              <div className="notif-group">
                <h3 className="notif-group-title">{copy.today}</h3>
                {todayNotifs.map(renderNotif)}
              </div>
            )}
            {earlierNotifs.length > 0 && (
              <div className="notif-group">
                <h3 className="notif-group-title">{copy.earlier}</h3>
                {earlierNotifs.map(renderNotif)}
              </div>
            )}
          </>
        )}
        {hasMore&&<button className="text-button" onClick={loadMore}>{isAr?'عرض إشعارات أقدم':'Load older notifications'}</button>}
      </div>
      {confirmDelete && <div className="modal-overlay" onClick={() => { if (!working) setConfirmDelete(false); }}>
        <div className="modal-card notif-confirm-delete" role="alertdialog" aria-modal="true" aria-labelledby="notif-delete-title" onClick={event => event.stopPropagation()}>
          <h3 id="notif-delete-title">{copy.confirmTitle}</h3>
          <p>{copy.confirmBody}</p>
          <div className="notif-confirm-actions">
            <button className="text-button" disabled={working} onClick={() => setConfirmDelete(false)}>{copy.cancel}</button>
            <button className="primary-button" disabled={working} onClick={() => void removeSelected()}>{copy.deleteSelected} ({selectedIds.size})</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
