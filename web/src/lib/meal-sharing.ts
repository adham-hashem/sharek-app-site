import type { Language } from './supabase';

export type SharingMode = 'request' | 'direct';
export type CollectionState = 'available' | 'partially_reserved' | 'fully_reserved' | 'received' | 'expired' | 'unavailable';
export type PickupPoint = { latitude: number; longitude: number; source: 'gps' | 'pin'; accuracy: number | null; timestamp: number };
export function sharingLabel(mode: SharingMode | undefined, language: Language): string {
  return mode === 'direct' ? (language === 'ar' ? 'استلام مباشر' : 'Direct pickup') : (language === 'ar' ? 'استقبال الطلبات' : 'Request approval');
}
export function mealDeadline(meal: { expires_at: string; sharing_mode?: SharingMode; pickup_until?: string | null }): string {
  return meal.sharing_mode === 'direct' && meal.pickup_until && Date.parse(meal.pickup_until) < Date.parse(meal.expires_at) ? meal.pickup_until : meal.expires_at;
}
export function collectionLabel(state: CollectionState | undefined, language: Language): string {
  const labels = { available: ['متاحة للاستلام', 'Available'], partially_reserved: ['محجوزة جزئيًا', 'Partly reserved'], fully_reserved: ['محجوزة بالكامل', 'Fully reserved'], received: ['تم الاستلام', 'Received'], expired: ['انتهى وقت الاستلام', 'Pickup ended'], unavailable: ['غير متاحة', 'Unavailable'] };
  return labels[state ?? 'available'][language === 'ar' ? 0 : 1];
}
export function directionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`;
}
