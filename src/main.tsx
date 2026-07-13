// Safe localStorage polyfill to prevent SecurityError in restricted iframes or browsers
try {
  const test = window.localStorage;
  if (!test) {
    throw new Error("localStorage is null");
  }
} catch (e) {
  console.warn("localStorage is not accessible, using in-memory fallback", e);
  const memStore: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => memStore[key] !== undefined ? memStore[key] : null,
    setItem: (key: string, value: string) => { memStore[key] = String(value); },
    removeItem: (key: string) => { delete memStore[key]; },
    clear: () => { for (const key in memStore) delete memStore[key]; },
    key: (index: number) => Object.keys(memStore)[index] || null,
    get length() { return Object.keys(memStore).length; }
  };
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
    writable: true
  });
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Unregister any legacy service workers and clear cache to prevent the "stale index.html" blank page issue
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log('Legacy ServiceWorker unregistered successfully.');
        }
      });
    }
  }).catch((err) => {
    console.warn('Error fetching service worker registrations:', err);
  });

  // Clear cache storage to ensure latest assets are loaded
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name).then(() => {
          console.log(`Cache "${name}" cleared successfully.`);
        }).catch(() => {});
      }
    }).catch(() => {});
  }
}


