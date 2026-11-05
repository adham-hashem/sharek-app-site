import { Browser } from '@capacitor/browser';

export const LEGAL_URLS = {
  privacy: 'https://sharek.space/privacy/',
  terms: 'https://sharek.space/terms/',
  deleteAccount: 'https://sharek.space/delete-account/',
} as const;

export async function openLegalPage(url: string): Promise<void> {
  try {
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
