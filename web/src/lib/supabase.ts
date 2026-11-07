import { createClient, navigatorLock, processLock } from '@supabase/supabase-js';
import type { SharingMode, CollectionState } from './meal-sharing';
import { Capacitor } from '@capacitor/core';
import { secureStorage } from './secure-storage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY;

export const NATIVE_OAUTH_REDIRECT_URL = 'com.sharek.foodsharing://auth/callback';
export const AUTH_STORAGE_KEY = 'sb-vffncqujwdsvmxjehfgp-auth-token';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: !Capacitor.isNativePlatform(),
    storage: secureStorage, storageKey: AUTH_STORAGE_KEY,
    // Web: browser tabs share the stored session, so refreshes must be locked across tabs.
    lock: Capacitor.isNativePlatform() ? processLock : navigatorLock,
  },
});

export type Language = 'ar' | 'en';
export type UserRole = 'beneficiary' | 'donor';
export type Religion = 'muslim' | 'christian' | 'other' | 'prefer_not_to_say';

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  language: Language;
  country_code: string | null;
  country_name: string | null;
  religion: Religion | null;
  role: UserRole | null;
  provider: string;
  account_status: 'active' | 'suspended';
  is_verified: boolean;
  helper_preferences_set: boolean;
  helper_accepts_requests: boolean;
  helper_radius_km: 1 | 3 | 5 | 10;
  helper_latitude: number | null;
  helper_longitude: number | null;
  helper_location_updated_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MealCategory = 'cooked' | 'sandwiches' | 'bakery' | 'ready' | 'fruit' | 'vegetables' | 'sweets' | 'other';

export type Meal = {
  sharing_mode?: SharingMode;
  pickup_until?: string | null;
  pickup_instructions?: string | null;
  collection_state?: CollectionState;
  id: string;
  name: string;
  category: string;
  description: string | null;
  quantity: number;
  reserved_quantity?: number;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  availability_start: string;
  expires_at: string;
  status: string;
  donor_id: string;
  created_at: string;
};

export type MealRequest = {
  sharing_mode?: SharingMode;
  pickup_instructions?: string | null;
  id: string;
  requester_id: string;
  donor_id: string | null;
  quantity_requested: number;
  latitude: number | null;
  longitude: number | null;
  requested_time: string;
  status: 'SEARCHING' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WAITING_FOR_PICKUP' | 'ON_THE_WAY' | 'ARRIVED' | 'RECEIVED' | 'COMPLETED' | 'NOT_FOUND' | 'EXPIRED' | 'CANCELLED';
  search_resolution?: 'meals_available' | null;
  expires_at: string;
  created_at: string;
  updated_at?: string;
  pickup_meal_id?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
};

export type MealPhoto = {
  id: string;
  meal_id: string;
  url: string;
  position: number;
  created_at: string;
};

export type CommunityMeal = {
  sharing_mode?: SharingMode;
  pickup_until?: string | null;
  pickup_instructions?: string | null;
  collection_state?: CollectionState;
  id: string;
  donor_id: string;
  name: string;
  category: string;
  description: string | null;
  quantity: number;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  expires_at: string;
  availability_start?: string;
  created_at: string;
  status: string;
  donor_name: string | null;
  donor_avatar: string | null;
  donor_verified: boolean;
  donor_rating: number;
  donor_badges: string[];
  distance_km: number | null;
  is_own: boolean;
  photo_count: number;
};

export type ChatMessage = {
  marketplace_card?: {id:string;title:string;category:string;photo:string|null;latitude:number;longitude:number}|null;
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  message_type: 'text' | 'image' | 'location' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  media_url: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_by: string[];
  deleted_for_everyone: boolean;
  location_lat: number | null;
  location_lng: number | null;
  location_live: boolean;
  location_expires_at: string | null;
  system_event: string | null;
};

export type Conversation = {
  thread_id: string;
  partner_id: string;
  partner_name: string | null;
  partner_avatar: string | null;
  partner_verified: boolean;
  partner_online: boolean;
  partner_last_active: string | null;
  last_message_body: string | null;
  last_message_type: string | null;
  last_message_sender: string | null;
  last_message_at: string | null;
  unread_count: number;
  request_id: string | null;
  request_status: string | null;
  meal_name: string | null;
  meal_photo: string | null;
  archived: boolean;
};

export type ChatPresence = {
  user_id: string;
  is_online: boolean;
  last_active_at: string;
};

export type LocationSession = {
  id: string;
  thread_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  expires_at: string;
  is_active: boolean;
  last_updated: string;
};

export type PickupLocation = {
  id: string;
  request_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  is_active: boolean;
  last_updated: string;
  created_at: string;
};

export type VerificationPricing = {
  id: string;
  country_code: string;
  country_name: string;
  currency_code: string;
  currency_symbol: string;
  amount: number;
  is_active: boolean;
};

export type VerificationRequest = {
  id: string;
  user_id: string;
  country_code: string;
  amount: number;
  currency_code: string;
  currency_symbol: string;
  status: 'UNPAID' | 'PAID_PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REFUNDED';
  stripe_payment_intent_id: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminVerificationRequest = VerificationRequest & {
  display_name: string | null;
  avatar_url: string | null;
};

export type Review = {
  id: string;
  reviewer_id: string;
  donor_id: string;
  reviewee_id: string | null;
  request_id: string | null;
  rating: number;
  comment: string | null;
  review_type: 'beneficiary_to_donor' | 'donor_to_beneficiary';
  created_at: string;
};

export type DonorStats = {
  total_meals_shared: number;
  total_people_helped: number;
  average_rating: number;
  badges: string[];
};

export type BeneficiaryStats = {
  total_meals_received: number;
  unique_donors_helped: number;
  completed_handovers: number;
  average_rating: number;
  badges: string[];
};

export type UserReport = {
  id: string;
  report_number: number;
  reporter_id: string;
  reported_user_id: string;
  meal_id: string | null;
  request_id: string | null;
  thread_id: string | null;
  reason: string;
  custom_reason: string | null;
  description: string | null;
  evidence_urls: string[];
  status: 'new' | 'under_review' | 'action_taken' | 'closed' | 'unfounded';
  admin_action: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type AdminReportListItem = {
  id: string;
  report_number: number;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  description: string | null;
  status: string;
  admin_action: string | null;
  meal_id: string | null;
  request_id: string | null;
  evidence_urls: string[];
  created_at: string;
  reporter_name: string | null;
  reporter_avatar: string | null;
  reported_name: string | null;
  reported_avatar: string | null;
};

export type AdminReportDetail = AdminReportListItem & {
  thread_id: string | null;
  custom_reason: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type ReportAuditEntry = {
  id: string;
  admin_id: string;
  action: string;
  previous_status: string;
  new_status: string;
  notes: string | null;
  created_at: string;
  admin_name: string | null;
};

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number, language: Language): string {
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return language === 'ar' ? `${meters} م` : `${meters} m`;
  }
  return language === 'ar' ? `${km.toFixed(1)} كم` : `${km.toFixed(1)} km`;
}

export function formatPrice(amount: number, currencySymbol: string, language: Language): string {
  const display = amount >= 100 ? (amount / 100).toFixed(2).replace(/\.00$/, '') : amount.toString();
  return language === 'ar' ? `${display} ${currencySymbol}` : `${currencySymbol}${display}`;
}

const COUNTRY_CURRENCY_MAP: Record<string, { code: string; symbol: string }> = {
  EG: { code: 'EGP', symbol: '\u062C.\u0645' },
  SA: { code: 'SAR', symbol: '\u0631.\u0633' },
  US: { code: 'USD', symbol: '$' },
  GB: { code: 'GBP', symbol: '\u00A3' },
  DE: { code: 'EUR', symbol: '\u20AC' },
  FR: { code: 'EUR', symbol: '\u20AC' },
  AE: { code: 'AED', symbol: '\u062F.\u0625' },
  JO: { code: 'JOD', symbol: '\u062F.\u0623' },
  TR: { code: 'TRY', symbol: '\u20BA' },
  ID: { code: 'IDR', symbol: 'Rp' },
  IT: { code: 'EUR', symbol: '\u20AC' },
  ES: { code: 'EUR', symbol: '\u20AC' },
  NL: { code: 'EUR', symbol: '\u20AC' },
  BE: { code: 'EUR', symbol: '\u20AC' },
  KW: { code: 'KWD', symbol: '\u062F.\u0643' },
  QA: { code: 'QAR', symbol: '\u0631.\u0642' },
  BH: { code: 'BHD', symbol: '\u062F.\u0628' },
  OM: { code: 'OMR', symbol: '\u0631.\u0639' },
  LB: { code: 'LBP', symbol: '\u0644.\u0644' },
  IQ: { code: 'IQD', symbol: '\u0639.\u062F' },
  MA: { code: 'MAD', symbol: '\u062F.\u0645' },
  DZ: { code: 'DZD', symbol: '\u062F.\u062C' },
  TN: { code: 'TND', symbol: '\u062F.\u062A' },
  LY: { code: 'LYD', symbol: '\u0644.\u062F' },
  SD: { code: 'SDG', symbol: '\u062C.\u0633' },
  YE: { code: 'YER', symbol: '\u0631.\u064A' },
  PS: { code: 'ILS', symbol: '\u20AA' },
  SY: { code: 'SYP', symbol: '\u0644.\u0633' },
  PK: { code: 'PKR', symbol: '\u20A8' },
  IN: { code: 'INR', symbol: '\u20B9' },
  BD: { code: 'BDT', symbol: '\u09F3' },
  MY: { code: 'MYR', symbol: 'RM' },
  CA: { code: 'CAD', symbol: 'C$' },
  AU: { code: 'AUD', symbol: 'A$' },
  JP: { code: 'JPY', symbol: '\u00A5' },
  CN: { code: 'CNY', symbol: '\u00A5' },
  NG: { code: 'NGN', symbol: '\u20A6' },
  KE: { code: 'KES', symbol: 'KSh' },
};

export function getCountryCurrency(countryCode: string | null): { code: string; symbol: string } {
  return COUNTRY_CURRENCY_MAP[countryCode ?? ''] ?? { code: 'USD', symbol: '$' };
}
