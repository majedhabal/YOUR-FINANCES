import { DEFAULT_RATES } from './exchangeRates';

export interface LocalIntelligenceEngineType {
  convertToAED: (amount: number, fromCurrency: string, exchangeRates?: any) => number;
}

export const LocalIntelligenceEngine: LocalIntelligenceEngineType = {
  convertToAED: (amount: number, fromCurrency: string, exchangeRates?: any): number => {
    // Standardize symbol/name (e.g., '$' -> 'USD', '€' -> 'EUR', '£' -> 'GBP')
    let normalizedCurrency = fromCurrency.toUpperCase().trim();
    if (normalizedCurrency === '$') normalizedCurrency = 'USD';
    if (normalizedCurrency === '€') normalizedCurrency = 'EUR';
    if (normalizedCurrency === '£') normalizedCurrency = 'GBP';
    if (normalizedCurrency === '¥') normalizedCurrency = 'JPY';
    
    const rateToAED = (exchangeRates && exchangeRates[normalizedCurrency]) || DEFAULT_RATES[normalizedCurrency as keyof typeof DEFAULT_RATES] || 1;
    return amount * rateToAED;
  }
};
