import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import { supabase, type Language } from '@/lib/supabase';

type Props = {
  language: Language;
  userId: string;
  currentAvatar: string | null;
  onAvatarChange: (url: string | null) => void;
};

const TARGET_SIZE = 256;
const QUALITY = 0.82;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, TARGET_SIZE, TARGET_SIZE);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      img.onerror = () => reject(new Error('image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('file'));
    reader.readAsDataURL(file);
  });
}

export function ProfilePhotoUploader({ language, userId, currentAvatar, onAvatarChange }: Props) {
  const isAr = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const copy = {
    addPhoto: isAr ? 'إضافة صورة شخصية' : 'Add profile photo',
    changePhoto: isAr ? 'تغيير الصورة' : 'Change photo',
    removePhoto: isAr ? 'حذف الصورة' : 'Remove photo',
    uploadFromGallery: isAr ? 'اختيار من المعرض' : 'Choose from gallery',
    takePhoto: isAr ? 'التقاط صورة' : 'Take a photo',
    uploading: isAr ? 'جارٍ الرفع...' : 'Uploading...',
    error: isAr ? 'تعذر رفع الصورة' : 'Could not upload photo',
    preview: isAr ? 'معاينة' : 'Preview',
    save: isAr ? 'حفظ الصورة' : 'Save photo',
    cancel: isAr ? 'إلغاء' : 'Cancel',
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const compressed = await compressImage(file);
      setPreview(compressed);
    } catch {
      setError(copy.error);
    }
  };

  const uploadAvatar = async () => {
    if (!preview) return;
    setUploading(true);
    setError('');
    try {
      const base64 = preview.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const ext = 'jpg';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (updateError) throw updateError;
      onAvatarChange(publicUrl);
      setPreview(null);
    } catch {
      setError(copy.error);
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!currentAvatar) return;
    setUploading(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);
      if (updateError) throw updateError;
      onAvatarChange(null);
    } catch {
      setError(copy.error);
    } finally {
      setUploading(false);
    }
  };

  const cancelPreview = () => {
    setPreview(null);
    setError('');
  };

  if (preview) {
    return (
      <div className="profile-photo-uploader preview-mode">
        <div className="profile-photo-preview-wrap">
          <img src={preview} alt="" className="profile-photo-preview" />
          {uploading && <div className="profile-photo-uploading-overlay"><Loader2 size={24} className="spin" /></div>}
        </div>
        {error && <div className="profile-photo-error">{error}</div>}
        <div className="profile-photo-actions">
          <button type="button" className="text-button" onClick={cancelPreview} disabled={uploading}>{copy.cancel}</button>
          <button type="button" className="primary-button profile-photo-save-btn" onClick={() => void uploadAvatar()} disabled={uploading}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}{copy.save}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-photo-uploader">
      <div className="profile-photo-current-wrap">
        {currentAvatar
          ? <img src={currentAvatar} alt="" className="profile-photo-current" />
          : <span className="profile-photo-placeholder"><Camera size={28} /></span>}
        {uploading && <div className="profile-photo-uploading-overlay"><Loader2 size={24} className="spin" /></div>}
      </div>
      {error && <div className="profile-photo-error">{error}</div>}
      <div className="profile-photo-actions">
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => void handleFileSelected(e.target.files?.[0])} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => void handleFileSelected(e.target.files?.[0])} />
        <button type="button" className="profile-photo-btn upload" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload size={15} />{currentAvatar ? copy.changePhoto : copy.addPhoto}
        </button>
        <button type="button" className="profile-photo-btn camera" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
          <Camera size={15} />{copy.takePhoto}
        </button>
        {currentAvatar && <button type="button" className="profile-photo-btn remove" onClick={() => void removeAvatar()} disabled={uploading}>
          <Trash2 size={15} />{copy.removePhoto}
        </button>}
      </div>
    </div>
  );
}
