import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';

if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native-app');

// Website: /marketplace/<id>/ links are served by the web app. Remember the listing so it
// opens after sign-in, then show the app's normal address.
if (!Capacitor.isNativePlatform()) {
  const listing = /^\/marketplace\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i.exec(window.location.pathname)?.[1];
  if (listing) {
    try { sessionStorage.setItem('sharek-pending-marketplace', listing); } catch { /* storage blocked */ }
    window.history.replaceState(null, '', import.meta.env.BASE_URL);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
