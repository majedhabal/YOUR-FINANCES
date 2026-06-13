import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent crash when global interceptor tries to serialize console arguments containing circular structures (e.g., from raw Firebase/React errors)
const makeSafeConsoleArg = (arg: any, seen = new WeakSet()): any => {
  if (arg === null || typeof arg !== 'object') {
    return arg;
  }
  if (seen.has(arg)) {
    return '[Circular Ref]';
  }
  seen.add(arg);

  try {
    if (arg instanceof Error) {
      return {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      };
    }

    if (typeof window !== 'undefined') {
      if (arg instanceof Node) {
        return `[DOM Node: ${arg.nodeName}]`;
      }
      if (arg instanceof Window) {
        return '[Window Object]';
      }
    }

    if (arg.constructor && typeof arg.constructor.name === 'string') {
      const cName = arg.constructor.name;
      if (cName.length <= 3 && !['Map', 'Set', 'Date'].includes(cName)) {
        return `[Internal Object: ${cName}]`;
      }
    }

    if (Array.isArray(arg)) {
      return arg.map(item => makeSafeConsoleArg(item, seen));
    }

    const safeObj: any = {};
    for (const key of Object.keys(arg)) {
      safeObj[key] = makeSafeConsoleArg(arg[key], seen);
    }
    return safeObj;
  } catch (e) {
    return '[Unserializable Object]';
  }
};

const patchConsole = (method: 'error' | 'warn' | 'log') => {
  const original = console[method];
  console[method] = function (...args: any[]) {
    const safeArgs = args.map(arg => makeSafeConsoleArg(arg));
    original.apply(console, safeArgs);
  };
};

patchConsole('error');
patchConsole('warn');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Gracefully remove splash screen after load
window.addEventListener('load', () => {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('fade-out');
      // Clean up DOM after transition
      setTimeout(() => splash.remove(), 500);
    }, 1000); // 1s show time for premium feel
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => {
            console.log('Vantage PWA: Service Worker registered successfully under pre-authorized notification rules.', reg);
          })
          .catch((err) => {
            console.error('ServiceWorker registration failed: ', err);
          });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission()
          .then((permission) => {
            if (permission === 'granted') {
              navigator.serviceWorker.register('/sw.js')
                .then((reg) => {
                  console.log('Vantage PWA: Service Worker registered after permission approval.', reg);
                })
                .catch((err) => {
                  console.warn('ServiceWorker registration failed: ', err);
                });
            } else {
              console.warn('Vantage PWA: Notification permission was denied or dismissed. Proceeding to register service worker in safe fallback mode.');
              navigator.serviceWorker.register('/sw.js').catch((err) => {
                console.warn('Service Worker fallback register failed: ', err);
              });
            }
          })
          .catch((err) => {
            console.warn('Notification permission interface request failed gracefully:', err);
            navigator.serviceWorker.register('/sw.js').catch((swErr) => {
              console.warn('Service Worker fallback register failed: ', swErr);
            });
          });
      } else {
        console.warn('Vantage PWA: Notification permission is explicitly denied. Registering service worker in caching-only mode.');
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('Service Worker register failed: ', err);
        });
      }
    } else {
      console.warn('System notifications interface is not supported in this client environment.');
      // Fallback register without notifications if web push is unavailable but caching is required
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker fallback register failed: ', err);
      });
    }
  });
}
