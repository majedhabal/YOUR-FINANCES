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

// Register service worker
import { registerServiceWorker } from './lib/swRegistration';
registerServiceWorker();

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
