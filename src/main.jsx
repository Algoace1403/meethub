import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Retire old offline assets when the application is replaced at the same origin.
if ('serviceWorker' in navigator)
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations.map((registration) => registration.unregister()),
      ),
    )
    .catch(() => {});
if ('caches' in window)
  caches
    .keys()
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .catch(() => {});
createRoot(document.getElementById('root')).render(<App />);
