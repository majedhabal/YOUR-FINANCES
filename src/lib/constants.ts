export interface CategoryDef {
  name: string;
  nature: 'Need' | 'Want' | 'Must' | 'Income';
  subcategories: string[];
  emoji: string;
}

export const MASTER_CATEGORIES: CategoryDef[] = [
  {
    name: 'Food & Drinks',
    nature: 'Need',
    emoji: '🍱',
    subcategories: ['Bar', 'Cafe', 'Groceries', 'Restaurant', 'Fast-Food']
  },
  {
    name: 'Shopping',
    nature: 'Want',
    emoji: '🛍️',
    subcategories: ['Clothes', 'Shoes', 'Drug-store', 'Electronics', 'Accessories', 'Free time', 'Gifts', 'Health', 'Home', 'Garden', 'Jewels', 'Kids', 'Pets', 'Tools', 'Stationery']
  },
  {
    name: 'Housing',
    nature: 'Must',
    emoji: '🏠',
    subcategories: ['Energy', 'Utilities', 'Maintenance', 'Repairs', 'Mortgage', 'Property Insurance', 'Rent', 'Services']
  },
  {
    name: 'Transportation',
    nature: 'Need',
    emoji: '🚗',
    subcategories: ['Business trips', 'Long distance', 'Public transport', 'Taxi']
  },
  {
    name: 'Vehicle',
    nature: 'Need',
    emoji: '🏎️',
    subcategories: ['Fuel', 'Leasing', 'Parking', 'Salik', 'Rentals', 'Vehicle insurance', 'Vehicle maintenance']
  },
  {
    name: 'Life & Entertainment',
    nature: 'Want',
    emoji: '🎬',
    subcategories: ['Gym', 'Fitness', 'Books', 'Subscriptions', 'Games', 'Charity', 'Culture', 'Education', 'Health care', 'Hobbies', 'Holiday', 'Hotel', 'Wellness', 'Beauty']
  },
  {
    name: 'Communication',
    nature: 'Need',
    emoji: '📱',
    subcategories: ['Internet', 'Phone', 'Postal services', 'Software', 'Apps']
  },
  {
    name: 'Financial Expenses',
    nature: 'Must',
    emoji: '💳',
    subcategories: ['Charges', 'Fees', 'Bank charges', 'VAT', 'Fines', 'Insurances', 'Loan', 'Taxes']
  },
  {
    name: 'Investments',
    nature: 'Want',
    emoji: '📈',
    subcategories: ['Collections', 'Sarwa Management fee', 'Real Estate', 'Savings']
  },
  {
    name: 'Income',
    nature: 'Income',
    emoji: '💰',
    subcategories: ['Wage', 'Invoices', 'Gifts', 'Dividends', 'Rental income', 'Sale', 'Cashbacks']
  },
  {
    name: 'Others',
    nature: 'Want',
    emoji: '📁',
    subcategories: ['Others', 'Missing', 'Starting Balance']
  }
];

export function evaluateMathExpression(val: string | number): string {
  if (val === undefined || val === null) return '';
  const strVal = String(val).trim();
  if (!strVal) return '';
  
  // Strip out anything that is NOT a digit, decimal, +, -, *, /, (, or )
  const sanitized = strVal.replace(/[^0-9+\-*/.()]/g, '');
  if (!sanitized) return strVal;
  
  // If there are no math operators, just return the sanitized string
  if (!/[+\-*/]/.test(sanitized)) {
    return sanitized;
  }

  try {
    // Basic safety check: ensure parentheses are balanced
    const openParen = (sanitized.match(/\(/g) || []).length;
    const closeParen = (sanitized.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
      return strVal;
    }

    // Safely evaluate using Function constructor
    const fn = new Function(`return (${sanitized})`);
    const result = fn();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      // Round to 4 decimal places to avoid floating point issues (e.g., 0.1 + 0.2)
      return (Math.round(result * 10000) / 10000).toString();
    }
  } catch (e) {
    // If formula is incomplete (e.g. trailing "7000+"), keep original typed text
  }
  return strVal;
}
