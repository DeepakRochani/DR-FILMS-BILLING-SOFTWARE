import React from 'react';
import ReactDOM from 'react-dom/client';
import { CustomerApp } from './CustomerApp.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { initSentry } from './utils/sentry.js';

// Initialize Sentry error reporting if configured and enabled
initSentry();

// Register PWA service worker for offline caching with update prompt notification
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('drfilms:sw-need-refresh', { detail: { updateSW } }));
  },
  onOfflineReady() {
    console.log('[DR FILMS] Offline service worker ready.');
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CustomerApp />
  </React.StrictMode>
);
