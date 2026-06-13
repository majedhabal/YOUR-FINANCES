import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { VantageDataErrorBoundary } from '../components/VantageDataErrorBoundary';

export interface ExchangeRates {
  [currencyCode: string]: number;
}

// Default fallback rates (AED per 1 unit of foreign currency)
export const DEFAULT_RATES: ExchangeRates = {
  AED: 1,
  USD: 3.6725, // 1 USD = 3.6725 AED
  PHP: 0.0632, // 1 PHP = 0.0632 AED (~15.82 PHP per AED)
  EUR: 3.9902, // 1 EUR = 3.99 AED
  GBP: 4.6721, // 1 GBP = 4.67 AED
  SAR: 0.9791, // 1 SAR = 0.98 AED
  QAR: 1.0084, // 1 QAR = 1.01 AED
  JPY: 0.0238, // 1 JPY = 0.024 AED
  INR: 0.0439, // 1 INR = 0.044 AED
  CAD: 2.6841, // 1 CAD = 2.68 AED
  AUD: 2.4132, // 1 AUD = 2.41 AED
  CNY: 0.5065  // 1 CNY = 0.51 AED
};

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  const apiKey = '0d1b10f0c376bd07427f1b98';
  // AED is base for rates, e.g. 1 AED = X USD, 1 AED = Y PHP
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/AED`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    const data = await response.json();
    if (data && data.result === 'success' && data.conversion_rates) {
      const conv = data.conversion_rates;
      // Convert AED-based rates to AED-multiplier rates (how many AED is 1 unit of foreign currency)
      const parsedRates: ExchangeRates = { AED: 1 };
      
      for (const [curr, value] of Object.entries(conv)) {
        if (typeof value === 'number' && value > 0) {
          parsedRates[curr] = 1 / value;
        }
      }
      return parsedRates;
    } else {
      throw new Error('Malformed ExchangeRate-API response or failed status');
    }
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    VantageDataErrorBoundary.logWarning(`ExchangeRate-API fetch failed: ${msg}`);
    throw error;
  }
}

export async function syncExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  
  // 1. Check LocalStorage Cache first (Gatekeeper)
  const LOCAL_CACHE_KEY = 'vantage_exchange_rates';
  const LOCAL_TIME_KEY = 'vantage_exchange_rates_time';
  
  try {
    const cachedRatesStr = localStorage.getItem(LOCAL_CACHE_KEY);
    const cachedTimeStr = localStorage.getItem(LOCAL_TIME_KEY);
    if (cachedRatesStr && cachedTimeStr) {
      const cachedTime = parseInt(cachedTimeStr, 10);
      const savedRates = JSON.parse(cachedRatesStr) as ExchangeRates;
      // If cached rates are valid and updated within the last 24 hours, return immediately!
      if (now - cachedTime < 24 * 60 * 60 * 1000 && savedRates?.AED && savedRates?.USD) {
        return savedRates;
      }
    }
  } catch (e) {
    console.warn("Failed checking rates localStorage:", e);
  }

  // 2. If client cache is missing or expired, attempt to fetch from Firestore first
  const docRef = doc(db, 'global_config', 'rates');
  
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const lastUpdated = data.lastUpdated || 0;
      const savedRates = data.rates as ExchangeRates;
      
      // If Firestore rates exist and updated within the last 24 hours, update localStorage and return them
      if (now - lastUpdated < 24 * 60 * 60 * 1000 && savedRates?.AED && savedRates?.USD) {
        try {
          localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(savedRates));
          localStorage.setItem(LOCAL_TIME_KEY, String(lastUpdated));
        } catch (e) {}
        return savedRates;
      }
    }
    
    // 3. Otherwise (expired or missing), trigger a fresh fetch from the public exchange API
    try {
      const newRates = await fetchExchangeRates();
      
      // Update localStorage cache FIRST so that subsequent renders / tabs
      // immediately hit the cached version even if Firestore is slow or fails!
      try {
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(newRates));
        localStorage.setItem(LOCAL_TIME_KEY, String(now));
      } catch (e) {}
      
      // Opportunistically try to sync the rates back to Firestore
      // as a global fallback, but wrap in a fire-and-forget catch to
      // insulate current client from any database quota restrictions or offline blocks.
      setDoc(docRef, {
        rates: newRates,
        lastUpdated: now
      }, { merge: true }).catch((firestoreErr) => {
        console.warn("Non-blocking background config write bypassed (e.g. quota limits):", firestoreErr);
      });
      
      return newRates;
    } catch (fetchErr) {
      // API call failed, fallback to stored rates in Firestore if available
      if (snap.exists()) {
        const data = snap.data();
        if (data.rates?.AED) {
          try {
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data.rates));
            localStorage.setItem(LOCAL_TIME_KEY, String(data.lastUpdated || now));
          } catch (e) {}
          return data.rates as ExchangeRates;
        }
      }
      return DEFAULT_RATES;
    }
  } catch (err: any) {
    VantageDataErrorBoundary.logWarning(`Firestore sync failed: ${err.message || err}. Resorting to defaults.`);
    // If Firestore fetch gets blocked (e.g. quota exceeded or offline), fallback to whatever is in localStorage
    try {
      const cachedRatesStr = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cachedRatesStr) {
        return JSON.parse(cachedRatesStr) as ExchangeRates;
      }
    } catch (_) {}
    return DEFAULT_RATES;
  }
}
