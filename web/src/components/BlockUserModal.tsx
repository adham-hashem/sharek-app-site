import { Shield, Check } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';
import { useState } from 'react';
import {notifyChatBlocksChanged} from '@/lib/chat-blocks';

type Props = {
  language: Language;
  blockedUserId: string;
  blockedUserName?: string | null;
  onClose: () => void;
  onBlocked?: () => void;
};

export function BlockUserModal({ language, blockedUserId, blockedUserName, onClose, onBlocked }: Props) {
  const isAr = language === 'ar';
  const [blocking, setBlocking] = useState(false);
  const [done, setDone] = useState(false);
  const [error,setError]=useState('');

  const copy = {
    title: isAr ? 'حظر هذا المستخدم' : 'Block this user',
    confirm: isAr ? 'هل تريد حظر هذا المستخدم؟ لن يتمكن من إرسال رسائل لك أو التواصل معك.' : 'Block this user? They will not be able to message you or contact you.',
    cancel: isAr ? 'إلغاء' : 'Cancel',
    confirmBtn: isAr ? 'تأكيد الحظر' : 'Confirm block',
    success: isAr ? 'تم حظر المستخدم بنجاح' : 'User blocked successfully',
    close: isAr ? 'إغلاق' : 'Close',
    user: isAr ? 'المستخدم' : 'User',
  };

  const handleBlock = async () => {
    if(blocking)return;
    setBlocking(true);
    setError('');
    try{
      const { error:saveError } = await supabase.rpc('block_user', { p_blocked_user_id: blockedUserId });
      if(saveError)throw saveError;
      notifyChatBlocksChanged();
      setDone(true);
      onBlocked?.();
    }catch{setError(isAr?'تعذر حفظ الحظر. تحقق من الاتصال وحاول مجددًا.':'Could not save the block. Check your connection and retry.');}
    finally{setBlocking(false);}
  };

  return (
    <div className="chat-modal-overlay" dir={isAr ? 'rtl' : 'ltr'} onClick={()=>{if(!blocking)onClose();}}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <span className="report-success-icon" style={{ width: '56px', height: '56px' }}><Check size={28} /></span>
            <h3>{copy.success}</h3>
            <div className="chat-modal-actions">
              <button onClick={onClose}>{copy.close}</button>
            </div>
          </>
        ) : (
          <>
            <Shield size={28} />
            <h3>{copy.title}</h3>
            {blockedUserName && <p style={{ fontWeight: 700, color: '#4d3123' }}>{blockedUserName}</p>}
            <p>{copy.confirm}</p>
            {error&&<p className="feedback error" role="alert">{error}</p>}
            <div className="chat-modal-actions">
              <button onClick={onClose} disabled={blocking}>{copy.cancel}</button>
              <button className="danger" onClick={() => void handleBlock()} disabled={blocking}>
                {blocking ? '...' : copy.confirmBtn}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
