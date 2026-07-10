import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Calendar, 
  Users, 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown,
  Trash2, 
  ArrowRight, 
  UserPlus, 
  Check, 
  Activity, 
  Sparkles, 
  Award, 
  Plus,
  Send,
  Building,
  CreditCard,
  Briefcase,
  HelpCircle,
  Coins,
  Facebook,
  Lock,
  User,
  Baby,
  TrendingDown,
  Shield,
  Home,
  TrendingUp
} from 'lucide-react';
import { doc, setDoc, collection, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';
import { signInWithPopup, FacebookAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { db, auth, getGoogleProvider } from '../lib/firebase';
import { seedUserCustomCategories } from '../lib/categoryUtils';
import { VantageLogo } from './VantageLogo';
import { LanguageSelector } from './LanguageSelector';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
import { evaluateMathExpression, MASTER_CATEGORIES } from '../lib/constants';

interface Dependent {
  relation: string;
  relationship: string;
  age: number;
}

interface AccountItem {
  id?: string;
  name: string;
  type: string;
  bankAccountType?: string;
  startingBalance: number;
  currency: string;
  creditLimit?: number;
  statementDueDate?: string;
  paymentDueDate?: string;
}

interface OnboardingBudget {
  title: string;
  category: string;
  subcategory?: string;
  maxBudget: any;
  period: 'daily' | 'weekly' | 'monthly';
  currency: string;
  emoji: string;
}

const TRACKING_OPTIONS = [
  { id: 'daily_spends', label: 'Daily Spends & Groceries', emoji: '🛒', category: 'Food & Drinks', subcategory: 'Groceries' },
  { id: 'Food & Drinks', label: 'Food & Drinks', emoji: '🍱', category: 'Food & Drinks', subcategory: 'All' },
  { id: 'Shopping', label: 'Shopping', emoji: '🛍️', category: 'Shopping', subcategory: 'All' },
  { id: 'Housing', label: 'Housing', emoji: '🏠', category: 'Housing', subcategory: 'All' },
  { id: 'Transportation', label: 'Transportation', emoji: '🚗', category: 'Transportation', subcategory: 'All' },
  { id: 'Vehicle', label: 'Vehicle', emoji: '🏎️', category: 'Vehicle', subcategory: 'All' },
  { id: 'Life & Entertainment', label: 'Life & Entertainment', emoji: '🎬', category: 'Life & Entertainment', subcategory: 'All' },
  { id: 'Communication', label: 'Communication', emoji: '📱', category: 'Communication', subcategory: 'All' },
  { id: 'Financial Expenses', label: 'Financial Expenses', emoji: '💳', category: 'Financial Expenses', subcategory: 'All' },
  { id: 'Investments', label: 'Investments', emoji: '📈', category: 'Investments', subcategory: 'All' },
  { id: 'Others', label: 'Others', emoji: '📁', category: 'Others', subcategory: 'All' }
];

const GLOBAL_CURRENCIES = [
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', name: 'UK Pound', flag: '🇬🇧' },
  { code: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'AUD', name: 'Aust. Dollar', flag: '🇦🇺' },
  { code: 'CAD', name: 'Can. Dollar', flag: '🇨🇦' },
  { code: 'JPY', name: 'Japan Yen', flag: '🇯🇵' },
  { code: 'PHP', name: 'Philippine Peso', flag: '🇵🇭' },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'NZD', name: 'NZ Dollar', flag: '🇳🇿' },
  { code: 'HKD', name: 'HK Dollar', flag: '🇭🇰' },
  { code: 'SEK', name: 'Swedish Krona', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', flag: '🇳🇴' },
  { code: 'DKK', name: 'Danish Krone', flag: '🇩🇰' },
  { code: 'TRY', name: 'Turkish Lira', flag: '🇹🇷' },
  { code: 'BRL', name: 'Brazilian Real', flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso', flag: '🇲🇽' },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
  { code: 'KRW', name: 'South Korean Won', flag: '🇰🇷' },
  { code: 'MYR', name: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'IDR', name: 'Indonesian Rupiah', flag: '🇮🇩' },
  { code: 'THB', name: 'Thai Baht', flag: '🇹🇭' },
  { code: 'VND', name: 'Vietnamese Dong', flag: '🇻🇳' },
  { code: 'EGP', name: 'Egyptian Pound', flag: '🇪🇬' },
  { code: 'KWD', name: 'Kuwaiti Dinar', flag: '🇰🇼' },
  { code: 'QAR', name: 'Qatari Riyal', flag: '🇶🇦' },
  { code: 'OMR', name: 'Omani Rial', flag: '🇴🇲' },
  { code: 'BHD', name: 'Bahraini Dinar', flag: '🇧🇭' }
];

const CHAT_DOODLE_BACKGROUND = `url("data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27300%27 height=%27400%27 viewBox=%270 0 300 400%27%3E%3Crect width=%27300%27 height=%27400%27 fill=%27%23FAFBF9%27/%3E%3Cg fill=%27none%27 stroke=%27%23509e90%27 stroke-width=%271.2%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 opacity=%270.22%27%3E%3Crect x=%2725%27 y=%2720%27 width=%2732%27 height=%2722%27 rx=%273%27/%3E%3Cline x1=%2725%27 y1=%2727%27 x2=%2757%27 y2=%2727%27/%3E%3Crect x=%2729%27 y=%2732%27 width=%276%27 height=%274%27 rx=%271%27/%3E%3Cellipse cx=%27110%27 cy=%2720%27 rx=%2712%27 ry=%274%27/%3E%3Cpath d=%27M98,20 v5 c0,2.2 5.4,4 12,4 s12,-1.8 12,-4 v-5%27/%3E%3Cpath d=%27M98,25 v5 c0,2.2 5.4,4 12,4 s12,-1.8 12,-4 v-5%27/%3E%3Cpath d=%27M175,32 c-4,-4 -10,-4 -13,-1 c-2,-2 -5,-3 -8,-2 c-8,1 -12,8 -11,14 c1,5 6,8 11,9 l-1,4 l3,1 l2,-4 l4,0 l2,4 l3,-1 l-1,-4 c4,-1 7,-4 8,-8 c3,-1 5,-3 5,-6 c0,-3 -2,-5 -5,-6z M174,38 a1.5,1.5 0 1,1 0,-3 a1.5,1.5 0 0,1 0,3z%27/%3E%3Crect x=%27240%27 y=%2715%27 width=%2724%27 height=%2724%27 rx=%272%27/%3E%3Cline x1=%27245%27 y1=%2721%27 x2=%27259%27 y2=%2721%27/%3E%3Cline x1=%27245%27 y1=%2727%27 x2=%27255%27 y2=%2727%27/%3E%3Cpolyline points=%27245,21 247,23 251,19%27/%3E%3Crect x=%2730%27 y=%2775%27 width=%2736%27 height=%2722%27 rx=%272%27/%3E%3Cline x1=%2730%27 y1=%2797%27 x2=%2766%27 y2=%2797%27/%3E%3Cpath d=%27M25,97 h46 l-2,4 h-42z%27/%3E%3Cpath d=%27M105,95 l12,-12 l10,8 l18,-18 M137,73 h8 v8%27/%3E%3Cpath d=%27M100,60 c5,-2 10,2 15,0 s8,-5 12,-2 c3,2 6,1 10,-2%27/%3E%3Cpath d=%27M195,70 c-6,0 -10,4 -10,9 c0,4 3,7 5,9 v4 h10 v-4 c2,-2 5,-5 5,-9 c0,-5 -4,-9 -10,-9z%27/%3E%3Cline x1=%27192%27 y1=%2792%27 x2=%27198%27 y2=%2792%27/%3E%3Cline x1=%27193%27 y1=%2795%27 x2=%27197%27 y2=%2795%27/%3E%3Cpath d=%27M245,85 h18 v12 c0,3 -2.2,5 -5,5 h-8 c-2.8,0 -5,-2.2 -5,-5z%27/%3E%3Cpath d=%27M263,88 c2,0 3.5,1.5 3.5,3.5 s-1.5,3.5 -3.5,3.5%27/%3E%3Cline x1=%27248%27 y1=%2780%27 x2=%27248%27 y2=%2782%27/%3E%3Cline x1=%27254%27 y1=%2779%27 x2=%27254%27 y2=%2782%27/%3E%3Cline x1=%27260%27 y1=%2781%27 x2=%27260%27 y2=%2783%27/%3E%3Ccircle cx=%2745%27 cy=%27155%27 r=%2714%27/%3E%3Ccircle cx=%2745%27 cy=%27155%27 r=%276%27/%3E%3Cline x1=%2745%27 y1=%27141%27 x2=%2745%27 y2=%27145%27/%3E%3Cline x1=%2745%27 y1=%27165%27 x2=%2745%27 y2=%27169%27/%3E%3Cline x1=%2731%27 y1=%27155%27 x2=%2735%27 y2=%27155%27/%3E%3Cline x1=%2755%27 y1=%27155%27 x2=%2759%27 y2=%27155%27/%3E%3Cpath d=%27M110,140 h32 v20 c0,2.2 -1.8,4 -4,4 h-24 c-2.2,0 -4,-1.8 -4,-4z%27/%3E%3Cpath d=%27M110,144 h32 v4 h-32z%27/%3E%3Ccircle cx=%27136%27 cy=%27152%27 r=%272%27/%3E%3Cline x1=%27190%27 y1=%27135%27 x2=%27190%27 y2=%27165%27/%3E%3Cline x1=%27190%27 y1=%27165%27 x2=%27225%27 y2=%27165%27/%3E%3Crect x=%27195%27 y=%27148%27 width=%275%27 height=%2717%27/%3E%3Crect x=%27203%27 y=%27142%27 width=%275%27 height=%2723%27/%3E%3Crect x=%27211%27 y=%27138%27 width=%275%27 height=%2727%27/%3E%3Ccircle cx=%27255%27 cy=%27145%27 r=%276%27/%3E%3Cline x1=%27261%27 y1=%27145%27 x2=%27275%27 y2=%27145%27/%3E%3Cline x1=%27268%27 y1=%27145%27 x2=%27268%27 y2=%27150%27/%3E%3Cline x1=%27273%27 y1=%27145%27 x2=%27273%27 y2=%27148%27/%3E%3Cpath d=%27M25,210 L50,215 L35,235 Z%27/%3E%3Ccircle cx=%2732%27 cy=%27217%27 r=%271.5%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Ccircle cx=%2738%27 cy=%27224%27 r=%271.5%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Cpath d=%27M100,225 c10,-4 15,-1 20,-3 c3,-1 2,-6 5,-6 c5,0 4,8 0,11 c-3,2 -1,5 -5,5 c-6,0 -12,-3 -20,-7z%27/%3E%3Cline x1=%27105%27 y1=%27225%27 x2=%27103%27 y2=%27232%27/%3E%3Cline x1=%27114%27 y1=%27226%27 x2=%27116%27 y2=%27232%27/%3E%3Ccircle cx=%27185%27 cy=%27215%27 r=%2714%27/%3E%3Cpath d=%27M173,211 c3,1 6,-2 8,0 c3,2 1,5 4,5%27/%3E%3Cpath d=%27M180,225 c2,-3 5,-2 7,0%27/%3E%3Crect x=%27245%27 y=%27205%27 width=%2720%27 height=%2726%27 rx=%272%27/%3E%3Cline x1=%27250%27 y1=%27213%27 x2=%27260%27 y2=%27213%27/%3E%3Cline x1=%27250%27 y1=%27219%27 x2=%27258%27 y2=%27219%27/%3E%3Cline x1=%27250%27 y1=%27225%27 x2=%27256%27 y2=%27225%27/%3E%3Crect x=%2730%27 y=%27275%27 width=%2724%27 height=%2724%27 rx=%272%27/%3E%3Cline x1=%2730%27 y1=%27281%27 x2=%2754%27 y2=%27281%27/%3E%3Ccircle cx=%2736%27 cy=%27288%27 r=%271%27/%3E%3Ccircle cx=%2742%27 cy=%27288%27 r=%271%27/%3E%3Ccircle cx=%2748%27 cy=%27288%27 r=%271%27/%3E%3Ccircle cx=%2736%27 cy=%27294%27 r=%271%27/%3E%3Ccircle cx=%2742%27 cy=%27294%27 r=%271%27/%3E%3Ccircle cx=%2748%27 cy=%27294%27 r=%271%27/%3E%3Cpath d=%27M125,280 l3,3 l5,-1 l-3,4 l1,5 l-4,-3 l-4,2 l1,-5z%27/%3E%3Ccircle cx=%27200%27 cy=%27285%27 r=%2712%27/%3E%3Cellipse cx=%27200%27 cy=%27287%27 rx=%274%27 ry=%272.5%27/%3E%3Ccircle cx=%27196%27 cy=%27281%27 r=%271%27/%3E%3Ccircle cx=%27204%27 cy=%27281%27 r=%271%27/%3E%3Crect x=%27250%27 y=%27275%27 width=%2726%27 height=%2726%27 rx=%273%27/%3E%3Ccircle cx=%27263%27 cy=%27288%27 r=%273%27/%3E%3Cline x1=%27250%27 y1=%27275%27 x2=%27276%27 y2=%3D%27301%27/%3E%3Ccircle cx=%2750%27 cy=%27350%27 r=%278%27/%3E%3Cpath d=%27M44,346 c-2,2 -2,6 -1,8 M56,346 c2,2 2,6 1,8%27/%3E%3Cellipse cx=%2750%27 cy=%27353%27 rx=%272%27 ry=%271%27/%3E%3Crect x=%27130%27 y=%27340%27 width=%2718%27 height=%2730%27 rx=%273%27/%3E%3Ccircle cx=%27139%27 cy=%27365%27 r=%272%27/%3E%3Cpath d=%27M134,348 h10 v12 h-10z%27/%3E%3Ccircle cx=%27210%27 cy=%27350%27 r=%2712%27/%3E%3Cpolyline points=%27210,344 210,350 215,353%27/%3E%3Cpath d=%27M255,342 c5,-4 12,-4 17,-1l-2,5%27/%3E%3Ccircle cx=%2780%27 cy=%2760%27 r=%272%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Ccircle cx=%27160%27 cy=%27110%27 r=%271.5%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Ccircle cx=%27270%27 cy=%2760%27 r=%272%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Ccircle cx=%2790%27 cy=%27180%27 r=%271.5%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Ccircle cx=%27230%27 cy=%27250%27 r=%272%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Ccircle cx=%27110%27 cy=%27320%27 r=%271.5%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Ccircle cx=%27170%27 cy=%27310%27 r=%272.5%27 fill=%27%23509e90%27 stroke=%27none%27/%3E%3Cpath d=%27M15,130 Q22,125 30,132%27/%3E%3Cpath d=%27M75,250 Q80,245 85,252%27/%3E%3Cpath d=%27M150,260 Q155,255 160,262%27/%3E%3Cpath d=%27M220,110 Q225,105 230,112%27/%3E%3C/g%3E%3C/svg%3E")`;

interface OnboardingFlowProps {
  uid: string;
  profile: any;
  onSuccess: (updatedProfile: any) => void;
}

interface GoalConfig {
  key: string;
  label: string;
  question: string;
  placeholder: string;
  needs: number;
  wants: number;
  goal: number;
  accountType: 'savings' | 'liability';
}

const GOALS_CONFIG: GoalConfig[] = [
  {
    key: 'tackle_debt',
    label: 'Tackle Debt',
    question: 'What is your total outstanding debt balance?',
    placeholder: 'e.g. 50000',
    needs: 0.50,
    wants: 0.10,
    goal: 0.40,
    accountType: 'liability'
  },
  {
    key: 'emergency_fund',
    label: '3 - 6 Months Emergency Fund',
    question: 'What is your target cushion size?',
    placeholder: 'e.g. 20000',
    needs: 0.50,
    wants: 0.15,
    goal: 0.35,
    accountType: 'savings'
  },
  {
    key: 'save_house',
    label: 'Save for a house',
    question: 'What is your target downpayment goal?',
    placeholder: 'e.g. 150000',
    needs: 0.50,
    wants: 0.20,
    goal: 0.30,
    accountType: 'savings'
  },
  {
    key: 'launch_business',
    label: 'Launch a Business',
    question: 'What is your estimated startup capital goal?',
    placeholder: 'e.g. 100000',
    needs: 0.50,
    wants: 0.15,
    goal: 0.35,
    accountType: 'savings'
  },
  {
    key: 'investment_portfolio',
    label: 'Build an Investment Portfolio',
    question: 'What is your target monthly or annual investment contribution goal?',
    placeholder: 'e.g. 5000',
    needs: 0.50,
    wants: 0.15,
    goal: 0.35,
    accountType: 'savings'
  },
  {
    key: 'retirement',
    label: 'Save for Retirement',
    question: 'What is your desired annual retirement target nest egg?',
    placeholder: 'e.g. 2500000',
    needs: 0.50,
    wants: 0.20,
    goal: 0.30,
    accountType: 'savings'
  }
];

const getGoalTitle = (goalKey: string): string => {
  switch (goalKey) {
    case 'tackle_debt': return 'Tackle Debt';
    case 'emergency_fund': return 'Emergency Fund';
    case 'save_house': return 'Save for a House';
    case 'launch_business': return 'Launch a Business';
    case 'retirement': return 'Save for Retirement';
    case 'investment_portfolio': return 'Investment Portfolio';
    default: return 'Future Savings';
  }
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ uid, profile, onSuccess }) => {
  const { t } = useTranslation();
  // Pre-onboarding Auth Gateway state for sandbox and guest users
  const [showAuthGateway, setShowAuthGateway] = useState<boolean>(() => {
    return uid === 'dev-sandbox-user';
  });
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authAuthMode, setAuthMode] = useState<'email-entry' | 'password-entry' | 'signup-confirmation'>('email-entry');
  const [authErrorMsg, setAuthErrorMsg] = useState<string>('');

  const handleGoogleAuth = async () => {
    setAuthStatus('loading');
    setAuthErrorMsg('');
    try {
      const userCred = await signInWithPopup(auth, getGoogleProvider());
      const user = userCred.user;
      
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const nowTs = serverTimestamp();

      if (!userSnap.exists()) {
        const newProfile = {
          uid: user.uid,
          email: user.email || 'vantage.user@private.com',
          displayName: user.displayName ? user.displayName.split(' ')[0] : 'Sara Spence',
          fullName: user.displayName || 'Sara Spence',
          subscriptionTier: 'free',
          fingerprintLoginEnabled: false,
          lastLogin: nowTs,
          createdAt: nowTs,
          isOnboarded: false,
          geminiInsightsEnabled: true,
          legalAcceptedAt: nowTs,
          appPrivacyVersion: 'Version 1.0.0',
          lastLoginDate: new Date().toISOString().split('T')[0],
          dailyStreak: 1,
        };
        await setDoc(userRef, newProfile);
        await seedUserCustomCategories(user.uid);
      } else {
        await setDoc(userRef, { lastLogin: nowTs }, { merge: true });
      }
      setAuthStatus('success');
      setTimeout(() => {
        setShowAuthGateway(false);
      }, 500);
    } catch (err: any) {
      console.error(err);
      setAuthStatus('error');
      setAuthErrorMsg(err.message || 'Google Auth Connection Failed');
    }
  };

  const handleFacebookAuth = async () => {
    setAuthStatus('loading');
    setAuthErrorMsg('');
    try {
      const provider = new FacebookAuthProvider();
      provider.addScope('email');
      provider.addScope('public_profile');
      
      const userCred = await signInWithPopup(auth, provider);
      const user = userCred.user;
      
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const nowTs = serverTimestamp();

      if (!userSnap.exists()) {
        const newProfile = {
          uid: user.uid,
          email: user.email || 'vantage.fb.user@private.com',
          displayName: user.displayName ? user.displayName.split(' ')[0] : 'Sara Spence',
          fullName: user.displayName || 'Sara Spence',
          subscriptionTier: 'free',
          fingerprintLoginEnabled: false,
          lastLogin: nowTs,
          createdAt: nowTs,
          isOnboarded: false,
          geminiInsightsEnabled: true,
          legalAcceptedAt: nowTs,
          appPrivacyVersion: 'Version 1.0.0',
          lastLoginDate: new Date().toISOString().split('T')[0],
          dailyStreak: 1,
        };
        await setDoc(userRef, newProfile);
        await seedUserCustomCategories(user.uid);
      } else {
        await setDoc(userRef, { lastLogin: nowTs }, { merge: true });
      }
      setAuthStatus('success');
      setTimeout(() => {
        setShowAuthGateway(false);
      }, 500);
    } catch (err: any) {
      console.error("Facebook OAuth authentication failed:", err);
      setAuthStatus('error');
      setAuthErrorMsg(err.message || 'Authentication failed: The authentication process could not be completed. Please try registering using a different method or provider.');
      return;
    }
  };

  const handleEmailAction = async () => {
    if (!authEmail || !authEmail.includes('@')) {
      setAuthErrorMsg("Please enter a valid email address");
      return;
    }

    setAuthStatus('loading');
    setAuthErrorMsg('');

    try {
      if (authAuthMode === 'email-entry') {
        // Verification: in a real app, you'd check if user exists, for simplicity in this flow,
        // we just move to password for both signin/signup.
        setAuthMode('password-entry');
        setAuthStatus('idle');
        return;
      }

      if (authAuthMode === 'password-entry') {
        if (!authPassword) {
            setAuthErrorMsg("Please enter a password");
            setAuthStatus('idle');
            return;
        }

        try {
          await signInWithEmailAndPassword(auth, authEmail, authPassword);
          setAuthStatus('success');
          // Successful login flow
          setTimeout(() => setShowAuthGateway(false), 500);
        } catch (signInErr: any) {
          if (signInErr.code === 'auth/user-not-found') {
            // Initiate sign up flow
            await createUserWithEmailAndPassword(auth, authEmail, authPassword);
            
            // Create user document
            const user = auth.currentUser;
            if (user) {
              const userRef = doc(db, 'users', user.uid);
              const nowTs = serverTimestamp();
              const newProfile = {
                uid: user.uid,
                email: user.email,
                displayName: user.email?.split('@')[0] || 'New User',
                fullName: '',
                subscriptionTier: 'free',
                fingerprintLoginEnabled: false,
                lastLogin: nowTs,
                createdAt: nowTs,
                isOnboarded: false,
                geminiInsightsEnabled: true,
                legalAcceptedAt: nowTs,
                appPrivacyVersion: 'Version 1.0.0',
                lastLoginDate: new Date().toISOString().split('T')[0],
                dailyStreak: 1,
              };
              await setDoc(userRef, newProfile);
              await seedUserCustomCategories(user.uid);
            }
            
            setAuthStatus('success');
            setTimeout(() => setShowAuthGateway(false), 500);
          } else {
            throw signInErr;
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setAuthStatus('error');
      setAuthErrorMsg(err.message || 'Authentication Failed');
    }
  };

  // Current active step in conversational flow (1-6)
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isTyping, setIsTyping] = useState<boolean>(false);

  const rawTier = (profile?.subscriptionTier || 'free').toLowerCase();
  const isPaid = ['tier1', 'tier2', 'tier3', 'premium'].includes(rawTier);

  // Selector matrix states
  const [primaryGoal, setPrimaryGoal] = useState<string>(() => {
    const raw = profile?.primaryFinancialGoal || '';
    if (raw === 'Build an Investment Portfolio') return 'investment_portfolio';
    if (raw === 'Tackle Debt') return 'tackle_debt';
    if (raw === '3-6 Month Emergency Fund' || raw === '3 - 6 Months Emergency Fund') return 'emergency_fund';
    if (raw === 'Save for a house') return 'save_house';
    if (raw === 'Launch a Business') return 'launch_business';
    if (raw === 'Save for Retirement') return 'retirement';
    return raw;
  });
  const [goalAmount, setGoalAmount] = useState<string>(''); // force empty string initialization to let hints show
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'en');

  
  // Profile fields state
  const [randomPlaceholder] = useState<string>(() => {
    const list = ['John Doe', 'Sara Spence', 'Alex Mercer', 'Taylor Vance', 'Jordan Reed', 'Morgan Chase', 'Kelly Palmer'];
    return list[Math.floor(Math.random() * list.length)];
  });
  const [fullName, setFullName] = useState<string>('');
  const [dob, setDob] = useState<string>(profile?.dob || '');
  const [relationshipStatus, setRelationshipStatus] = useState<string>(profile?.relationshipStatus || '');
  const [dependents, setDependents] = useState<Dependent[]>(profile?.dependents || []);
  const [financialGoals, setFinancialGoals] = useState<string[]>(() => {
    let initialList: string[] = [];
    if (Array.isArray(profile?.financialGoals)) {
      initialList = profile.financialGoals;
    } else if (typeof profile?.financialGoals === 'string') {
      initialList = profile.financialGoals.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    
    const allowed = [
      'Save for Retirement',
      'Emergency Shield',
      'Buy Property',
      'Settle Liabilities',
      'Minimize Taxes',
      'Passive Wealth Growth'
    ];
    
    // Filter to only allowed options in our checklist to ensure we only have selected ones
    // and ignore default placeholder "Buy a family villa, optimize long-term savings"
    const filtered = initialList.filter(g => allowed.some(a => a.toLowerCase() === g.toLowerCase()));
    
    return filtered.length > 0 ? filtered : ['Save for Retirement'];
  });
  const [financialExperience, setFinancialExperience] = useState<number>(profile?.financialExperience || 3);
  
  // Custom multi-account tracking state
  const [accountsList, setAccountsList] = useState<AccountItem[]>(profile?.accounts || []);
  
  // Tracking prioritisation Preference selections & configured micro-budgets
  const [selectedTrackingCategories, setSelectedTrackingCategories] = useState<string[]>(profile?.selectedTrackingCategories || []);
  const [onboardingBudgets, setOnboardingBudgets] = useState<OnboardingBudget[]>(profile?.onboardingBudgets || []);
  
  // Current buffer inputs for inline Multi-Account form card
  const [accountName, setAccountName] = useState<string>('');
  const [accountType, setAccountType] = useState<string>('bank');
  const [accountBalance, setAccountBalance] = useState<string>('');
  const [creditOutstandingBalance, setCreditOutstandingBalance] = useState<string>('');
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [statementDueDate, setStatementDueDate] = useState<string>('');
  const [currency, setCurrency] = useState<string>('AED');
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState<boolean>(false);
  const [currencySearchQuery, setCurrencySearchQuery] = useState<string>('');
  const [isAddDependentDropdownOpen, setIsAddDependentDropdownOpen] = useState<boolean>(false);
  const [isGoalDropdownOpen, setIsGoalDropdownOpen] = useState<boolean>(false);

  // Payroll state variables
  const [salaryAmount, setSalaryAmount] = useState<string>('12000');
  const [salaryAccountName, setSalaryAccountName] = useState<string>('Salary Account');
  const [salaryAccountStartingBalance, setSalaryAccountStartingBalance] = useState<string>('0');
  const [paymentDay, setPaymentDay] = useState<number>(28);
  const [checkingDestination, setCheckingDestination] = useState<'dedicated' | 'existing'>('dedicated');
  const [incomeTrackingType, setIncomeTrackingType] = useState<string>(profile?.incomeTrackingType || 'payroll');

  // 50/30/20 Budget Setup variables
  interface BlueprintEnvelope {
    id: string;
    categoryTitle: string;
    categoryGroup: 'needs' | 'wants' | 'savings';
    allocatedAmount: string;
    iconAsset: string;
    emoji: string;
    mappedCategories: string[];
    mappedSubCategories: string[];
  }

  const [blueprintEnvelopes, setBlueprintEnvelopes] = useState<BlueprintEnvelope[]>([]);
  const [expandedEnvelopes, setExpandedEnvelopes] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, string[]>>({});
  const [subCategoryBudgets, setSubCategoryBudgets] = useState<Record<string, string>>({});

  const [initializedBlueprints, setInitializedBlueprints] = useState<boolean>(false);
  const [blueprintsApplied, setBlueprintsApplied] = useState<boolean>(false);
  const [lumpSumNeeds, setLumpSumNeeds] = useState<string>('');
  const [lumpSumWants, setLumpSumWants] = useState<string>('');
  const [lumpSumSavings, setLumpSumSavings] = useState<string>('');

  // Reactive calculation counters for 50/30/20 budget allocations
  const evalSalary = parseFloat(evaluateMathExpression(salaryAmount)) || 12000;
  const totalAllocated = blueprintEnvelopes.reduce((acc, bp) => {
    return acc + (parseFloat(evaluateMathExpression(bp.allocatedAmount)) || 0);
  }, 0);
  const isOverAllocated = totalAllocated > evalSalary;

  // Percentage allocations dictated dynamically by the active selected goal
  const activeGoalConfig = GOALS_CONFIG.find(g => g.key === primaryGoal);
  const needsPct = activeGoalConfig ? activeGoalConfig.needs * 100 : 50;
  const wantsPct = activeGoalConfig ? activeGoalConfig.wants * 100 : 30;
  const savingsPct = activeGoalConfig ? activeGoalConfig.goal * 100 : 20;

  useEffect(() => {
    if (activeStep === 10 && !initializedBlueprints) {
      let needsAmt = '';
      let wantsAmt = '';
      let savingsAmt = '';

      let needsRatio = 0.50;
      let wantsRatio = 0.30;
      let savingsRatio = 0.20;

      if (primaryGoal) {
        const config = GOALS_CONFIG.find(g => g.key === primaryGoal);
        if (config) {
          needsRatio = config.needs;
          wantsRatio = config.wants;
          savingsRatio = config.goal;
        }
      }

      if (incomeTrackingType === 'payroll') {
        const evalSalary = parseFloat(evaluateMathExpression(salaryAmount)) || 12000;
        needsAmt = String(Math.round(evalSalary * needsRatio));
        wantsAmt = String(Math.round(evalSalary * wantsRatio));
        savingsAmt = String(Math.round(evalSalary * savingsRatio));
      } else {
        needsAmt = lumpSumNeeds || '';
        wantsAmt = lumpSumWants || '';
        savingsAmt = lumpSumSavings || '';
      }

      setBlueprintEnvelopes([
        {
          id: 'needs-' + Math.random().toString(36).substr(2, 9),
          categoryTitle: 'Essential Needs',
          categoryGroup: 'needs',
          allocatedAmount: needsAmt,
          iconAsset: 'shopping-cart',
          emoji: '🛒',
          mappedCategories: ['Food & Drinks', 'Housing', 'Transportation', 'Vehicle', 'Communication', 'Financial Expenses'],
          mappedSubCategories: ['Groceries', 'Utilities', 'Rent', 'Fuel']
        },
        {
          id: 'wants-' + Math.random().toString(36).substr(2, 9),
          categoryTitle: 'Personal Wants',
          categoryGroup: 'wants',
          allocatedAmount: wantsAmt,
          iconAsset: 'shopping-bag',
          emoji: '🛍️',
          mappedCategories: ['Shopping', 'Life & Entertainment', 'Others'],
          mappedSubCategories: ['Clothes', 'Gym', 'Fitness', 'Subscriptions', 'Hobbies']
        },
        {
          id: 'savings-' + Math.random().toString(36).substr(2, 9),
          categoryTitle: getGoalTitle(primaryGoal),
          categoryGroup: 'savings',
          allocatedAmount: savingsAmt,
          iconAsset: primaryGoal === 'tackle_debt' ? 'credit-card' : 'landmark',
          emoji: primaryGoal === 'tackle_debt' ? '💳' : '🏦',
          mappedCategories: ['Investments'],
          mappedSubCategories: ['Savings', 'Real Estate']
        }
      ]);

      const initialSubBudgets: Record<string, string> = {
        'Groceries': String(Math.round((parseFloat(needsAmt) || 0) * 0.25)),
        'Utilities': String(Math.round((parseFloat(needsAmt) || 0) * 0.15)),
        'Rent': String(Math.round((parseFloat(needsAmt) || 0) * 0.50)),
        'Fuel': String(Math.round((parseFloat(needsAmt) || 0) * 0.10)),
        'Clothes': String(Math.round((parseFloat(wantsAmt) || 0) * 0.20)),
        'Gym': String(Math.round((parseFloat(wantsAmt) || 0) * 0.20)),
        'Fitness': String(Math.round((parseFloat(wantsAmt) || 0) * 0.20)),
        'Subscriptions': String(Math.round((parseFloat(wantsAmt) || 0) * 0.20)),
        'Hobbies': String(Math.round((parseFloat(wantsAmt) || 0) * 0.20)),
        'Savings': String(Math.round((parseFloat(savingsAmt) || 0) * 0.50)),
        'Real Estate': String(Math.round((parseFloat(savingsAmt) || 0) * 0.50))
      };
      setSubCategoryBudgets(initialSubBudgets);

      setInitializedBlueprints(true);
    }
  }, [activeStep, initializedBlueprints, incomeTrackingType, salaryAmount, lumpSumNeeds, lumpSumWants, lumpSumSavings, primaryGoal]);

  const handleUpdateSubCategoryBudget = (sub: string, amt: string) => {
    setSubCategoryBudgets(prev => ({
      ...prev,
      [sub]: amt
    }));
  };

  const handleUpdateEnvelopeAmount = (envId: string, val: string) => {
    const numeric = parseFloat(val) || 0;
    setBlueprintEnvelopes(prev =>
      prev.map(bp => {
        if (bp.id !== envId) return bp;
        
        const count = bp.mappedSubCategories.length || 1;
        const share = Math.round(numeric / count);
        bp.mappedSubCategories.forEach(sub => {
          subCategoryBudgets[sub] = String(share);
        });
        
        return { ...bp, allocatedAmount: val };
      })
    );
    setSubCategoryBudgets({ ...subCategoryBudgets });
  };

  useEffect(() => {
    if (initializedBlueprints && blueprintEnvelopes.length > 0) {
      setBlueprintEnvelopes(prev => {
        let changed = false;
        const next = prev.map(bp => {
          let sum = 0;
          bp.mappedSubCategories.forEach(sub => {
            sum += parseFloat(subCategoryBudgets[sub]) || 0;
          });
          const sumStr = String(sum);
          if (bp.allocatedAmount !== sumStr) {
            changed = true;
            return { ...bp, allocatedAmount: sumStr };
          }
          return bp;
        });
        return changed ? next : prev;
      });
    }
  }, [subCategoryBudgets, initializedBlueprints]);

  const handleDeleteEnvelope = (id: string) => {
    setBlueprintEnvelopes(prev => prev.filter(bp => bp.id !== id));
  };

  const handleToggleCategoryOnEnvelope = (envId: string, categoryName: string) => {
    const categoryDef = MASTER_CATEGORIES.find(c => c.name === categoryName);
    const subCategories = categoryDef ? categoryDef.subcategories : [];

    setBlueprintEnvelopes(prev =>
      prev.map(bp => {
        if (bp.id !== envId) return bp;
        const index = bp.mappedCategories.indexOf(categoryName);
        let newCats = [...bp.mappedCategories];
        let newSubs = [...bp.mappedSubCategories];
        
        if (index > -1) {
          // Uncheck: Remove category and all its subcategories
          newCats.splice(index, 1);
          newSubs = newSubs.filter(sub => !subCategories.includes(sub));
        } else {
          // Check: Add category and all its subcategories
          newCats.push(categoryName);
          subCategories.forEach(sub => {
            if (!newSubs.includes(sub)) newSubs.push(sub);
          });
        }
        return { ...bp, mappedCategories: newCats, mappedSubCategories: newSubs };
      })
    );
  };

  const handleToggleSubCategoryOnEnvelope = (envId: string, subName: string, parentCategoryName: string) => {
    setBlueprintEnvelopes(prev =>
      prev.map(bp => {
        if (bp.id !== envId) return bp;
        const index = bp.mappedSubCategories.indexOf(subName);
        let newSubs = [...bp.mappedSubCategories];
        let newCats = [...bp.mappedCategories];

        if (index > -1) {
          // Uncheck subcategory
          newSubs.splice(index, 1);
          // If no subcategories remain for parent, should we uncheck parent?
          // Prompt only said "automatically uncheck and collapse child sub-row"
          // Let's decide to keep it simple: keep parent checked.
        } else {
          // Check subcategory
          newSubs.push(subName);
          // Add parent category if not present
          if (!newCats.includes(parentCategoryName)) {
            newCats.push(parentCategoryName);
          }
        }
        return { ...bp, mappedCategories: newCats, mappedSubCategories: newSubs };
      })
    );
  };

  // Legal check constraints
  const [privacyChecked, setPrivacyChecked] = useState<boolean>(false);
  const [termsChecked, setTermsChecked] = useState<boolean>(false);
  const [isLocalAuthEnabled, setIsLocalAuthEnabled] = useState<boolean>(false);
  const [hasSkippedAccountSetup, setHasSkippedAccountSetup] = useState<boolean>(false);

  // General Loading & Saving states
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [showCelebration, setShowCelebration] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-scroll ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Simple age check derivation
  const calculateAge = (birthDateString: string): number => {
    if (!birthDateString) return 0;
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--;
    }
    return calculatedAge;
  };

  const currentAge = dob ? calculateAge(dob) : 0;
  const isOver18 = dob ? currentAge >= 18 : false;

  // Stagger typing simulation slightly whenever step changes
  useEffect(() => {
    setIsTyping(true);
    const delayTimer = setTimeout(() => {
      setIsTyping(false);
    }, 600);
    return () => clearTimeout(delayTimer);
  }, [activeStep]);

  // Smooth WhatsApp style scroll automatic trigger
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeStep, isTyping, dependents, accountsList]);

  // Handle addition of goal chip toggles
  const handleGoalToggle = (goal: string) => {
    if (financialGoals.includes(goal)) {
      setFinancialGoals(financialGoals.filter(g => g !== goal));
    } else {
      setFinancialGoals([...financialGoals, goal]);
    }
  };

  // Stack/Save multiple accounts before final submission
  const handleAddAnotherAccount = () => {
    if (profile?.subscriptionTier === 'free' && accountsList.length >= 2) {
      alert("Free users are limited to 2 accounts. Please upgrade to add more.");
      return;
    }
    if (!accountName.trim()) {
      alert("Please enter a nickname for the new account.");
      return;
    }
    const isCreditCard = accountType === 'credit_card' || accountType === 'credit';
    let startingBalanceVal = 0;

    if (isCreditCard) {
      if (!creditOutstandingBalance.trim()) {
        alert("Please enter current outstanding balance.");
        return;
      }
      const evaluatedOutstanding = evaluateMathExpression(creditOutstandingBalance);
      if (isNaN(Number(evaluatedOutstanding))) {
        alert("Please enter a valid numeric outstanding balance.");
        return;
      }
      // Multiply entered amount by -1 to save flatly to currentBalance as negative
      startingBalanceVal = -1 * Math.abs(parseFloat(evaluatedOutstanding) || 0);
    } else {
      const evaluatedBalance = evaluateMathExpression(accountBalance);
      if (!accountBalance.trim() || isNaN(Number(evaluatedBalance))) {
        alert("Please enter a valid numeric starting balance.");
        return;
      }
      startingBalanceVal = parseFloat(evaluatedBalance) || 0;
    }

    const isSavings = accountName.toLowerCase().includes('savings');
    const newAcc: AccountItem = {
      name: accountName.trim(),
      type: isCreditCard ? 'Credit Card' : (accountType === 'cash' ? 'Cash' : 'Bank'),
      startingBalance: startingBalanceVal,
      currency: currency.toUpperCase() || 'AED'
    };

    if (!isCreditCard) {
      newAcc.bankAccountType = accountType === 'cash' ? 'Cash' : (isSavings ? 'Savings' : 'Checking');
    }

    if (isCreditCard) {
      newAcc.creditLimit = parseFloat(evaluateMathExpression(creditLimit)) || 0;
      newAcc.statementDueDate = statementDueDate || "25";
      newAcc.paymentDueDate = `2026-06-${(statementDueDate || "25").padStart(2, '0')}`;
    }

    setAccountsList([...accountsList, newAcc]);
    
    // Clear account fields with crisp transition reset
    setAccountName('');
    setAccountBalance('');
    setCreditOutstandingBalance('');
    setCreditLimit('');
    setStatementDueDate('');
    setAccountType('bank');
  };

  const handleRemoveAccount = (index: number) => {
    setAccountsList(accountsList.filter((_, idx) => idx !== index));
  };

  const handleUpdateDependent = (index: number, field: keyof Dependent, value: string | number) => {
    const updated = [...dependents];
    if (field === 'age') {
      updated[index].age = typeof value === 'number' ? value : parseInt(value as string) || 0;
    } else if (field === 'relationship') {
      updated[index].relationship = value as string;
      updated[index].relation = value as string;
    } else {
      updated[index].relation = value as string;
      updated[index].relationship = value as string;
    }
    setDependents(updated);
  };

  const handleRemoveDependent = (index: number) => {
    setDependents(dependents.filter((_, i) => i !== index));
  };

  const handleToggleTrackingOption = (opt: typeof TRACKING_OPTIONS[number]) => {
    if (selectedTrackingCategories.includes(opt.id)) {
      setSelectedTrackingCategories(selectedTrackingCategories.filter(id => id !== opt.id));
      setOnboardingBudgets(onboardingBudgets.filter(ob => ob.category !== opt.category || (opt.subcategory && ob.subcategory !== opt.subcategory)));
    } else {
      setSelectedTrackingCategories([...selectedTrackingCategories, opt.id]);
      setOnboardingBudgets([
        ...onboardingBudgets,
        {
          title: opt.label,
          category: opt.category,
          subcategory: opt.subcategory,
          maxBudget: 0,
          period: 'daily',
          currency: currency || 'AED',
          emoji: opt.emoji
        }
      ]);
    }
  };

  const handleUpdateOnboardingBudget = (index: number, field: keyof OnboardingBudget, value: any) => {
    const updated = [...onboardingBudgets];
    if (field === 'maxBudget') {
      updated[index].maxBudget = value;
    } else if (field === 'period') {
      updated[index].period = value;
    }
    setOnboardingBudgets(updated);
  };

  // Step submit logic for conversational flows
  const handleStepSubmit = (stepNumber: number) => {
    if (stepNumber === 1) {
      if (!fullName.trim()) return;
      setActiveStep(2);
    } 
    else if (stepNumber === 2) {
      if (!dob || !isOver18) return;
      setActiveStep(3); // Go to new Step 3: Relationship Status Discovery Step
    }
    else if (stepNumber === 4) { // Step 4 (Dependents)
      setActiveStep(5); // Go to Step 5 (Adaptive tracking style choice)
    }
    else if (stepNumber === 5) { // Step 5 (Adaptive tracking style choice)
      setActiveStep(6); // Go to Step 6 (Base Currency selector)
    }
    else if (stepNumber === 7) { // Step 7 (Goals & Experience confirmation)
      if (primaryGoal && goalAmount.trim() !== '') {
        if (incomeTrackingType === 'payroll') {
          setActiveStep(8); // Go to Step 8 (Payroll Confirmation)
        } else {
          setActiveStep(9); // Go to Step 9 (Accounts setup)
        }
      }
    }
  };

  // Applies 50/30/20 blueprint envelopes instantly into Firestore
  const handleApplyBlueprintEnvelopes = async () => {
    try {
      setIsSaving(true);
      const activeCurrency = currency || 'AED';
      const tempBudgets: OnboardingBudget[] = [];

      for (const bp of blueprintEnvelopes) {
        if (bp.mappedSubCategories.length > 0) {
          for (const sub of bp.mappedSubCategories) {
            const subAmt = parseFloat(subCategoryBudgets[sub]) || 0;
            const budgetRef = doc(collection(db, `users/${uid}/miniBudgets`));
            const payload = {
              budgetId: budgetRef.id,
              id: budgetRef.id,
              userId: uid,
              categoryTitle: sub,
              allocatedAmount: subAmt,
              spentAmount: 0.00,
              currency: activeCurrency,
              iconAsset: bp.iconAsset,
              categoryGroup: bp.categoryGroup,
              mappedCategories: [sub],
              mappedSubCategories: [sub],
              period: 'monthly',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await setDoc(budgetRef, payload);

            tempBudgets.push({
              title: sub,
              category: sub,
              maxBudget: subAmt,
              period: 'monthly',
              currency: activeCurrency,
              emoji: bp.emoji
            });
          }
        } else {
          const evalAmt = parseFloat(evaluateMathExpression(bp.allocatedAmount)) || 0;
          const budgetRef = doc(collection(db, `users/${uid}/miniBudgets`));
          const payload = {
            budgetId: budgetRef.id,
            id: budgetRef.id,
            userId: uid,
            categoryTitle: bp.categoryTitle,
            allocatedAmount: evalAmt,
            spentAmount: 0.00,
            currency: activeCurrency,
            iconAsset: bp.iconAsset,
            categoryGroup: bp.categoryGroup,
            mappedCategories: bp.mappedCategories || [],
            mappedSubCategories: bp.mappedSubCategories || [],
            period: 'monthly',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await setDoc(budgetRef, payload);

          tempBudgets.push({
            title: bp.categoryTitle,
            category: bp.categoryTitle,
            maxBudget: evalAmt,
            period: 'monthly',
            currency: activeCurrency,
            emoji: bp.emoji
          });
        }
      }

      setOnboardingBudgets(tempBudgets);
      setBlueprintsApplied(true);
      setIsSaving(false);

      // Transition smoothly to next Step
      setActiveStep(11);
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error("Error committing blueprint budgets:", err);
      setIsSaving(false);
    }
  };

  // Commits the finalized collection structures to active Cloud Firestore optimistically (non-blocking)
  const handleFinalizeOnboarding = async (isTour: boolean = false) => {
    if (isSaving) return;
    
    // Check if free user is trying to add an account
    if (profile?.subscriptionTier === 'free' && !hasSkippedAccountSetup && accountName.trim()) {
      alert("Free users cannot add bank accounts.");
      return;
    }
    
    // Prepare accounts
    let finalAccounts = hasSkippedAccountSetup ? [] : [...accountsList];
    if (checkingDestination === 'dedicated') {
      // Filter out existing default accounts to prevent duplicates
      finalAccounts = finalAccounts.filter(acc => !acc.name.toLowerCase().includes('checking') && !acc.name.toLowerCase().includes('salary'));
    }

    if (!hasSkippedAccountSetup && accountName.trim()) {
      const isCreditCard = accountType === 'credit_card' || accountType === 'credit';
      if (isCreditCard && creditOutstandingBalance.trim()) {
        const evaledBal = evaluateMathExpression(creditOutstandingBalance);
        const startingBalanceVal = -1 * Math.abs(parseFloat(evaledBal) || 0);
        finalAccounts.push({
          name: accountName.trim(),
          type: isCreditCard ? 'Credit Card' : (accountType === 'cash' ? 'Cash' : 'Bank'),
          bankAccountType: isCreditCard ? undefined : (accountType === 'cash' ? 'Cash' : (accountName.toLowerCase().includes('savings') ? 'Savings' : 'Checking')),
          startingBalance: startingBalanceVal,
          currency: currency.toUpperCase() || 'AED',
          creditLimit: parseFloat(evaluateMathExpression(creditLimit)) || 0,
          statementDueDate: statementDueDate || "25",
          paymentDueDate: `2026-06-${(statementDueDate || "25").padStart(2, '0')}`
        });
      } else if (!isCreditCard && accountBalance.trim()) {
        const isSavings = accountName.toLowerCase().includes('savings');
        finalAccounts.push({
          name: accountName.trim(),
          type: accountType === 'cash' ? 'Cash' : 'Bank',
          bankAccountType: accountType === 'cash' ? 'Cash' : (isSavings ? 'Savings' : 'Checking'),
          startingBalance: parseFloat(evaluateMathExpression(accountBalance)) || 0,
          currency: currency.toUpperCase() || 'AED'
        });
      }
    }

    // Ensure the auto-generated Salary Account is instantiated if opted
    if (checkingDestination === 'dedicated') {
      const evalSalaryBal = parseFloat(evaluateMathExpression(salaryAccountStartingBalance)) || 0;
      const checkingAccName = salaryAccountName.trim() || 'Salary Account';
      
      // Check if this account already exists in the accounts list from previous steps
      const existingAccIndex = finalAccounts.findIndex(a => a.name === checkingAccName);
      
      if (existingAccIndex !== -1) {
        // Update existing account
        finalAccounts[existingAccIndex] = {
          ...finalAccounts[existingAccIndex],
          startingBalance: evalSalaryBal
        };
      } else {
        // Create new account
        finalAccounts.push({
          name: checkingAccName,
          type: 'Bank',
          bankAccountType: 'Checking',
          startingBalance: evalSalaryBal,
          currency: currency.toUpperCase() || 'AED'
        });
      }
    }

    if (finalAccounts.length === 0) {
      // Create fallback account to ensure hydration
      finalAccounts.push({
        name: 'Primary Capital',
        type: 'bank',
        startingBalance: 1000,
        currency: 'AED'
      });
    }

    setIsSaving(true);
    
    const homeCurrency = finalAccounts[0]?.currency || currency || 'AED';
    const userEmail = profile?.email || 'majedhabal2@gmail.com';
    const existingCreatedAt = profile?.createdAt || new Date().toISOString();
    const existingLastLogin = profile?.lastLogin || new Date().toISOString();
    const rawTier = (profile?.subscriptionTier || 'free').toLowerCase();
    const existingSubscriptionTier = rawTier === 'premium' ? 'tier 1' : (rawTier === 'tier1' ? 'tier 1' : (rawTier === 'tier2' ? 'tier 2' : (rawTier === 'tier3' ? 'tier 3' : rawTier)));
    const isPaid = ['tier 1', 'tier 2', 'tier 3'].includes(existingSubscriptionTier);
    const initialCurrencies = isPaid ? [homeCurrency, 'USD'] : [homeCurrency];

    const payload = {
      uid: uid,
      fullName: fullName.trim(),
      displayName: fullName.trim().split(' ')[0] || randomPlaceholder.split(' ')[0],
      email: userEmail,
      dob: dob || "1990-01-01T00:00:00Z",
      maritalStatus: relationshipStatus || (dependents.length > 0 ? 'Married' : 'Single'),
      dependents: dependents
        .filter(d => (d.relationship || d.relation || '').trim() !== '')
        .map(d => ({
          relationship: d.relationship || d.relation,
          age: Number(d.age) || 0
        })),
      baseCurrency: homeCurrency,
      enabledCurrencies: profile?.enabledCurrencies || initialCurrencies,
      financialExperience: Number(financialExperience) || 3,
      primaryFinancialGoal: primaryGoal || '',
      financialGoals: primaryGoal || (Array.isArray(financialGoals) ? financialGoals.join(', ') : (financialGoals || "Buy a family villa, optimize long-term savings")),
      createdAt: existingCreatedAt,
      updatedAt: new Date().toISOString(),
      language: selectedLanguage,
      geminiInsightsEnabled: profile?.geminiInsightsEnabled !== undefined ? profile.geminiInsightsEnabled : true,
      hasAcceptedTerms: true,
      salaryAmount: incomeTrackingType === 'payroll' ? (parseFloat(evaluateMathExpression(salaryAmount)) || 0) : null,
      onboardedAt: new Date().toISOString(),
      lastLogin: existingLastLogin,
      subscriptionTier: existingSubscriptionTier,
      isOnboarded: true,
      incomeTrackingType: incomeTrackingType,
      theme: 'light',
      isLocalAuthEnabled: isLocalAuthEnabled, // Biometric setting mapped to profile record
      isProductTourActive: isTour // Active product tour flag
    };

    try {
      // Create a version of the accounts with a 0 starting balance for local persistence
      const accountsWithZeroStart = finalAccounts.map(acc => ({
        ...acc,
        startingBalance: 0
      }));

      // 1. Instantly write keys to local storage to ensure persistent fallback hydration
      localStorage.setItem(`vantage_offline_profile_${uid}`, JSON.stringify(payload));
      localStorage.setItem(`vantage_offline_accounts_${uid}`, JSON.stringify(accountsWithZeroStart));

      // 2. Fire-and-forget background synchronization tasks in Cloud Firestore.
      // Since localCache persistence is active, writes are registered in IndexedDB instantly.
      const userRef = doc(db, 'users', uid);

      setDoc(userRef, payload, { merge: true }).catch(err => {
        console.warn("Optimistic background sync (profile):", err);
      });

      let checkingAccountId = '';
      const createdAccountIds: string[] = [];
      const accountCreationPromises = [];

      for (const acc of finalAccounts) {
        const accSubRef = doc(collection(db, `users/${uid}/accounts`));
        if (checkingDestination === 'dedicated' && acc.name === (salaryAccountName.trim() || 'Salary Account')) {
          checkingAccountId = accSubRef.id;
        }
        const originalStartingBalance = Number(acc.startingBalance) || 0;
        const isBank = acc.type === 'bank' || acc.type === 'savings';
        const isCash = acc.type === 'cash';
        const isCredit = acc.type === 'credit' || acc.type === 'credit_card' || acc.type === 'Credit Card';
        const isLoan = acc.type === 'loan' || acc.type === 'Personal Loan' || acc.type === 'personal loan';
        const isMortgage = acc.type === 'mortgage' || acc.type === 'Mortgage';

        let finalAccObj: any;

        if (isBank) {
          finalAccObj = {
            accountId: accSubRef.id,
            id: accSubRef.id, // For backward compatibility
            userId: uid,
            type: "Bank",
            bankAccountType: acc.type === 'savings' ? "Savings" : "Checking",
            name: acc.name,
            currency: acc.currency,
            startingBalance: 0.00,
            currentBalance: 0.00,
            minBalanceFloor: 0.00,
            defaultTransferFee: 0.00,
            atmAutoSync: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        } else if (isCash) {
          finalAccObj = {
            accountId: accSubRef.id,
            id: accSubRef.id, // For backward compatibility
            userId: uid,
            type: "Cash",
            bankAccountType: "Cash",
            name: acc.name,
            currency: acc.currency,
            startingBalance: 0.00,
            currentBalance: 0.00,
            minBalanceFloor: 0.00,
            defaultTransferFee: 0.00,
            atmAutoSync: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        } else if (isCredit || isLoan || isMortgage) {
          const exactType = isCredit ? "Credit Card" : (isLoan ? "Personal Loan" : "Mortgage");
          finalAccObj = {
            accountId: accSubRef.id,
            id: accSubRef.id, // For backward compatibility
            userId: uid,
            type: exactType,
            name: acc.name,
            currency: acc.currency,
            startingBalance: 0.00,
            currentBalance: 0.00,
            interestRate: 0.0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          if (exactType === "Credit Card") {
            finalAccObj.creditLimit = acc.creditLimit !== undefined ? Number(acc.creditLimit) : 0.0;
            finalAccObj.paymentDueDate = acc.paymentDueDate || "";
            finalAccObj.statementDueDate = acc.statementDueDate || "";
          } else {
            finalAccObj.recurringProtocol = "";
          }
        } else {
          finalAccObj = {
            id: accSubRef.id,
            name: acc.name,
            type: acc.type,
            startingBalance: 0.00,
            currentBalance: 0.00,
            currency: acc.currency,
            createdAt: serverTimestamp()
          };
        }
        
        createdAccountIds.push(accSubRef.id);
        
        if (acc.name.trim().toLowerCase() === (salaryAccountName.trim() || 'salary account').toLowerCase()) {
          checkingAccountId = accSubRef.id;
        }

        accountCreationPromises.push(setDoc(accSubRef, finalAccObj));

        // Generate the initial tracking ledger credit baseline transaction entry
        if (originalStartingBalance !== 0 && !acc.name.toLowerCase().includes('salary')) {
          const txRef = doc(collection(db, `users/${uid}/transactions`));
          const isExpense = originalStartingBalance < 0;
          const initTxObj = {
            id: txRef.id,
            userId: uid,
            accountId: accSubRef.id,
            type: isExpense ? 'expense' : 'income',
            amount: Math.abs(originalStartingBalance),
            category: 'Others',
            subcategory: 'Starting Balance',
            classification: 'starting_balance',
            notes: 'Starting Balance',
            description: 'Starting Balance',
            merchant: 'Starting Balance',
            date: new Date().toISOString().split('T')[0], // Localized YYYY-MM-DD format
            createdAt: serverTimestamp(),
            emoji: '💰',
            status: 'confirmed'
          };

          accountCreationPromises.push(setDoc(txRef, initTxObj));

          // Sequentially update account's currentBalance to reflect the setup funds ledger transaction
          const finalBal = isCredit ? -1 * Math.abs(originalStartingBalance) : originalStartingBalance;
          accountCreationPromises.push(updateDoc(accSubRef, {
            currentBalance: finalBal,
            updatedAt: new Date().toISOString()
          }));
        } else if (originalStartingBalance !== 0 && acc.name.toLowerCase().includes('salary')) {
          // Still need to update the balance for the salary account, even if we skip the ledger tx
          const finalBal = isCredit ? -1 * Math.abs(originalStartingBalance) : originalStartingBalance;
          accountCreationPromises.push(updateDoc(accSubRef, {
            currentBalance: finalBal,
            updatedAt: new Date().toISOString()
          }));
        }
      }

      await Promise.all(accountCreationPromises);

      // Automatically initialize the target entity inside the 'accounts' collection
      console.log("handleFinalizeOnboarding: Checking primaryGoal", { primaryGoal, goalAmount });
      if (primaryGoal) {
        const config = GOALS_CONFIG.find(g => g.key === primaryGoal);
        console.log("handleFinalizeOnboarding: Found config", config);
        if (config) {
          const accSubRef = doc(collection(db, `users/${uid}/accounts`));
          const goalVal = parseFloat(goalAmount) || 0;
          
          let goalAccObj: any = {
            accountId: accSubRef.id,
            id: accSubRef.id, // For backward compatibility
            userId: uid,
            type: config.key === 'tackle_debt' ? 'Personal Loan' : (config.key === 'investment_portfolio' ? 'Investment' : (config.accountType === 'savings' ? 'Savings' : 'Liability')),
            tabGroup: "essentials",
            subTabSection: config.key === 'tackle_debt' ? 'debt' : 'default',
            name: config.key === 'tackle_debt' ? "Onboarding Debt" : config.label,
            institution: config.key === 'tackle_debt' ? "Primary Provider" : undefined,
            currency: homeCurrency,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          if (config.key === 'investment_portfolio') {
            goalAccObj.startingBalance = 0.00;
            goalAccObj.currentBalance = 0.00;
            goalAccObj.platformFees = 0.00;
            goalAccObj.totalGainLoss = 0.00;
            goalAccObj.includeInLiquidity = false;
            goalAccObj.subAssets = [];
          } else if (config.key === 'tackle_debt') {
            goalAccObj.totalDebtAmount = goalVal;
            goalAccObj.startingBalance = -1 * Math.abs(goalVal);
            goalAccObj.currentBalance = -1 * Math.abs(goalVal);
            goalAccObj.monthlyPaymentAmount = (parseFloat(evaluateMathExpression(salaryAmount)) || 12000) * 0.40;
            goalAccObj.interestRate = 0.0;
            goalAccObj.statementDueDate = 1;
          } else if (config.accountType === 'liability') {
            goalAccObj.startingBalance = -1 * Math.abs(goalVal);
            goalAccObj.currentBalance = -1 * Math.abs(goalVal);
            goalAccObj.interestRate = 0.0;
            goalAccObj.recurringProtocol = "";
          } else {
            goalAccObj.startingBalance = 0.00;
            goalAccObj.currentBalance = 0.00;
          }

          // Write to Firestore optimistically
          setDoc(accSubRef, goalAccObj).catch(err => {
            console.warn("Optimistic background sync (goal account):", err);
          });

          // Automatically initialize reference inside the 'milestones' collection if not tackle_debt
          console.log("Creating account for config:", config.key, "goalVal:", goalVal);
          if (config.key !== 'tackle_debt') {
            console.log("Creating milestone for config:", config.key);
            const milestoneRef = doc(collection(db, `users/${uid}/milestones`));
            const milestonePayload = {
              id: milestoneRef.id,
              name: config.label,
              targetAmount: goalVal,
              currentValue: 0.00,
              monthsToTarget: 12,
              linkedAccountIds: [accSubRef.id],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isArchived: false,
              userId: uid
            };
            
            // Local cache update for offline resilience
            const prevSavedMilestonesStr = localStorage.getItem(`vantage_offline_milestones_${uid}`);
            let prevSavedMilestones = [];
            try {
              if (prevSavedMilestonesStr) {
                prevSavedMilestones = JSON.parse(prevSavedMilestonesStr);
              }
            } catch (e) {
              console.warn("Error parsing offline milestones:", e);
            }
            localStorage.setItem(
              `vantage_offline_milestones_${uid}`,
              JSON.stringify([...prevSavedMilestones, milestonePayload])
            );

            // Write to Firestore Milestones collection
            await setDoc(milestoneRef, milestonePayload);
          } else {
            console.log("Creating debt milestone for config:", config.key);
            // It is tackle_debt, automatically initialize reference inside the 'debtMilestones' collection
            const debtMilestoneRef = doc(collection(db, `users/${uid}/debtMilestones`));
            const debtMilestonePayload = {
              id: debtMilestoneRef.id,
              name: config.label,
              principleAmount: goalVal,
              paymentFrequency: "Monthly",
              paymentAmount: (parseFloat(evaluateMathExpression(salaryAmount)) || 12000) * 0.40,
              accountId: accSubRef.id,
              loanDirection: "borrowed",
              isArchived: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              userId: uid
            };

            // Write to Firestore debtMilestones collection
            setDoc(debtMilestoneRef, debtMilestonePayload).catch(err => {
              console.warn("Optimistic background sync (debt milestone onboarding):", err);
            });
          }
        }
      }

      // Automatically create a recurring income rule matching the salary parameters
      const evalSalary = profile?.salaryAmount || (parseFloat(String(evaluateMathExpression(salaryAmount)).replace(/[^0-9.]/g, '')) || 0);
      console.log("Salary evaluation details:", { salaryAmount, evalSalary, uid: uid, checkingAccountId, checkingDestination, paymentDay });
      
      if (evalSalary > 0) {
        console.log("Condition evalSalary > 0 met, proceeding to create recurring transaction");
        try {
          const recRef = doc(collection(db, `users/${uid}/recurringTransactions`));
          const targetAccountId = checkingAccountId || (createdAccountIds.length > 0 ? createdAccountIds[0] : 'manual-fallback-acc');
          
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth();
          const userDay = paymentDay ? Number(paymentDay) : 1;
          
          let nextExecutionDateObj = new Date(currentYear, currentMonth, userDay);
          if (nextExecutionDateObj < now) {
            nextExecutionDateObj = new Date(currentYear, currentMonth + 1, userDay);
          }
          
          const yyyy = nextExecutionDateObj.getFullYear();
          const mm = String(nextExecutionDateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(nextExecutionDateObj.getDate()).padStart(2, '0');
          const nextExecutionDate = `${yyyy}-${mm}-${dd}`;

          const recurringRulePayload = {
            // Exact required schema
            recurringId: recRef.id,
            userId: uid,
            title: 'Monthly Salary',
            amount: evalSalary,
            transactionType: 'income',
            type: 'income',
            category: 'Income',
            subcategory: 'Wage',
            recurrency: 'monthly',
            frequency: 'Monthly',
            interval: 1,
            sourceAccountId: targetAccountId,
            accountId: targetAccountId,
            startDate: nextExecutionDate,
            nextExecutionDate: nextExecutionDate,
            nextGenerationDate: nextExecutionDate,
            dayOption: 'sameDate',
            specificDayOfMonth: null,
            duration: 'Indefinite',
            durationLimit: '',
            notes: '',
            isActive: true,
            isBreakdownConfigured: true,
            emoji: '💰',
            isSyncedToCalendar: false,
            isSyncedToTasks: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          // Save to localStorage for instant local access
          localStorage.setItem(`vantage_offline_recurring_${uid}`, JSON.stringify([recurringRulePayload]));

          // Save to Firebase Firestore
          console.log("DEBUG: About to write recurring transaction to Firestore:", {
            recRefId: recRef.id,
            uid: uid,
            payload: recurringRulePayload
          });
          
          await setDoc(recRef, {
            ...recurringRulePayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          console.log("DEBUG: Recurring transaction created successfully in Firestore");
        } catch (error) {
          console.error("Critical error creating recurring transaction:", error);
        }
      } else {
        console.warn("Salary amount is 0 or invalid, skipping recurring transaction creation.", { salaryAmount, evalSalary });
      }

      if (!blueprintsApplied) {
        await Promise.all(onboardingBudgets.map(ob => {
          const budgetRef = doc(collection(db, `users/${uid}/miniBudgets`));
          return setDoc(budgetRef, {
            budgetId: budgetRef.id,
            userId: uid,
            categoryTitle: ob.title,
            allocatedAmount: parseFloat(evaluateMathExpression(ob.maxBudget)) || 0,
            spentAmount: 0,
            currency: ob.currency,
            iconAsset: ob.emoji || 'shopping-cart',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }));
      }

      // 3. Immediate UI Transition with Gorgeous Celebration (No-Block Routing)
      setIsSaving(false);
      setShowCelebration(true);
      setTimeout(() => {
        onSuccess({
          ...profile,
          ...payload
        });
      }, 1500);
    } catch (err: any) {
      console.warn("Graceful local device storage routing block fallback:", err);
      setIsSaving(false);
      setShowCelebration(true);
      setTimeout(() => {
        onSuccess({
          ...profile,
          ...payload
        });
      }, 1500);
    }
  };

  const getInsightText = (): string => {
    if (financialGoals.includes('Emergency Shield')) {
      return 'Emergency Fund target calculated based on your profile setup. We recommend securing at least 3-6 months of basic operational expenses.';
    }
    if (financialGoals.includes('Save for Retirement')) {
      return 'Retirement wealth dynamic pathway generated. Based on your current age, a compound-interest strategy has been configured.';
    }
    if (financialGoals.includes('Buy Property')) {
      return 'Property downpayment milestone metrics established. Savings vault allocation rules are now optimized for secure liquid growth.';
    }
    if (financialGoals.includes('Settle Liabilities')) {
      return 'Strategic debt elimination scheduling enabled, designed to minimize interest drag and boost cash flow velocity.';
    }
    if (financialGoals.includes('Minimize Taxes')) {
      return 'Tax efficiency guidelines selected. We will map custom ledger allocations aligning to allowances.';
    }
    return 'Emergency shield and capital growth trajectories are calibrated specifically for ' + (fullName.trim() ? fullName.trim() : randomPlaceholder) + '.';
  };

  const experienceLabels = [
    { level: 1, text: '🌱 Beginning standard budgeting' },
    { level: 3, text: '📈 Regular strategic portfolios' },
    { level: 5, text: '🏆 Aggressive wealth optimization' }
  ];

  const goalListString = financialGoals.map(gKey => {
    return t(`onboarding.goals.${gKey}.label`, gKey);
  }).join(', ');

  return (
    <div className="fixed inset-0 z-[150] bg-[#F8F9FA] text-black flex items-center justify-center font-sans select-none overflow-hidden">
      <div className="w-full h-full md:w-[35%] lg:w-[35%] xl:w-[35%] md:max-w-[35%] bg-white md:rounded-[24px] md:shadow-[0_12px_44px_rgba(0,0,0,0.06)] md:border md:border-[#E1E8ED] flex flex-col overflow-hidden relative">
        
        {showAuthGateway ? (
          <div className="flex-1 flex flex-col justify-between p-6 bg-white overflow-y-auto selection:bg-[#E9F5ED]" style={{ fontFamily: '"Google Sans", sans-serif' }}>
            <div className="flex-1 flex flex-col items-center justify-center gap-6 my-auto">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm">
                <Lock size={20} className="text-emerald-600" />
              </div>
              
              <div className="text-center space-y-1.5 shrink-0 select-none">
                <h2 className="text-lg font-bold text-neutral-900 leading-tight">
                  {t('onboarding_flow.auth_gateway.title', 'Secure Your Workspace')}
                </h2>
                <p className="text-xs text-neutral-500 font-normal px-2 leading-relaxed">
                  {t('onboarding_flow.auth_gateway.subtitle', 'Before setting up your profile, please log in or sign up so your finances, checking accounts, and budgets can be saved securely.')}
                </p>
              </div>

              {authStatus === 'idle' && (
                <div className="w-full flex flex-col gap-4">
                  <button 
                    onClick={handleGoogleAuth}
                    type="button"
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-center text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <ShieldCheck size={16} />
                    {t('onboarding_flow.auth_gateway.google_login', 'Secure Google credential lock')}
                  </button>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleFacebookAuth}
                      type="button"
                      className="flex-1 py-3 px-4 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-xl text-center text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Facebook size={16} />
                      {t('onboarding_flow.auth_gateway.facebook_login', 'Continue with Facebook')}
                    </button>
                  </div>

                  <div className="flex items-center select-none py-1">
                    <div className="flex-1 border-t border-neutral-100"></div>
                    <span className="px-3 text-[10px] text-neutral-300 font-bold">{t('onboarding_flow.auth_gateway.or_direct_gateway', 'Or Direct Gateway')}</span>
                    <div className="flex-1 border-t border-neutral-100"></div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-neutral-150 bg-[#F8FAFC] p-4 shadow-sm text-left">
                    <label className="text-[11px] font-bold text-neutral-700" htmlFor="flow-gateway-email">
                      {authAuthMode === 'email-entry' ? t('onboarding_flow.auth_gateway.email_gateway_label', 'Email connection gateway') : t('onboarding_flow.auth_gateway.password_entry_label', 'Enter your password')}
                    </label>
                    <input 
                      id="flow-gateway-email"
                      type={authAuthMode === 'email-entry' ? "email" : "password"}
                      placeholder={authAuthMode === 'email-entry' ? t('onboarding_flow.auth_gateway.email_placeholder', 'name@company.com') : t('onboarding_flow.auth_gateway.password_placeholder', 'Password')}
                      value={authAuthMode === 'email-entry' ? authEmail : authPassword}
                      onChange={(e) => authAuthMode === 'email-entry' ? setAuthEmail(e.target.value) : setAuthPassword(e.target.value)}
                      className="w-full bg-white border border-[#D1D8E0] rounded-lg px-3 py-2 text-xs font-bold text-neutral-800 outline-none focus:border-emerald-600 transition-colors placeholder:text-neutral-400 placeholder:font-normal"
                    />
                    <button
                      onClick={handleEmailAction}
                      disabled={authAuthMode === 'email-entry' ? (!authEmail || !authEmail.includes('@')) : !authPassword}
                      type="button"
                      className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200/60 transition-all cursor-pointer"
                    >
                      {authAuthMode === 'email-entry' ? t('onboarding_flow.auth_gateway.continue_btn', 'Continue') : t('onboarding_flow.auth_gateway.sign_in_up_btn', 'Sign In / Sign Up')}
                    </button>
                  </div>
                </div>
              )}

              {authStatus === 'loading' && (
                <div className="w-full flex flex-col items-center justify-center py-6 gap-3">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-2 border-emerald-100 rounded-full"></div>
                    <div className="absolute inset-x-0 inset-y-0 border-t-2 border-emerald-600 rounded-full animate-spin"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-emerald-600 font-bold text-xs">Connecting securely</p>
                    <p className="text-neutral-400 text-[10px] mt-0.5">Authorizing portal connection session</p>
                  </div>
                </div>
              )}

              {authStatus === 'success' && (
                <div className="w-full flex flex-col items-center justify-center py-6 gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                    <Check size={20} />
                  </div>
                  <p className="text-neutral-900 font-bold text-xs text-center">Active session authorized</p>
                </div>
              )}

              {authStatus === 'error' && (
                <div className="w-full flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 border border-red-100">
                    <Lock size={20} />
                  </div>
                  <p className="text-xs font-normal text-red-500 text-center px-4 leading-relaxed">{authErrorMsg}</p>
                  <button 
                    onClick={() => setAuthStatus('idle')}
                    type="button"
                    className="bg-white rounded-[10px] text-black w-[45px] text-xs font-bold transition-all cursor-pointer text-center"
                  >
                    Retry Connection
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-neutral-200/60 pt-4 pb-2 text-center select-none shrink-0 space-y-2">
              <button 
                onClick={() => setShowAuthGateway(false)}
                type="button"
                className="text-xs text-neutral-400 font-normal hover:text-neutral-600 underline cursor-pointer"
              >
                Continue with Sandbox (unsaved progress)
              </button>
              <p className="text-[#8B95A5] text-[9px] font-normal leading-relaxed">
                YOUR FINANCES by ME Vantage &bull; UAE Financial Security Framework
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Dynamic progression header indicator */}
            <div className="w-full h-1 bg-[#E1E8ED] relative shrink-0">
              <motion.div 
                className="h-full bg-black shadow-[0_1px_8px_rgba(0,0,0,0.15)]"
                initial={{ width: '0%' }}
                animate={{ 
                  width: `${(
                    (activeStep <= 7 ? activeStep : (incomeTrackingType === 'lump_sum' ? activeStep - 1 : activeStep)) / 
                    (incomeTrackingType === 'lump_sum' ? 11 : 12)
                  ) * 100}%` 
                }}
                transition={{ duration: 0.3 }}
              />
            </div>

            {/* Warm Header with WhatsApp status-like profile */}
            <header className="px-4 py-2 bg-white border-b border-[#E1E8ED] flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-2.5">
                {/* Avatar simulation circle */}
                <div className="relative">
                  <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-200 flex items-center justify-center text-[#00FF88] text-xs select-none">
                    Ꮩ
                  </div>
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#00FF88] rounded-full border border-white" />
                </div>
                
                <div className="flex flex-col">
                  <h1 style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-xs font-bold text-black leading-none">YOUR FINANCES</h1>
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-neutral-500 tracking-tight mt-0.5">
                    by ME Vantage
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8.5px] text-black bg-[#E9ECEF] border border-[#D1D8DD] px-2 py-1 rounded-full tracking-wider uppercase">
                  {t("onboarding.step", "Step")} {activeStep <= 7 ? activeStep : (incomeTrackingType === 'lump_sum' ? activeStep - 1 : activeStep)}/{incomeTrackingType === 'lump_sum' ? 11 : 12}
                </span>
              </div>
        </header>

        {/* Main Chat Feed Area */}
        <div 
          style={{ 
            backgroundImage: CHAT_DOODLE_BACKGROUND, 
            backgroundSize: '240px 320px', 
            backgroundRepeat: 'repeat' 
          }} 
          className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-y-2 w-full scrollbar-none"
        >
        
        {/* Date Stamp Separator */}
        <div className="flex justify-center my-1 select-none">
          <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="px-3 py-1 bg-white/70 border border-[#E1E8ED] rounded-full text-[9px] uppercase tracking-widest text-[#57606F] shadow-sm">
            {t("onboarding.today", "Today")}
          </span>
        </div>

        {/* --- MESSAGE 1: Bot (Introduce full name) --- */}
        <div className="flex flex-col gap-1.5 self-start max-w-[85%]">
          <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
              {t("onboarding.welcome")}
            </p>
            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed mt-1">
              {t("onboarding.process_desc")}
            </p>
            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed mt-1">
              {t("onboarding.ask_name")}
            </p>
          </div>
        </div>

        {/* --- LANGUAGE SELECTION --- */}
        {activeStep === 1 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[85%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
                {t("onboarding.preferred_lang")}
              </p>
            </div>
            <div className="bg-white border border-[#E1E8ED] rounded-2xl p-4 shadow-sm mt-1">
              <LanguageSelector onLanguageChange={(lng) => {
                 setSelectedLanguage(lng);
              }} />
            </div>
          </div>
        )}

        {/* --- USER RESPONSE 1 --- */}
        {activeStep > 1 && fullName && (
          <div className="flex flex-col gap-1 self-end max-w-[85%]">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight">
                {fullName}
              </p>
            </div>
          </div>
        )}

        {/* --- MESSAGE 2: Bot (Introduce birthday check) --- */}
        {activeStep >= 2 && (
          <div className="flex flex-col gap-1.5 self-start max-w-[85%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
                {t("onboarding.pleasure_meeting", { name: (fullName.trim() || randomPlaceholder).split(' ')[0] })}
              </p>
            </div>
          </div>
        )}

        {/* --- USER RESPONSE 2 --- */}
        {activeStep > 2 && dob && (
          <div className="flex flex-col gap-1 self-end max-w-[85%]">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight">
                {dob}
              </p>
            </div>
          </div>
        )}

        {/* --- NEW MESSAGE 3: Bot (Relationship Status Selection) --- */}
        {activeStep >= 3 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[90%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11.5px, 3.3vw, 13.5px)" }} className="leading-relaxed font-normal">
                {t("onboarding.relationship_status", "What is your relationship status?")}
              </p>
            </div>

            {/* Selection Options - 4 capsules labeled "Married", "Single", "Widowed", "Others" */}
            {activeStep === 3 && (
              <div className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-3 shadow-sm flex flex-col gap-3 mt-1">
                <div className="flex flex-wrap gap-1.5 select-none font-sans justify-center">
                  {['Single', 'Married', 'Widowed', 'Others'].map((status) => {
                    const isSelected = relationshipStatus === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          if (profile) {
                            profile.relationshipStatus = status; // saved immediately to local profile object structure
                          }
                          setRelationshipStatus(status);
                          setActiveStep(4);
                          setTimeout(() => {
                            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className={`px-3 py-1.5 h-[32px] rounded-full border text-[10.5px] transition-all cursor-pointer flex items-center justify-center ${
                          isSelected 
                            ? 'bg-black text-[#00FF88] border-black scale-[1.01] shadow-sm font-semibold' 
                            : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {t(`marital_status_options.${status.toLowerCase()}`, status)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- NEW USER RESPONSE 3 --- */}
        {activeStep > 3 && relationshipStatus && (
          <div className="flex flex-col gap-1 self-end max-w-[85%] animate-fadeIn">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm text-right">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight font-normal">
                {t(`marital_status_options.${relationshipStatus.toLowerCase()}`, relationshipStatus)}
              </p>
            </div>
          </div>
        )}

        {/* --- MESSAGE 4: Bot (Dependents form query) --- */}
        {activeStep >= 4 && (
          <div className="flex flex-col gap-1.5 self-start max-w-[85%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
                {t("onboarding.dependents_info", "Tell us about your household and dependents below. You can skip this or add family members directly.")}
              </p>
            </div>
          </div>
        )}

        {/* --- USER RESPONSE 4 --- */}
        {activeStep > 4 && (
          <div className="flex flex-col gap-1 self-end max-w-[85%]">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight">
                {dependents.length === 0 
                  ? t("onboarding.no_dependents", "Independent (No dependents)") 
                  : t("onboarding.dependents_added", "{{count}} household dependent(s) added", { count: dependents.length })}
              </p>
            </div>
          </div>
        )}

        {/* --- NEW MESSAGE: Bot (Routing Choice Viewport Step - Step 5) --- */}
        {activeStep >= 5 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[90%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50 animate-fadeIn">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
                {t("onboarding.working_query", "Are you currently working? Please tell us more about your income sources.")}
              </p>
            </div>

            {/* --- ROUTING CHOICE INTERACTIVE CARD LAYOUT --- */}
            {activeStep === 5 && (
              <div className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-3 shadow-sm flex flex-col gap-2.5 mt-1.5 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setIncomeTrackingType('payroll');
                    if (profile) {
                      profile.incomeTrackingType = 'payroll';
                    }
                    setActiveStep(6);
                    setTimeout(() => {
                      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className={`w-full p-4 rounded-xl border transition-all text-left cursor-pointer flex flex-col gap-1 hover:border-black hover:bg-neutral-50/50 ${
                    incomeTrackingType === 'payroll' ? 'border-black bg-neutral-50/10' : 'border-[#E1E8ED] bg-white'
                  }`}
                >
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-xs text-black font-bold">
                    {t("onboarding.payroll_title")}
                  </span>
                  <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-500 leading-normal">
                    {t("onboarding.payroll_tip")}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIncomeTrackingType('lump_sum');
                    if (profile) {
                      profile.incomeTrackingType = 'lump_sum';
                    }
                    setActiveStep(6);
                    setTimeout(() => {
                      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className={`w-full p-4 rounded-xl border transition-all text-left cursor-pointer flex flex-col gap-1 hover:border-black hover:bg-neutral-50/50 ${
                    incomeTrackingType === 'lump_sum' ? 'border-black bg-neutral-50/10' : 'border-[#E1E8ED] bg-white'
                  }`}
                >
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-xs text-black font-bold">
                    {t("onboarding.lump_sum_title")}
                  </span>
                  <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-500 leading-normal">
                    {t("onboarding.lump_sum_tip")}
                  </p>
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- USER RESPONSE: Tracking Style Selected --- */}
        {activeStep > 5 && (
          <div className="flex flex-col gap-1 self-end max-w-[85%] animate-fadeIn">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm text-right">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight font-normal">
                {t("onboarding.income_sources_selected", "Income Sources Selected:")} {incomeTrackingType === 'payroll' ? t("onboarding.regular_income_title", "Regular Income & Manage Existing Funds") : t("onboarding.existing_funds_title", "Existing Funds Only")}
              </p>
            </div>
          </div>
        )}

        {/* --- NEW MESSAGE: Bot (Base Currency Selection Step - Step 6) --- */}
        {activeStep >= 6 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-full animate-fadeIn select-none">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50 animate-fadeIn">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "12px" }} className="leading-relaxed font-normal">
                {t("onboarding.base_currency_query", "Superb! What is your base currency? You can still be able to select multiple currencies later.")}
              </p>
            </div>

            {/* --- BASE CURRENCY SELECTION INTERACTIVE CARD --- */}
            {activeStep === 6 && (
              <div className="w-full max-w-full md:max-w-[500px] md:mx-auto bg-white border border-[#E1E8ED] rounded-2xl p-4 shadow-sm flex flex-col gap-3 mt-1.5 animate-fadeIn select-none">
                <label 
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 500, 
                    fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
                    backgroundColor: "#FFFFFF"
                  }} 
                  className="text-black mb-1.5 block text-center md:text-left"
                >
                  {t("onboarding.choose_base_currency", "Choose base currency")}
                </label>

                {/* Vertical fluid list or dropdown */}
                <div className="relative w-full">
                  <input
                    type="text"
                    value={isCurrencyDropdownOpen ? currencySearchQuery : (currency ? `${currency} - ${GLOBAL_CURRENCIES.find(c => c.code === currency)?.name || ''}` : '')}
                    onChange={(e) => {
                      if (!isCurrencyDropdownOpen) {
                        setIsCurrencyDropdownOpen(true);
                      }
                      setCurrencySearchQuery(e.target.value);
                    }}
                    onFocus={() => {
                      setIsCurrencyDropdownOpen(true);
                      setCurrencySearchQuery('');
                    }}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 2.8vw, 13px)" }}
                    placeholder="Select or search base currency..."
                    className="w-full h-[38px] max-h-[38px] bg-[#FFFFFF] border border-neutral-250 rounded-xl pl-3.5 pr-10 text-black outline-none focus:border-[#A6DDB1] focus:bg-white placeholder:text-neutral-400 transition-all font-normal cursor-pointer"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-neutral-400" onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isCurrencyDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Dropdown Options or stacked elements */}
                <AnimatePresence>
                  {isCurrencyDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden w-full flex flex-col gap-1.5 mt-1"
                    >
                      {/* Dropdown Options Scroll List Panel */}
                      <div className="max-h-[160px] md:max-h-[240px] overflow-y-auto border border-neutral-100 rounded-xl flex flex-col w-full bg-[#FFFFFF] select-none scrollbar-thin">
                        {(() => {
                          const filteredCurrencies = GLOBAL_CURRENCIES.filter(curr => 
                            curr.code.toLowerCase().includes(currencySearchQuery.toLowerCase()) ||
                            curr.name.toLowerCase().includes(currencySearchQuery.toLowerCase())
                          );

                          if (filteredCurrencies.length === 0) {
                            return (
                              <div 
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(0.9rem, 2vw, 1.1rem)" }}
                                className="p-3 text-center text-neutral-400 font-normal bg-[#FFFFFF]"
                              >
                                No matching currencies found
                              </div>
                            );
                          }

                          return filteredCurrencies.map((currOpt) => {
                            const isSelected = currency === currOpt.code;
                            return (
                              <button
                                key={currOpt.code}
                                type="button"
                                onClick={() => {
                                  setCurrency(currOpt.code);
                                  if (profile) {
                                    profile.baseCurrency = currOpt.code;
                                    profile.currency = currOpt.code;
                                  }
                                  setIsCurrencyDropdownOpen(false);
                                  setCurrencySearchQuery('');
                                  setActiveStep(7);
                                  setTimeout(() => {
                                    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                                  }, 100);
                                }}
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontWeight: 400,
                                  fontSize: "clamp(0.9rem, 2vw, 1.1rem)",
                                  backgroundColor: "#FFFFFF"
                                }}
                                className={`flex items-center justify-between py-2 px-3 border-b border-neutral-50 last:border-none text-left transition-all cursor-pointer w-full hover:bg-neutral-50/80 outline-none focus:ring-1 focus:ring-[#A6DDB1] ${
                                  isSelected ? 'bg-[#A6DDB1]/15 text-[#1E293B] border-l-[3.5px] border-l-[#1E293B]' : 'text-neutral-600 border-l-[3.5px] border-l-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span className="text-lg shrink-0 leading-none">{currOpt.flag}</span>
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span 
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                                      className={`font-sans uppercase ${isSelected ? 'text-[#1E293B] font-semibold' : 'text-black'} truncate block leading-none`}
                                    >
                                      {currOpt.code}
                                    </span>
                                    <span 
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                      className={`font-sans mt-1 ${isSelected ? 'text-[#1E293B]/85' : 'text-neutral-400'} truncate block text-[11px]`}
                                    >
                                      {currOpt.name}
                                    </span>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="flex items-center justify-center shrink-0 w-4.5 h-4.5 rounded-full border border-[#1E293B] bg-white/40 ml-1.5 shadow-sm">
                                    <Check size={11} className="text-[#1E293B]" strokeWidth={3} />
                                  </div>
                                )}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* --- USER RESPONSE: Base Currency Chosen --- */}
        {activeStep > 6 && (
          <div className="flex flex-col gap-1 self-end max-w-[85%] animate-fadeIn">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm text-right">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight font-normal">
                {t("onboarding.base_currency_chosen", "Base Currency:")} {currency} ({t(`currencies.${currency.toLowerCase()}`, GLOBAL_CURRENCIES.find(c => c.code === currency)?.name || currency)})
              </p>
            </div>
          </div>
        )}

        {/* --- MESSAGE 7: Bot (Goals & Experience chips selection) --- */}
        {activeStep >= 7 && (
          <div className="flex flex-col gap-1.5 self-start max-w-[85%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed font-normal">
                {t("onboarding.financial_priority_query", "Thank you! Now, please tell me what is your financial priority?")}
              </p>
            </div>
          </div>
        )}

        {/* --- USER RESPONSE 7 --- */}
        {activeStep > 7 && (
          <div className="flex flex-col gap-1 self-end max-w-[85%]">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm flex flex-col gap-1 text-right">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="text-[#A6DDB1] tracking-wider">
                {t("onboarding.goals_chosen", "Goals:")} {goalListString || t("onboarding.none", "None")}
              </p>
            </div>
          </div>
        )}

        {/* --- NEW MESSAGE: Bot (Payroll Confirmation Step - Step 8) --- */}
        {activeStep >= 8 && incomeTrackingType === 'payroll' && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[90%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50 animate-fadeIn">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
                {t("onboarding.payroll_query", "That's awesome! Please fill in the information below to automate your income tracking.")}
              </p>
            </div>

            {/* --- PAYROLL CONFIRMATION INTERACTIVE CARD --- */}
            {activeStep === 8 && (
              <div className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-3 shadow-sm flex flex-col gap-3 mt-1.5 select-text animate-fadeIn">
                <div className="flex items-center gap-2 pb-1.5 border-b border-neutral-100 select-none">
                  <div className="w-6 h-6 bg-neutral-100 rounded-lg flex items-center justify-center">
                    <Briefcase size={12} className="text-black" />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "clamp(12px, 3.5vw, 14px)" }} className="text-black leading-none">
                      {t("onboarding.salary_info_title", "Salary Information")}
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Salary Amount input */}
                  <div className="flex flex-col gap-0.5 text-left">
                    <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                      {t("onboarding.salary_amount_label", "Salary Amount ({{currency}})", { currency: currency || 'AED' })}
                    </label>
                    <input
                      type="text"
                      value={salaryAmount}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9+\-*/.()]/g, '');
                        setSalaryAmount(val);
                      }}
                      onBlur={() => {
                        setSalaryAmount(prev => evaluateMathExpression(prev));
                      }}
                      placeholder="e.g. 5000*3"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="w-full h-[38px] max-h-[38px] bg-[#F8F9FA] border border-[#E1E8ED] rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white placeholder:text-neutral-400 transition-all font-mono"
                    />
                  </div>

                  {/* Payment day of the month */}
                  <div className="flex flex-col gap-0.5 text-left">
                    <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                      {t("onboarding.pay_date_label", "Pay Date (Day of Month)")}
                    </label>
                    <select
                      value={paymentDay}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setPaymentDay(isNaN(val) ? 28 : Math.max(1, Math.min(31, val)));
                      }}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="w-full h-[38px] max-h-[38px] bg-[#F8F9FA] border border-[#E1E8ED] rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white transition-all appearance-none"
                    >
                      {[...Array(31)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Salary Account Name */}
                  <div className="flex flex-col gap-0.5 text-left">
                    <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                      {t("onboarding.salary_account_name", "Salary Account Name")}
                    </label>
                    <input
                      type="text"
                      value={salaryAccountName}
                      onChange={(e) => setSalaryAccountName(e.target.value)}
                      placeholder="e.g. Main Salary"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="w-full h-[38px] max-h-[38px] bg-[#F8F9FA] border border-[#E1E8ED] rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white placeholder:text-neutral-400 transition-all"
                    />
                  </div>

                  {/* Salary Account Starting Balance */}
                  <div className="flex flex-col gap-0.5 text-left">
                    <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                      {t("onboarding.salary_starting_balance", "Starting Balance ({{currency}})", { currency: currency || 'AED' })}
                    </label>
                    <input
                      type="text"
                      value={salaryAccountStartingBalance}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9+\-*/.()]/g, '');
                        setSalaryAccountStartingBalance(val);
                      }}
                      onBlur={() => {
                        setSalaryAccountStartingBalance(prev => evaluateMathExpression(prev));
                      }}
                      placeholder="e.g. 0"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="w-full h-[38px] max-h-[38px] bg-[#F8F9FA] border border-[#E1E8ED] rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white placeholder:text-neutral-400 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Account Destination Selection Capsule list */}
                <div className="flex flex-col gap-1.5 text-left mt-1">
                  <div className="flex flex-col sm:flex-row gap-2 select-none w-full">
                    <p 
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif", 
                        fontWeight: 400
                      }}
                      className="w-full text-left text-[11px] text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-xl p-3"
                    >
                      {t("onboarding.dedicated_salary_note", "We will create a dedicated salary account for you.")}
                    </p>
                  </div>
                </div>

                {/* Continue button */}
                <div className="flex justify-end pt-1 select-none h-[38px] w-full mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const evalSalary = parseFloat(evaluateMathExpression(salaryAmount)) || 0;
                      if (evalSalary <= 0) {
                        alert(t("onboarding.invalid_payroll_alert", "Please configure a valid payroll starting amount."));
                        return;
                      }
                      
                      // Clicking "Create Dedicated Salary Account" automatically appends a preset bank card
                      if (checkingDestination === 'dedicated') {
                        const checkingAccName = 'Salary Account';
                        const existingPayloadIndex = accountsList.findIndex(a => a.name === checkingAccName);
                        if (existingPayloadIndex >= 0) {
                          // update existing starting balance
                          const updated = [...accountsList];
                          updated[existingPayloadIndex].startingBalance = evalSalary;
                          updated[existingPayloadIndex].currency = currency.toUpperCase() || 'AED';
                          setAccountsList(updated);
                        } else {
                          // append new card
                          setAccountsList(prev => [...prev, {
                            name: checkingAccName,
                            type: 'bank',
                            startingBalance: evalSalary,
                            currency: currency.toUpperCase() || 'AED'
                          }]);
                        }
                      }
                      
                      setActiveStep(9);
                      setTimeout(() => {
                        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    }}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="px-4 h-[38px] bg-black text-white hover:bg-neutral-800 text-center text-[10px] rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer hover:scale-[1.01]"
                  >
                    {t("onboarding.save_and_continue", "Save and Continue")}
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- USER RESPONSE: Payroll Confirmation Answered --- */}
        {activeStep > 8 && incomeTrackingType === 'payroll' && (
          <div className="flex flex-col gap-1 self-end max-w-[85%] animate-fadeIn">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm text-right">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight font-normal">
                {t("onboarding.salary_details_summary", "Salary Details:")} {parseFloat(evaluateMathExpression(salaryAmount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency || 'AED'} {t("onboarding.on_day", "on day")} {paymentDay} ({checkingDestination === 'dedicated' ? t("onboarding.create_dedicated_salary_option", "Create Dedicated Salary Account") : t("onboarding.link_to_existing_option", "Link to Existing Account")})
              </p>
            </div>
          </div>
        )}

        {/* --- MESSAGE 7: Bot (Inline Multi-Account Creation Card Step) --- */}
        {activeStep >= 9 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[90%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
                {t("onboarding.accounts_message_1", "Great! We have created your salary account for you, which enables you to create income and expense transactions.")}
              </p>
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed mt-1">
                {t("onboarding.accounts_message_2", "You can create more accounts below if you want, and you can also skip this step.")}
              </p>
            </div>

            {/* --- INLINE ACCOUNT CREATED STACK LIST --- */}
            {accountsList.length > 0 && (
              <div className="w-full flex flex-col gap-1.5 mt-1 px-1">
                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 450, fontSize: "clamp(11.5px, 3.2vw, 13.5px)" }} className="text-black mb-0.5 font-medium">
                  {t("onboarding.pending_accounts_title", "📁 Pending Accounts ({{count}})", { count: accountsList.length })}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {accountsList.map((acc, index) => (
                    <motion.div 
                      key={`pending-acc-${acc.id || 'new'}-${index}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white/80 p-2.5 rounded-xl border border-neutral-250 flex items-center justify-between shadow-sm hover:border-neutral-400 transition-all select-none"
                    >
                      <div className="flex flex-col gap-0.5 text-left">
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11px] text-black truncate max-w-[130px]" title={acc.name}>
                          {acc.name}
                        </span>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, color: '#A6DDB1', fontSize: '12px' }} 
                          className="font-normal block"
                        >
                          {t("onboarding.account_type_prefix", "Type:")} {t(`onboarding.type_${acc.type.toLowerCase()}`, acc.type)} {/* Removed Automated label logic */}
                        </span>
                        <span 
                          style={{ 
                            fontFamily: "'Google Sans', sans-serif", 
                            fontWeight: acc.startingBalance < 0 ? 600 : 400, 
                            fontSize: acc.startingBalance < 0 ? 'clamp(1.1rem, 3.5vw, 1.8rem)' : '12px',
                            whiteSpace: 'nowrap'
                          }} 
                          className="text-black block"
                        >
                          {acc.startingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-neutral-500 text-[8px] tracking-wide">{acc.currency}</span>
                        </span>
                      </div>

                      <button
                        onClick={() => handleRemoveAccount(index)}
                        className="p-1.5 hover:bg-red-50 hover:text-red-550 border border-neutral-100 rounded-lg text-neutral-400 transition-colors cursor-pointer"
                        title="Remove Account"
                      >
                        <Trash2 size={12} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* --- INLINE MULTI-ACCOUNT CREATION CARD --- */}
            {activeStep === 9 && (
              <div className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-3 shadow-sm flex flex-col gap-3 mt-1.5 select-text font-normal">
                <div className="flex items-center gap-2 pb-1.5 border-b border-neutral-100 select-none">
                  <div className="w-6 h-6 bg-neutral-100 rounded-lg flex items-center justify-center">
                    <Building size={12} className="text-black" />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: "clamp(12.5px, 3.5vw, 14.5px)" }} className="text-black leading-none font-semibold">
                      {t("onboarding.account_creation_title", "Account Creation")}
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {/* Account Name input */}
                  <div className="flex flex-col gap-0.5">
                    <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                      {t("onboarding.account_name_label", "Account Name")}
                    </label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="e.g. Dubai Everyday Bank"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="w-full h-[38px] max-h-[38px] bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white placeholder:text-neutral-400 transition-all font-normal"
                    />
                  </div>

                  {/* Account Type dropdown */}
                  <div className="flex flex-col gap-0.5">
                    <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                      {t("onboarding.account_type_label", "Account Type")}
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="w-full h-[38px] max-h-[38px] bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-0 text-xs text-black focus:border-[#00FF88] outline-none transition-colors cursor-pointer font-normal"
                    >
                      <option value="bank" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal">{t("onboarding.checking_account_option", "Checking account")}</option>
                      <option value="savings" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal">{t("onboarding.saving_account_option", "Saving account")}</option>
                      <option value="credit_card" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal">{t("onboarding.credit_card_option", "Credit card")}</option>
                      <option value="cash" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal">{t("onboarding.physical_cash_option", "Physical cash")}</option>
                    </select>
                  </div>

                  {/* Account starting balance */}
                  {!(accountType === 'credit_card' || accountType === 'credit') && (
                    <div className="flex flex-col gap-0.5">
                      <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                        {t("onboarding.starting_balance_label", "Starting Balance")}
                      </label>
                      <input
                        type="text"
                        inputMode="text"
                        value={accountBalance}
                        onChange={(e) => {
                          const val = e.target.value;
                          const sanitized = val.replace(/[^0-9+\-*/.()]/g, '');
                          setAccountBalance(sanitized);
                        }}
                        onBlur={() => {
                          setAccountBalance(prev => evaluateMathExpression(prev));
                        }}
                        placeholder="0.00 or e.g., 7000*6"
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="w-full h-[38px] max-h-[38px] bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white placeholder:text-neutral-400 transition-all font-mono font-normal"
                      />
                    </div>
                  )}

                  {/* Strict Currency select pickers */}
                  <div className="flex flex-col gap-0.5">
                    <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                      {t("onboarding.account_currency_label", "Account Currency Code")}
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="w-full h-[38px] max-h-[38px] bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-0 text-xs text-black focus:border-[#00FF88] outline-none cursor-pointer font-normal"
                    >
                      <option value="AED" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal">AED (UAE Dirham)</option>
                      <option value="USD" disabled={!isPaid} style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal font-sans">USD (US Dollar)</option>
                      <option value="PHP" disabled={!isPaid} style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal">PHP (Philippine Peso)</option>
                      <option value="EUR" disabled={!isPaid} style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal font-sans">EUR (Euro)</option>
                    </select>
                  </div>

                  <AnimatePresence>
                    {(accountType === 'credit_card' || accountType === 'credit') && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="col-span-1 md:col-span-2 overflow-hidden w-full text-left bg-white border border-neutral-200 p-4 rounded-xl flex flex-col gap-4 md:grid md:grid-cols-3 md:gap-4 mt-2 mb-2 font-normal"
                      >
                        {/* 1. Outstanding Balance */}
                        <div className="flex flex-col gap-1 w-full text-left">
                          <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                            {t("onboarding.outstanding_balance_label", "What is your current outstanding balance?")}
                          </label>
                          <input
                            type="text"
                            inputMode="text"
                            value={creditOutstandingBalance}
                            onChange={(e) => {
                              const val = e.target.value;
                              const sanitized = val.replace(/[^0-9+\-*/.()]/g, '');
                              setCreditOutstandingBalance(sanitized);
                            }}
                            placeholder="0.00"
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="w-full h-[38px] max-h-[38px] bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white placeholder:text-neutral-400 transition-all font-mono font-normal"
                          />
                        </div>

                        {/* 2. Total Credit Limit */}
                        <div className="flex flex-col gap-1 w-full text-left">
                          <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                            {t("onboarding.credit_limit_label", "What is your total credit limit?")}
                          </label>
                          <input
                            type="text"
                            inputMode="text"
                            value={creditLimit}
                            onChange={(e) => {
                              const val = e.target.value;
                              const sanitized = val.replace(/[^0-9+\-*/.()]/g, '');
                              setCreditLimit(sanitized);
                            }}
                            placeholder="0.00"
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="w-full h-[38px] max-h-[38px] bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-0 text-xs text-black outline-none focus:border-black focus:bg-white placeholder:text-neutral-400 transition-all font-mono font-normal"
                          />
                        </div>

                        {/* 3. Monthly Payment Due Date */}
                        <div className="flex flex-col gap-1 w-full text-left">
                          <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-neutral-500 select-none">
                            {t("onboarding.statement_due_date_label", "Monthly statement payment due date?")}
                          </label>
                          <select
                            value={statementDueDate}
                            onChange={(e) => setStatementDueDate(e.target.value)}
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="w-full h-[38px] max-h-[38px] bg-neutral-50 border border-neutral-250 rounded-xl px-3 py-0 text-xs text-black focus:border-[#00FF88] outline-none cursor-pointer font-normal text-left"
                          >
                            <option value="" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t("onboarding.select_day_placeholder", "Select Day...")}</option>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                              <option key={day} value={day.toString()} style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal">
                                {t("onboarding.day_label", "Day {{day}}", { day })}
                              </option>
                            ))}
                          </select>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Stacking protocol action button */}
                <div style={{ maxHeight: '38px' }} className="flex gap-2 mt-1 justify-between select-none h-[38px] w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setHasSkippedAccountSetup(true);
                      setAccountsList([]);
                      setActiveStep(10);
                    }}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="px-3 h-[38px] max-h-[38px] py-0 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-black text-[10px] tracking-wide rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer flex-1 font-normal"
                    id="tour-skip-onboarding-accounts"
                  >
                    {t("onboarding.skip_for_now", "Skip For Now")}
                  </button>

                  <button
                    type="button"
                    onClick={handleAddAnotherAccount}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="px-3 h-[38px] max-h-[38px] py-0 bg-white hover:bg-neutral-50 text-neutral-700 hover:text-black border border-neutral-200 text-[10px] tracking-wide rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer hover:scale-[1.01] flex-1 font-normal"
                  >
                    {t("onboarding.add_another", "+ Add Another")}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const isCreditCard = accountType === 'credit_card' || accountType === 'credit';
                      let hasCurrentInputs = false;
                      if (isCreditCard) {
                        hasCurrentInputs = accountName.trim().length > 0 && creditOutstandingBalance.trim().length > 0;
                      } else {
                        hasCurrentInputs = accountName.trim().length > 0 && accountBalance.trim().length > 0;
                      }

                      if (!hasCurrentInputs && accountsList.length === 0) {
                        alert(t("onboarding.incomplete_account_alert", "Complete at least one starting account sequence or tap 'SKIP FOR NOW'."));
                        return;
                      }
                      
                      if (accountName.trim()) {
                        if (isCreditCard && creditOutstandingBalance.trim()) {
                          const evaledBal = evaluateMathExpression(creditOutstandingBalance);
                          const startingBalanceVal = -1 * Math.abs(parseFloat(evaledBal) || 0);
                          setAccountsList(prev => [...prev, {
                            name: accountName.trim(),
                            type: accountType,
                            startingBalance: startingBalanceVal,
                            currency: currency.toUpperCase() || 'AED',
                            creditLimit: parseFloat(evaluateMathExpression(creditLimit)) || 0,
                            statementDueDate: statementDueDate || "25",
                            paymentDueDate: `2026-06-${(statementDueDate || "25").padStart(2, '0')}`
                          }]);
                          setAccountName('');
                          setCreditOutstandingBalance('');
                          setCreditLimit('');
                          setStatementDueDate('');
                        } else if (!isCreditCard && accountBalance.trim()) {
                          const evaledBal = evaluateMathExpression(accountBalance);
                          setAccountsList(prev => [...prev, {
                            name: accountName.trim(),
                            type: accountType,
                            startingBalance: parseFloat(evaledBal) || 0,
                            currency: currency.toUpperCase() || 'AED'
                          }]);
                          setAccountName('');
                          setAccountBalance('');
                        }
                      }
                      
                      setActiveStep(10);
                    }}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="px-4 h-[38px] max-h-[38px] py-0 bg-black text-white hover:bg-neutral-800 text-center text-[10px] rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer hover:scale-[1.01] flex-1 font-normal"
                  >
                    {t("onboarding.save_and_continue", "Save and Continue")}
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- USER RESPONSE 5 --- */}
        {activeStep > 9 && (
          <div className="flex flex-col gap-1 self-end max-w-[85%]">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight">
                {hasSkippedAccountSetup 
                  ? t("onboarding.accounts_setup_skipped", "Accounts setup skipped. (Portfolio empty)") 
                  : t("onboarding.accounts_setup_finished", "Accounts setup finished. ({{count}} item(s) cached)", { count: accountsList.length })}
              </p>
            </div>
          </div>
        )}

        {/* --- MESSAGE 6_NEW: Bot (Tracking Preferences Question / 50/30/20 Recommendation Intercept) --- */}
        {activeStep === 10 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[90%] animate-fadeIn">
            {/* Educational Recommendation Card outlining 50/30/20 rule */}
            <div className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-4 shadow-sm flex flex-col gap-4 mt-1 animate-fadeIn" id="budget-recommendation-card">
                
                {/* Header Information */}
                {incomeTrackingType === 'payroll' ? (
                  <div className="flex flex-col gap-1.5 pb-2.5 border-b border-neutral-100 hidden">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "15px" }} className="text-sm text-black font-bold">
                        {t("onboarding.ideal_budget_heading", "The Ideal Budget")}
                      </span>
                      
                      {/* Dynamic calculation counter row */}
                      <div 
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border transition-all duration-200 ${
                          isOverAllocated 
                            ? 'bg-amber-50 border-amber-200 text-amber-700' 
                            : 'bg-neutral-50 border-[#E1E8ED] text-neutral-600'
                        }`}
                      >
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] leading-tight">
                          {isOverAllocated ? t("onboarding.allocations_exceeded_warning", "⚠️ Allocations Exceeded:") : t("onboarding.allocated_label", "Allocated:")}
                        </span>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                          className={`text-[11px] font-bold font-mono leading-tight ${isOverAllocated ? 'text-amber-700' : 'text-black'}`}
                        >
                          {totalAllocated.toLocaleString('en-US')} / {evalSalary.toLocaleString('en-US')} {currency || 'AED'}
                        </span>
                      </div>
                    </div>

                    {/* Warning Banner on Mobile */}
                    {isOverAllocated && (
                      <div className="block md:hidden mt-1.5 animate-fadeIn">
                        <div className="p-3 bg-white border border-amber-200 rounded-xl flex flex-col gap-1 shadow-sm text-left">
                          <span 
                            style={{ 
                              fontFamily: "'Google Sans', sans-serif", 
                              fontWeight: 500, 
                              fontSize: "clamp(0.9rem, 2.5vw, 1.2rem)" 
                            }} 
                            className="text-amber-700 leading-snug"
                          >
                            {t("onboarding.budget_notice_warning_heading", "Budget Notice")}
                          </span>
                          <p 
                            style={{ 
                              fontFamily: "'Google Sans', sans-serif", 
                              fontWeight: 400, 
                              fontSize: "clamp(0.8rem, 1.8vw, 1rem)" 
                            }} 
                            className="text-neutral-600 leading-normal"
                          >
                            {t("onboarding.budget_notice_exceeded_detail", "Budget Notice: Total budget allocations exceeds your incoming salary. This is perfectly fine if you plan to cover the difference using your linked liquid cash reserves!")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 pb-1 border-b border-neutral-100 hidden">
                    <div className="flex justify-between items-center">
                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "15px" }} className="text-sm text-black font-bold">
                        {t("onboarding.ideal_budget_heading", "The Ideal Budget")}
                      </span>
                    </div>

                    {/* Mobile: Replace comparative card completely with a single highly stylized row container on pure white */}
                    <div className="block md:hidden w-full">
                      <div 
                        className="w-full bg-white border border-[#E1E8ED] rounded-xl p-3 flex justify-between items-center animate-fadeIn shadow-sm"
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                      >
                        <span 
                          style={{ 
                            fontFamily: "'Google Sans', sans-serif", 
                            fontWeight: 500, 
                            fontSize: "12px" 
                          }} 
                          className="text-neutral-500 font-medium"
                        >
                          {t("onboarding.total_planned_allocations_label", "Total Planned Allocations:")}
                        </span>
                        <span 
                          style={{ 
                            fontFamily: "'Google Sans', sans-serif", 
                            fontWeight: 700, 
                            fontSize: "13px",
                            color: "#A6DDB1"
                          }} 
                          className="font-bold font-mono"
                        >
                          {totalAllocated.toLocaleString('en-US')} {currency || 'AED'}
                        </span>
                      </div>
                    </div>

                    {/* Tablet/Desktop: Centered full-width (100%) aggregation card on pure white above the row grid */}
                    <div className="hidden md:block w-full hidden">
                      <div 
                        className="flex flex-col items-center justify-center text-center p-6 bg-white border border-[#E1E8ED] rounded-2xl w-full mx-auto animate-fadeIn gap-1.5 shadow-sm"
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                      >
                        <span 
                          style={{ 
                            fontFamily: "'Google Sans', sans-serif", 
                            fontWeight: 500, 
                            fontSize: "clamp(1.1rem, 3vw, 1.6rem)" 
                          }} 
                          className="text-neutral-500 font-medium"
                        >
                          {t("onboarding.total_planned_allocations_title", "Total Planned Allocations")}
                        </span>
                        <span 
                          style={{ 
                            fontFamily: "'Google Sans', sans-serif", 
                            fontWeight: 700, 
                            fontSize: "clamp(1.5rem, 5vw, 2.5rem)" 
                          }} 
                          className="text-black font-bold font-mono"
                        >
                          {totalAllocated.toLocaleString('en-US')} {currency || 'AED'}
                        </span>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} 
                          className="text-xs text-neutral-400 mt-1 leading-normal"
                        >
                          {t("onboarding.ideal_budget_description_detail", "These envelopes represent your active tracking segments, funding your upcoming budget allocation plan recursively.")}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Interactive Customizable UI */}
                <div className="flex flex-col md:flex-row gap-4 justify-center items-stretch w-full px-4 md:px-0 mt-4 select-none">
                  {blueprintEnvelopes.length === 0 ? (
                    <div className="text-center p-6 bg-neutral-50 rounded-xl border border-dashed border-neutral-200 w-full animate-fadeIn">
                      <span className="text-[11px] text-neutral-500 font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                        {t("onboarding.no_active_budget_envelopes", "No active budget envelopes configured.")}
                      </span>
                    </div>
                  ) : (
                    blueprintEnvelopes.map((bp) => {
                      const pctLabel = bp.categoryGroup === 'needs' ? `${needsPct}%` : bp.categoryGroup === 'wants' ? `${wantsPct}%` : `${savingsPct}%`;
                      
                      return (
                        <div 
                          key={bp.id} 
                          className="w-full md:w-[30%] shrink-0 p-5 bg-white border border-[#E1E8ED] rounded-2xl flex flex-col justify-between gap-4 shadow-sm hover:border-black/20 hover:shadow-md transition-all text-left"
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                        >
                          <div className="flex flex-col gap-3">
                            {/* Title and Deletion Handle */}
                            <div className="flex justify-between items-center pb-2.5 border-b border-neutral-100">
                              <div className="flex items-center gap-2 max-w-[85%]">
                                <span className="text-base select-none shrink-0">{bp.emoji}</span>
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "14px" }} 
                                  className="text-black font-bold truncate"
                                >
                                  {bp.categoryGroup === 'needs' ? t("onboarding.essential_needs", "Essential Needs") : bp.categoryGroup === 'wants' ? t("onboarding.personal_wants", "Personal Wants") : getGoalTitle(primaryGoal)}
                                </span>
                                <span 
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif", 
                                    fontWeight: 500,
                                    marginLeft: "-4px",
                                    paddingLeft: "5px",
                                    paddingRight: "5px",
                                    marginRight: "0px"
                                  }} 
                                  className="text-[9px] text-neutral-400 bg-neutral-100 py-0.5 rounded-md font-medium shrink-0 whitespace-nowrap"
                                >
                                  {pctLabel}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteEnvelope(bp.id)}
                                style={{ backgroundColor: "#ffffff" }}
                                className="p-1 text-neutral-400 hover:text-red-500 hover:bg-neutral-50 rounded transition-all cursor-pointer shrink-0"
                                title={t("onboarding.remove_envelope", "Remove Envelope")}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            {/* Crisp Fluid Fluid Display of Calculated Amount */}
                            <div className="flex flex-col gap-0.5">
                              <span 
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "12px" }} 
                                className="text-neutral-400 font-normal"
                              >
                                {t("onboarding.budget_allocation", "Budget Allocation")}
                              </span>
                              <div 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontSize: "clamp(1.25rem, 4.5vw, 2.25rem)", 
                                  fontWeight: 700,
                                  backgroundColor: "#FFFFFF"
                                }} 
                                className="text-black font-bold tracking-tight py-1 font-mono"
                              >
                                {(() => {
                                  const numeric = parseFloat(evaluateMathExpression(bp.allocatedAmount)) || 0;
                                  return numeric.toLocaleString('en-US');
                                })()}
                                <span style={{ fontWeight: 400 }} className="text-xs text-neutral-400 ml-1.5 font-normal">
                                  {currency || 'AED'}
                                </span>
                              </div>
                            </div>

                            {/* Editable Amount Input Suffix Sourced Placeholder */}
                            <div className="flex flex-col gap-1 text-left">
                              <div className="relative flex justify-between items-center text-neutral-400">
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "12px" }} className="font-normal">
                                  {t("onboarding.adjust_amount", "Adjust Amount")}
                                </span>
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "12px" }} className="font-normal font-sans text-right shrink-0 whitespace-nowrap">
                                  {t("onboarding.pct_guideline", "{{pctLabel}} Guideline", { pctLabel })}
                                </span>
                              </div>
                              <div className="relative flex items-center mt-0.5">
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={bp.allocatedAmount}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9+\-*/.()]/g, '');
                                    handleUpdateEnvelopeAmount(bp.id, val);
                                  }}
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                  className="w-full h-[32px] bg-white border border-neutral-250 rounded-lg pl-3 pr-10 text-[11px] text-black outline-none focus:border-black font-normal font-mono"
                                />
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "11px" }} className="absolute right-3.5 text-neutral-400 font-bold font-mono">
                                  {currency || 'AED'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Configure Assigned Categories Link Dropdown Button or Inline for Essential Needs, Personal Wants and Emergency Funds */}
                          {bp.categoryGroup === 'needs' || bp.categoryGroup === 'wants' || bp.categoryGroup === 'savings' ? (
                            <div className="flex flex-col gap-2.5 text-left mt-3 w-full border-t border-neutral-100 pt-3">
                              <span 
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                                className="text-[11px] text-black font-bold"
                              >
                                {t("onboarding.tracking_categories_label", "Tracking Categories")}
                              </span>
                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9.5px] text-neutral-400 font-normal leading-normal">
                                {t("onboarding.assign_categories_description", "Assign transaction categories directly to this envelope:")}
                              </span>
                              <div className="flex flex-col gap-1.5 mt-1 max-h-[170px] overflow-y-auto scrollbar-thin pr-1">
                                {MASTER_CATEGORIES.map((cat) => {
                                  const isSelected = bp.mappedCategories.includes(cat.name);
                                  const isExpanded = (expandedCategories[bp.id] || []).includes(cat.name);
                                  
                                  return (
                                    <div key={`onboard-cat-${bp.id}-${cat.name}`} className="flex flex-col gap-1">
                                      <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg border border-[#E1E8ED] bg-white transition-colors hover:bg-neutral-50">
                                        <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleCategoryOnEnvelope(bp.id, cat.name)}
                                            className="w-3.5 h-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black cursor-pointer"
                                          />
                                          <span 
                                            style={{ 
                                              fontFamily: "'Google Sans', sans-serif",
                                              fontSize: '11px',
                                              fontWeight: 500
                                            }}
                                            className="text-neutral-800"
                                          >
                                            {cat.emoji} {t(`categories.${cat.name.replace(/ /g, '_').replace(/&/g, 'and')}`, cat.name)}
                                          </span>
                                        </label>
                                        <button 
                                          type="button"
                                          onClick={() => setExpandedCategories(prev => ({
                                              ...prev,
                                              [bp.id]: prev[bp.id]?.includes(cat.name) 
                                                  ? (prev[bp.id] || []).filter(c => c !== cat.name)
                                                  : [...(prev[bp.id] || []), cat.name] 
                                          }))}
                                          className="text-neutral-400 hover:text-black transition-colors"
                                        >
                                          <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                                        </button>
                                      </div>

                                      {isExpanded && (
                                        <div className="flex flex-col gap-1 ml-5 pl-2 border-l border-neutral-100">
                                          {cat.subcategories.map(sub => {
                                            const isSubSelected = bp.mappedSubCategories.includes(sub);
                                            return (
                                              <label 
                                                  key={`onboard-sub-${bp.id}-${cat.name}-${sub}`}
                                                  className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-neutral-50 cursor-pointer select-none"
                                              >
                                                  <input
                                                    type="checkbox"
                                                    checked={isSubSelected}
                                                    onChange={() => handleToggleSubCategoryOnEnvelope(bp.id, sub, cat.name)}
                                                    className="w-3 h-3 rounded border-neutral-300 text-neutral-600 focus:ring-neutral-400 accent-neutral-600 cursor-pointer"
                                                  />
                                                  <span 
                                                    style={{ 
                                                      fontFamily: "'Google Sans', sans-serif",
                                                      fontSize: '9.5px',
                                                      fontWeight: 400
                                                    }}
                                                    className="text-neutral-600"
                                                  >
                                                      {t(`subcategories.${sub.replace(/ /g, '_').replace(/-/g, '_')}`, sub)}
                                                  </span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {bp.mappedCategories.length > 0 && (
                                <div className="flex flex-col gap-1 text-left pt-2 border-t border-neutral-150">
                                  <span 
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                                    className="text-[9.5px] text-black font-bold"
                                  >
                                    {t("onboarding.sub_categories_heading", "Sub-Categories")}
                                  </span>
                                  <div className="grid grid-cols-2 gap-1 mt-1 max-h-[100px] overflow-y-auto scrollbar-thin pr-1">
                                    {MASTER_CATEGORIES
                                      .filter((cat) => bp.mappedCategories.includes(cat.name))
                                      .flatMap((cat) => cat.subcategories.map((sub) => ({ category: cat.name, sub })))
                                      .map(({ category, sub }) => {
                                        const isSelected = bp.mappedSubCategories.includes(sub);
                                        return (
                                          <label 
                                            key={`onboard-refine-sub-${bp.id}-${category}-${sub}`}
                                            className={`flex items-center gap-1 p-1 rounded border text-[8.5px] select-none cursor-pointer transition-colors ${
                                              isSelected
                                                ? 'bg-neutral-100 border-neutral-450 text-black font-bold'
                                                : 'bg-white border-[#E1E8ED] text-neutral-500 font-normal hover:bg-neutral-50'
                                            }`}
                                            style={{ fontFamily: "'Google Sans', sans-serif" }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => handleToggleSubCategoryOnEnvelope(bp.id, sub, category)}
                                              className="w-2.5 h-2.5 rounded border-neutral-300 text-black focus:ring-black accent-black cursor-pointer"
                                            />
                                            <span style={{ fontSize: "12px" }} className="truncate">{sub}</span>
                                          </label>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1 text-left relative mt-2 w-full">
                              <button
                                type="button"
                                onClick={() => setExpandedEnvelopes(prev => ({ ...prev, [bp.id]: !prev[bp.id] }))}
                                className="flex items-center justify-between px-3 py-1.5 text-[clamp(0.85rem,1.8vw,1.05rem)] text-[#444444] rounded-lg border border-[#A6DDB1] w-full bg-white font-normal text-left"
                                style={{ fontFamily: "'Google Sans', sans-serif" }}
                              >
                                {expandedEnvelopes[bp.id] 
                                  ? t("onboarding.select_tracking_categories", "Select Tracking Categories ▼") 
                                  : t("onboarding.items_selected_count", "{{count}} Selected", { count: bp.mappedCategories.length + bp.mappedSubCategories.length })}
                              </button>

                              {/* Smooth absolute-positioned dropdown selection menu overlay */}
                              {expandedEnvelopes[bp.id] && (
                                <>
                                  {/* Overlay click interceptor to close the dropdown cleanly on clicking outside */}
                                  <div
                                    className="fixed inset-0 z-40 bg-transparent"
                                    onClick={() => setExpandedEnvelopes(prev => ({ ...prev, [bp.id]: false }))}
                                  />
                                  <div 
                                    className="absolute left-0 right-0 top-full mt-1.5 p-3.5 bg-white rounded-xl border border-[#E1E8ED] flex flex-col gap-3 text-left shadow-lg z-50 max-h-[250px] overflow-y-auto animate-fadeIn w-full"
                                    style={bp.categoryGroup === 'wants' || bp.categoryGroup === 'savings' ? { width: '280px', marginLeft: '-27px' } : undefined}
                                  >
                                    {/* Categories checklist */}
                                    <div className="flex flex-col gap-1 text-left w-full">
                                      <span 
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                                        className="text-[10px] text-black font-bold"
                                      >
                                        {t("onboarding.categories_heading", "Categories")}
                                      </span>
                                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] text-neutral-400 font-normal leading-normal">
                                        {t("onboarding.categories_assign_checklist_description", "Toggle checklists to assign transaction categories directly to this envelope.")}
                                      </span>
                                      <div className="flex flex-col gap-2 mt-2">
                                        {MASTER_CATEGORIES.map((cat) => {
                                          const isSelected = bp.mappedCategories.includes(cat.name);
                                          const isExpanded = (expandedCategories[bp.id] || []).includes(cat.name);
                                          
                                          return (
                                            <div key={`onboard-cat-${bp.id}-${cat.name}`} className="flex flex-col gap-1">
                                              <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg border border-[#E1E8ED] bg-white transition-colors hover:bg-neutral-50">
                                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                                  <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleToggleCategoryOnEnvelope(bp.id, cat.name)}
                                                    className="w-3.5 h-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black cursor-pointer"
                                                  />
                                                  <span 
                                                    style={{ 
                                                      fontFamily: "'Google Sans', sans-serif",
                                                      fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
                                                      fontWeight: 500
                                                    }}
                                                    className="text-neutral-800"
                                                  >
                                                    {t(`categories.${cat.name.replace(/ /g, '_').replace(/&/g, 'and')}`, cat.name)}
                                                  </span>
                                                </label>
                                                <button 
                                                  type="button"
                                                  onClick={() => setExpandedCategories(prev => ({
                                                      ...prev,
                                                      [bp.id]: prev[bp.id]?.includes(cat.name) 
                                                          ? (prev[bp.id] || []).filter(c => c !== cat.name)
                                                          : [...(prev[bp.id] || []), cat.name] 
                                                  }))}
                                                  className="text-neutral-400 hover:text-black transition-colors"
                                                >
                                                  {isExpanded ? '▲' : '▼'}
                                                </button>
                                              </div>

                                              {isExpanded && (
                                                <div className="flex flex-col gap-1 ml-6 pl-2 border-l-2 border-neutral-100">
                                                  {cat.subcategories.map(sub => {
                                                    const isSubSelected = bp.mappedSubCategories.includes(sub);
                                                    return (
                                                      <label 
                                                          key={`onboard-sub-${bp.id}-${cat.name}-${sub}`}
                                                          className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-neutral-50 cursor-pointer"
                                                      >
                                                          <input
                                                            type="checkbox"
                                                            checked={isSubSelected}
                                                            onChange={() => handleToggleSubCategoryOnEnvelope(bp.id, sub, cat.name)}
                                                            className="w-3 h-3 rounded border-neutral-300 text-neutral-600 focus:ring-neutral-400 accent-neutral-600 cursor-pointer"
                                                          />
                                                          <span 
                                                            style={{ 
                                                              fontFamily: "'Google Sans', sans-serif",
                                                              fontSize: 'clamp(0.85rem, 1.8vw, 1rem)',
                                                              fontWeight: 400
                                                            }}
                                                            className="text-neutral-600"
                                                          >
                                                            {t(`subcategories.${sub.replace(/ /g, '_').replace(/-/g, '_')}`, sub)}
                                                          </span>
                                                      </label>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {/* Sub-categories checklist - conditional */}
                                    {bp.mappedCategories.length > 0 && (
                                      <div className="flex flex-col gap-1 text-left pt-2.5 border-t border-neutral-200">
                                        <span 
                                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                                          className="text-[10px] text-black font-bold"
                                        >
                                          Sub-Categories
                                        </span>
                                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] text-neutral-400 font-normal leading-normal">
                                          Refine categorization by toggling specific sub-categories below.
                                        </span>
                                        <div className="grid grid-cols-2 gap-1.5 mt-1">
                                          {MASTER_CATEGORIES
                                            .filter((cat) => bp.mappedCategories.includes(cat.name))
                                            .flatMap((cat) => cat.subcategories.map((sub) => ({ category: cat.name, sub })))
                                            .map(({ category, sub }) => {
                                              const isSelected = bp.mappedSubCategories.includes(sub);
                                              return (
                                                <label 
                                                  key={`onboard-refine-sub-${bp.id}-${category}-${sub}`}
                                                  className={`flex items-center gap-1.5 p-1.5 rounded border text-[9px] select-none cursor-pointer transition-colors ${
                                                    isSelected
                                                      ? 'bg-neutral-100 border-neutral-450 text-black font-bold'
                                                      : 'bg-white border-[#E1E8ED] text-neutral-500 font-normal hover:bg-neutral-50'
                                                  }`}
                                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                                >
                                                  <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleToggleSubCategoryOnEnvelope(bp.id, sub, category)}
                                                    className="w-3 h-3 rounded border-neutral-300 text-black focus:ring-black accent-black cursor-pointer"
                                                  />
                                                  <span className="truncate">{sub}</span>
                                                </label>
                                              );
                                            })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Sub-Category Budgets list */}
                          {bp.mappedSubCategories.length > 0 && (
                            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 text-left mt-3">
                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "11px" }} className="text-black font-bold text-neutral-900">
                                {t("onboarding.sub_category_budgets", "Sub-Category Budgets")}
                              </span>
                              <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                {bp.mappedSubCategories.map(sub => {
                                  return (
                                    <div key={`sub-budget-${bp.id}-${sub}`} className="flex items-center justify-between gap-1.5 p-1 px-2 rounded-lg border border-[#E1E8ED] bg-[#F8FAFC]">
                                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "10px" }} className="text-neutral-700 font-medium truncate">
                                        {t(`subcategories.${sub.replace(/ /g, '_').replace(/-/g, '_')}`, sub)}
                                      </span>
                                      <div className="relative flex items-center shrink-0 w-24">
                                        <input
                                          type="text"
                                          placeholder="0"
                                          value={subCategoryBudgets[sub] || ''}
                                          onChange={(e) => {
                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                            handleUpdateSubCategoryBudget(sub, raw);
                                          }}
                                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                          className="w-full h-[24px] bg-white border border-neutral-200 rounded px-1.5 pr-8 text-[9px] text-right font-normal outline-none text-black font-mono focus:border-black"
                                        />
                                        <span style={{ fontSize: "8px" }} className="absolute right-1 text-neutral-400 font-mono">
                                          {currency || 'AED'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Tablet / Desktop Warning Banner */}
                {isOverAllocated && incomeTrackingType === 'payroll' && (
                  <div className="hidden md:block w-full mt-2 animate-fadeIn px-1">
                    <div className="w-full p-4 bg-white border border-amber-200 rounded-2xl flex flex-col gap-1 text-left shadow-sm">
                      <span 
                        style={{ 
                          fontFamily: "'Google Sans', sans-serif", 
                          fontWeight: 500, 
                          fontSize: "clamp(0.9rem, 2.5vw, 1.2rem)" 
                        }} 
                        className="text-amber-700 font-medium leading-snug"
                      >
                        {t("onboarding.budget_notice_warning_heading", "Budget Notice")}
                      </span>
                      <p 
                        style={{ 
                          fontFamily: "'Google Sans', sans-serif", 
                          fontWeight: 400, 
                          fontSize: "clamp(0.8rem, 1.8vw, 1rem)" 
                        }} 
                        className="text-neutral-600 font-normal leading-normal"
                      >
                        {t("onboarding.budget_notice_exceeded_detail", "Budget Notice: Total budget allocations exceeds your incoming salary. This is perfectly fine if you plan to cover the difference using your linked liquid cash reserves!")}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Additional controls and submission Button */}
                <div className="flex justify-between items-center mt-3 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => {
                      const newEnvelope = {
                        id: 'custom-' + Math.random().toString(36).substr(2, 9),
                        categoryTitle: 'Custom Budget Segment',
                        categoryGroup: 'wants' as const,
                        allocatedAmount: '1000',
                        iconAsset: 'pocket',
                        emoji: '📂',
                        mappedCategories: [],
                        mappedSubCategories: []
                      };
                      setBlueprintEnvelopes(prev => [...prev, newEnvelope]);
                    }}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    className="h-[32px] px-3.5 bg-neutral-100 hover:bg-neutral-200 text-black hover:text-neutral-800 text-[10px] rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer font-bold"
                  >
                    <Plus size={11} />
                    {t("onboarding.add_manually_button", "Add manually")}
                  </button>

                  <button
                    type="button"
                    disabled={isSaving || blueprintEnvelopes.length === 0}
                    onClick={handleApplyBlueprintEnvelopes}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    className="px-4 h-[36px] bg-black text-white hover:bg-neutral-800 text-center text-[10px] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer hover:scale-[1.01] font-bold"
                  >
                    {isSaving ? t("onboarding.setting_up_vault", "Setting Up...") : t("onboarding.confirm_budgets_button", "Confirm budgets")}
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* --- USER RESPONSE 6_NEW --- */}
        {activeStep > 10 && (blueprintsApplied || selectedTrackingCategories.length > 0) && (
          <div className="flex flex-col gap-1 self-end max-w-[85%] animate-fadeIn">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm flex flex-col gap-0.5 text-right animate-fadeIn">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)", color: "#fff7f7" }} className="font-normal leading-tight">
                {blueprintsApplied 
                  ? t("onboarding.freedom_starts_now", "Your future financial freedom starts now.") 
                  : `${t("onboarding.tracked_priorities_prefix", "Tracked Priorities:")} ${selectedTrackingCategories.map(c => TRACKING_OPTIONS.find(o => o.id === c)?.label || c).join(', ')}`}
              </p>
            </div>
          </div>
        )}

        {/* --- MESSAGE 6: Bot (Legal, Privacy & Let's Go!) --- */}
        {activeStep >= 11 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[90%] animate-fadeIn">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed">
                {t("onboarding.terms_greeting", "Great! We are almost there. Please agree to the terms and conditions below to proceed.")}
              </p>
            </div>

            {/* Inline Checkboxes */}
            <div className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-2.5 shadow-sm flex flex-col gap-1.5 mt-1">
              
              <div 
                onClick={() => setPrivacyChecked(!privacyChecked)}
                className={`flex items-center justify-between gap-2 p-2.5 bg-neutral-50 border hover:bg-neutral-100 rounded-xl transition-all cursor-pointer ${
                  privacyChecked ? 'border-black bg-white' : 'border-neutral-250'
                }`}
              >
                <div className="flex items-center gap-2 flex-1">
                  <div className="shrink-0 flex items-center justify-center">
                    {privacyChecked ? (
                      <div className="w-4 h-4 rounded bg-black text-[#00FF88] flex items-center justify-center">
                        <ShieldCheck size={11} className="stroke-[3]" style={{ color: "#A6DDB1" }} />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded border border-neutral-300 bg-white" />
                    )}
                  </div>
                  <div className="text-left flex items-center">
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-black block leading-tight">
                      {t("onboarding.privacy_policy_label", "Accept Privacy Policy")}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open("https://www.yourfinances.me/privacy", "_blank");
                  }}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="px-2.5 py-1 text-[10px] text-black bg-[#A6DDB1] rounded-lg font-bold hover:scale-[1.03] transition-all cursor-pointer select-none"
                >
                  {t("onboarding.view_button", "View")}
                </button>
              </div>

              <div 
                onClick={() => setTermsChecked(!termsChecked)}
                className={`flex items-center justify-between gap-2 p-2.5 bg-neutral-50 border hover:bg-neutral-100 rounded-xl transition-all cursor-pointer ${
                  termsChecked ? 'border-black bg-white' : 'border-neutral-250'
                }`}
              >
                <div className="flex items-center gap-2 flex-1">
                  <div className="shrink-0 flex items-center justify-center">
                    {termsChecked ? (
                      <div className="w-4 h-4 rounded bg-black text-[#00FF88] flex items-center justify-center">
                        <ShieldCheck size={11} className="stroke-[3]" style={{ color: "#A6DDB1" }} />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded border border-neutral-300 bg-white" />
                    )}
                  </div>
                  <div className="text-left flex items-center">
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 3.2vw, 13px)", fontWeight: 400 }} className="text-black block leading-tight">
                      {t("onboarding.terms_conditions_label", "Accept Terms and Conditions")}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open("https://www.yourfinances.me/terms-of-engagement", "_blank");
                  }}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="px-2.5 py-1 text-[10px] text-black bg-[#A6DDB1] rounded-lg font-bold hover:scale-[1.03] transition-all cursor-pointer select-none"
                >
                  {t("onboarding.view_button", "View")}
                </button>
              </div>

              {/* Huge let's go action button */}
              <button
                type="button"
                onClick={() => {
                  setActiveStep(12);
                  setTimeout(() => {
                    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                disabled={!privacyChecked || !termsChecked || isSaving}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, backgroundColor: "#A6DDB1" }}
                className="w-full mt-1 px-4 h-[38px] max-h-[38px] py-0 hover:scale-[1.01] text-black text-[10.5px] tracking-wide rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#00FF88]/10 disabled:opacity-30 disabled:scale-100 disabled:shadow-none disabled:cursor-not-allowed select-none"
              >
                {isSaving ? t("onboarding.building_automated_vault", "Assembling automated vault...") : t("onboarding.lets_go_action", "Let's Go!")}
                <ArrowRight size={12} className="stroke-[3]" />
              </button>
            </div>
          </div>
        )}

        {/* --- USER RESPONSE 7: Approved Terms & Go --- */}
        {activeStep > 11 && (
          <div className="flex flex-col gap-1 self-end max-w-[85%]">
            <div className="bg-black text-white rounded-2xl rounded-tr-none p-2.5 shadow-sm">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="tracking-tight font-normal">
                {t("onboarding.account_setup_congratulations", "Congratulations! Your account is set up.")}
              </p>
            </div>
          </div>
        )}

        {/* --- MESSAGE 8: Bot Tour Offer --- */}
        {activeStep >= 12 && (
          <div className="flex flex-col gap-1.5 self-start w-full max-w-[90%] animate-fadeIn" id="step8-tour-gateway">
            <div className="bg-[#E9ECEF] text-[#000000] rounded-2xl rounded-tl-none p-2.5 shadow-sm border border-[#D1D8DD]/50">
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} className="leading-relaxed font-normal">
                {t("onboarding.tour_offer_greeting", "We're all set! Would you like a quick 1-minute tour to see how everything works?")}
              </p>
            </div>

            {/* Selection Options */}
            <div className="flex flex-col gap-2 w-full mt-1 bg-white border border-[#E1E8ED] rounded-2xl p-2.5 shadow-sm">
              <button
                type="button"
                onClick={() => handleFinalizeOnboarding(true)}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                className="w-full h-[38px] max-h-[38px] py-0 bg-[#A6DDB1] hover:scale-[1.01] text-black text-[10.5px] tracking-wide rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#A6DDB1]/10 select-none cursor-pointer border border-[#A6DDB1]/80"
              >
                {t("onboarding.tour_offer_accept", "Yes, show me around!")}
              </button>

              <button
                type="button"
                onClick={() => handleFinalizeOnboarding(false)}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                className="w-full h-[38px] max-h-[38px] py-0 bg-white hover:bg-neutral-50 border border-neutral-300 hover:border-black text-black text-[10.5px] tracking-wide rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 select-none cursor-pointer"
              >
                {t("onboarding.tour_offer_decline", "No, I'm good")}
              </button>
            </div>
          </div>
        )}

        {/* Simulated Typing Bubbles */}
        {isTyping && (
          <div className="flex flex-col gap-2 self-start max-w-[85%]">
            <div className="bg-[#E9ECEF] border border-[#D1D8DD]/50 rounded-2xl rounded-tl-none px-3.5 py-2 w-16 flex gap-1 items-center justify-center shadow-sm">
              <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Dynamic connection drop notice at the bottom of the chat window */}
        {isOffline && (
          <div className="w-full text-center py-2 px-3 bg-neutral-100 border border-neutral-200 rounded-2xl animate-fadeIn select-none shadow-sm" id="onboarding-offline-warning">
            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(9.5px, 2.8vw, 11px)" }} className="tracking-wider text-[#000000] uppercase">
              {t("onboarding.offline_warning", "Working offline. Your profile will save to the cloud automatically.")}
            </span>
          </div>
        )}

        {/* End Reference Anchor for WhatsApp Auto-Scroll */}
        <div ref={chatEndRef} />
      </div>

      {/* --- WHATSAPP BOTTOM CHAT CONTROL INPUTS --- */}
      {activeStep <= 7 && (
        <footer className="footer bg-white border-t border-[#E1E8ED] p-4 shrink-0 shadow-sm flex flex-col gap-1.5 select-none animate-fadeIn">
          
          <div className="max-w-2xl mx-auto w-full flex gap-1.5 items-center">
            
            {/* Back indicator trigger */}
            {activeStep > 1 && (
              <button
                type="button"
                onClick={() => setActiveStep(activeStep - 1)}
                className="p-2 border border-[#E1E8ED] bg-[#F8F9FA] hover:bg-neutral-150 text-neutral-600 hover:text-black rounded-xl cursor-pointer transition-colors active:scale-95 flex items-center justify-center h-[38px] w-[38px] max-h-[38px] shrink-0"
                title="Go Back"
              >
                <ChevronLeft size={13} />
              </button>
            )}

            {/* Step form input slots */}
            <div className="flex-1">
              {/* Step 1: Full Name */}
              {activeStep === 1 && (
                <div className="flex gap-1.5 w-full">
                  <input
                    type="text"
                    onChange={(e) => setFullName(e.target.value)}
                    value={fullName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && fullName.trim()) {
                        handleStepSubmit(1);
                      }
                    }}
                    placeholder={`Enter your Full name (e.g. ${randomPlaceholder})`}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="flex-grow bg-neutral-100 text-black border border-[#D1D8DD] rounded-xl px-3 text-xs outline-none focus:bg-white focus:border-black placeholder:text-neutral-400 h-[38px] max-h-[38px] py-0"
                  />
                  
                  <button
                    disabled={!fullName.trim()}
                    onClick={() => handleStepSubmit(1)}
                    className="bg-black hover:bg-neutral-900 disabled:opacity-25 rounded-xl text-[#00FF88] flex items-center justify-center transition-all cursor-pointer h-[38px] w-[38px] max-h-[38px] shrink-0"
                  >
                    <Send size={12} className="stroke-[3]" />
                  </button>
                </div>
              )}

              {/* Step 2: Date of Birth check */}
              {activeStep === 2 && (
                <div className="flex flex-col gap-1 w-full text-left">
                  <div className="flex gap-1.5 w-full">
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && dob && isOver18) {
                          handleStepSubmit(2);
                        }
                      }}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="flex-grow bg-neutral-100 text-black border border-[#D1D8DD] rounded-xl px-3 text-xs outline-none focus:bg-white focus:border-black appearance-none font-mono tracking-tight h-[38px] max-h-[38px] py-0"
                    />
                    
                    <button
                      disabled={!dob || !isOver18}
                      onClick={() => handleStepSubmit(2)}
                      className="bg-black hover:bg-neutral-900 disabled:opacity-25 rounded-xl text-[#00FF88] flex items-center justify-center transition-all cursor-pointer h-[38px] w-[38px] max-h-[38px] shrink-0"
                    >
                      <Send size={12} className="stroke-[3]" />
                    </button>
                  </div>
                  {dob && !isOver18 && (
                    <span style={{ fontFamily: "'Google Sans', sans-serif", color: '#E84118' }} className="text-[11px] font-normal inline-block px-1">
                      We are sorry, but you have to be over 18 years old to use our app.
                    </span>
                  )}
                </div>
              )}

              {/* Step 4: Household & Dependents list */}
              {activeStep === 4 && (
                <div className="flex flex-col gap-1.5 text-left w-full select-text">
                  {dependents.length > 0 && (
                    <div className="flex flex-col gap-1 max-h-[85px] overflow-y-auto bg-[#F8F9FA] rounded-xl p-1 border border-neutral-200">
                      {dependents.map((dep, index) => (
                        <div key={index} className="flex gap-1 items-center bg-white border border-neutral-200 p-1 rounded-lg">
                          <div className="flex-1 relative">
                            <select 
                              value={dep.relationship || dep.relation || ""}
                              onChange={(e) => handleUpdateDependent(index, 'relationship', e.target.value)}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="w-full bg-[#F8F9FA] border border-neutral-200 px-2 py-0.5 rounded text-[11px] text-black font-normal outline-none focus:border-black cursor-pointer appearance-none pr-6"
                            >
                              <option value="" disabled hidden>Select relationship</option>
                              <option value="Father">{t("onboarding.relationships.father")}</option>
                              <option value="Mother">{t("onboarding.relationships.mother")}</option>
                              <option value="Son">{t("onboarding.relationships.son")}</option>
                              <option value="Daughter">{t("onboarding.relationships.daughter")}</option>
                              <option value="Friend">{t("onboarding.relationships.friend")}</option>
                              <option value="Others">{t("onboarding.relationships.others")}</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-neutral-400">
                              <ChevronDown size={10} />
                            </div>
                          </div>
                          <input 
                            type="text"
                            inputMode="numeric"
                            placeholder="Age"
                            value={dep.age === 0 ? '' : dep.age}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9]/g, '');
                              handleUpdateDependent(index, 'age', v ? parseInt(v) : 0);
                            }}
                            className="w-10 text-center bg-neutral-50 border border-neutral-200 px-1 py-0.5 rounded text-[11px] text-black font-normal"
                          />
                          <button
                            onClick={() => handleRemoveDependent(index)}
                            className="text-neutral-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ maxHeight: '50px' }} className="flex gap-1.5 w-full h-[50px] select-none relative">
                    {isAddDependentDropdownOpen && (
                      <div className="absolute bottom-[54px] left-0 w-full bg-white border border-neutral-200 rounded-xl shadow-lg p-1 z-50 flex flex-col gap-0.5 animate-fadeIn">
                        {[
                          { relationship: 'Father', label: t("onboarding.relationships.father"), icon: 'User', color: 'text-blue-500' },
                          { relationship: 'Mother', label: t("onboarding.relationships.mother"), icon: 'User', color: 'text-pink-500' },
                          { relationship: 'Son', label: t("onboarding.relationships.son"), icon: 'Baby', color: 'text-teal-500' },
                          { relationship: 'Daughter', label: t("onboarding.relationships.daughter"), icon: 'Baby', color: 'text-purple-500' },
                          { relationship: 'Friend', label: t("onboarding.relationships.friend"), icon: 'Users', color: 'text-neutral-500' },
                          { relationship: 'Others', label: t("onboarding.relationships.others"), icon: 'HelpCircle', color: 'text-gray-400' }
                        ].map((option) => {
                          return (
                            <button
                              key={option.relationship}
                              type="button"
                              onClick={() => {
                                setDependents([...dependents, { relation: '', relationship: option.relationship, age: 0 }]);
                                setIsAddDependentDropdownOpen(false);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11px] text-neutral-800 hover:bg-neutral-50 rounded-lg cursor-pointer transition-colors"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            >
                              {option.icon === 'User' && <User size={13} className={option.color} />}
                              {option.icon === 'Baby' && <Baby size={13} className={option.color} />}
                              {option.icon === 'Users' && <Users size={13} className={option.color} />}
                              {option.icon === 'HelpCircle' && <HelpCircle size={13} className={option.color} />}
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsAddDependentDropdownOpen(!isAddDependentDropdownOpen)}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, height: '50px' }}
                      className="flex-1 h-[50px] bg-neutral-900 text-white rounded-xl text-[11px] flex items-center justify-center gap-1.5 hover:bg-black transition-all relative"
                    >
                      <span className="flex items-center justify-center">
                        <UserPlus size={11} />
                      </span>
                    <div className="flex items-center justify-center gap-1 p-2 rounded-lg border border-neutral-200" style={{ backgroundColor: "#000000" }}>
                        <span className="text-white">{t("onboarding.add_dependent", "Add dependent")}</span>
                        <ChevronDown size={11} className={`transition-transform duration-200 text-white ${isAddDependentDropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    <button
                      onClick={() => handleStepSubmit(4)}
                      style={{ fontFamily: "'Google Sans', sans-serif", backgroundColor: "#A6DDB1" }}
                      className="px-4 h-full text-black text-[11px] rounded-xl hover:scale-[1.01] transition-all cursor-pointer flex items-center gap-1 font-bold"
                    >
                      {dependents.length === 0 ? t("onboarding.no_dependents", "No dependents") : t("confirmation_modal.confirm", "Confirm")}
                      <ChevronRight size={11} className="stroke-[3]" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 7: Goals and Experience levels */}
              {activeStep === 7 && (
                <div style={{ fontFamily: "'Google Sans', sans-serif" }} className="w-full max-w-[600px] mx-auto select-none px-4 md:px-0 flex flex-col gap-4 text-left font-sans max-h-[60vh] md:max-h-[70vh] overflow-y-auto scrollbar-thin pr-1">
                  <div className="bg-white border border-[#E1E8ED] rounded-2xl p-4 md:p-6 shadow-sm flex flex-col gap-4">
                    <span 
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif",
                        fontSize: "12px", 
                        color: "#000000", 
                        fontWeight: "bold", 
                        fontStyle: "normal", 
                        textDecorationLine: "none", 
                        textAlign: "center" 
                      }} 
                      className="block"
                    >
                      {t("onboarding.choose_financial_priority", "Choose your current financial priority:")}
                    </span>

                    {/* Goal Selection Dropdown with Custom Icons */}
                    <div className="relative w-full select-none mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !isGoalDropdownOpen;
                          setIsGoalDropdownOpen(nextVal);
                          if (nextVal) {
                            setTimeout(() => {
                              chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                          }
                        }}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                        className="w-full h-[44px] bg-white border border-neutral-250 rounded-xl px-4 flex items-center justify-between text-black outline-none focus:border-[#A6DDB1] transition-all cursor-pointer shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          {(() => {
                            const selectedGoal = GOALS_CONFIG.find(g => g.key === primaryGoal);
                            if (selectedGoal) {
                              if (selectedGoal.key === 'tackle_debt') return <TrendingDown size={14} className="text-red-500" />;
                              if (selectedGoal.key === 'emergency_fund') return <Shield size={14} className="text-teal-500" />;
                              if (selectedGoal.key === 'save_house') return <Home size={14} className="text-blue-500" />;
                              if (selectedGoal.key === 'launch_business') return <Briefcase size={14} className="text-purple-500" />;
                              if (selectedGoal.key === 'investment_portfolio') return <TrendingUp size={14} className="text-emerald-500" />;
                              if (selectedGoal.key === 'retirement') return <Coins size={14} className="text-amber-500" />;
                            }
                            return <Sparkles size={14} className="text-neutral-400" />;
                          })()}
                          <span className="text-[12px]">
                            {
                              primaryGoal 
                                ? t(`onboarding.goals.${primaryGoal}.label`) 
                                : t("onboarding.select_priority_placeholder", "Select your financial priority...")
                            }
                          </span>
                        </div>
                        <ChevronDown size={14} className={`text-neutral-400 transition-transform duration-200 ${isGoalDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isGoalDropdownOpen && (
                        <div className="absolute top-[48px] left-0 w-full bg-white border border-neutral-200 rounded-xl shadow-lg p-1 z-50 flex flex-col gap-0.5 animate-fadeIn max-h-[300px] overflow-y-auto scrollbar-thin">
                          {GOALS_CONFIG.map((goal) => {
                            const isSelected = primaryGoal === goal.key;
                            return (
                              <button
                                key={goal.key}
                                type="button"
                                onClick={() => {
                                  setPrimaryGoal(goal.key);
                                  setFinancialGoals([goal.key]);
                                  setGoalAmount('');
                                  setIsGoalDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left rounded-lg cursor-pointer transition-colors ${
                                  isSelected ? 'bg-neutral-50 font-bold' : 'hover:bg-neutral-50'
                                }`}
                                style={{ fontFamily: "'Google Sans', sans-serif" }}
                              >
                                <div className="flex items-center gap-2.5">
                                  {goal.key === 'tackle_debt' && <TrendingDown size={14} className="text-red-500 shrink-0" />}
                                  {goal.key === 'emergency_fund' && <Shield size={14} className="text-teal-500 shrink-0" />}
                                  {goal.key === 'save_house' && <Home size={14} className="text-blue-500 shrink-0" />}
                                  {goal.key === 'launch_business' && <Briefcase size={14} className="text-purple-500 shrink-0" />}
                                  {goal.key === 'investment_portfolio' && <TrendingUp size={14} className="text-emerald-500 shrink-0" />}
                                  {goal.key === 'retirement' && <Coins size={14} className="text-amber-500 shrink-0" />}
                                  <span className="text-[12px] text-neutral-800">{t(`onboarding.goals.${goal.key}.label`)}</span>
                                </div>
                                {isSelected && <Check size={12} className="text-neutral-900 stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Disclose single, relevant input question row below it if active selection exists */}
                    {(() => {
                      if (primaryGoal === '') return null;
                      const config = GOALS_CONFIG.find(g => g.key === primaryGoal);
                      if (!config) return null;

                      return (
                        <div className="flex flex-col gap-4 mt-2.5 animate-fadeIn">
                          {/* CSS clamp fluid styling explicitly over white canvas interfaces */}
                          <label 
                            style={{ 
                              fontFamily: "'Google Sans', sans-serif",
                              fontSize: 'clamp(0.95rem, 2.5vw, 1.25rem)', 
                              fontWeight: 500
                            }}
                            className="text-black leading-tight block text-left"
                          >
                            {t(`onboarding.goals.${primaryGoal}.question`, config.question)}
                          </label>

                          {/* Input and suffix base currency container element */}
                          {/* Stacks vertically on mobile with 1rem safety margins, and aligns horizontally on desktop/tablet */}
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={goalAmount}
                                onChange={(e) => {
                                  const numericValue = e.target.value.replace(/[^0-9]/g, '');
                                  setGoalAmount(numericValue);
                                }}
                                placeholder={config.placeholder}
                                className="w-full bg-neutral-100 text-black border border-[#D1D8DD] rounded-xl px-4 text-xs outline-none focus:bg-white focus:border-black placeholder:text-neutral-400 h-[38px] py-0 font-normal font-sans"
                              />
                            </div>
                            {/* Base Currency suffix display box next to wrapper */}
                            <div className="h-[38px] flex items-center justify-center bg-white px-4 rounded-xl border border-neutral-200 shrink-0 text-xs font-bold text-neutral-500 font-sans tracking-tight">
                              {currency || 'AED'}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Financial Experience block and confirms */}
                    <div className="flex flex-col gap-3.5 border-t border-neutral-100 pt-3.5 mt-1">
                      <div className="flex justify-end mt-1">
                        <button
                          onClick={() => {
                            if (primaryGoal && goalAmount.trim() !== '') {
                              handleStepSubmit(7);
                            }
                          }}
                          disabled={!primaryGoal || goalAmount.trim() === ''}
                          style={{ fontWeight: 700 }}
                          className={`px-6 py-2.5 text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all text-white bg-black ${
                            primaryGoal && goalAmount.trim() !== '' 
                              ? 'hover:bg-neutral-900 active:scale-95 cursor-pointer' 
                              : 'opacity-50 cursor-not-allowed bg-neutral-300'
                          }`}
                        >
                          {t("onboarding.confirm_goal", "Confirm Goal")}
                          <ChevronRight size={11} className="stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </footer>
      )}

      <AnimatePresence>
        {showCelebration && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-[#0E1111]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center select-none"
            id="onboarding-celebration-screen"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 15 }}
              className="max-w-md w-full bg-white border border-neutral-800/10 rounded-[32px] p-8 shadow-2xl relative overflow-hidden text-center flex flex-col items-center"
            >
              {/* Aesthetic visual glowing ring */}
              <div className="absolute inset-0 bg-gradient-to-tr from-[#00FF88]/5 to-transparent pointer-events-none" />

              {/* Large Checkmark Wrapper in Vantage Emerald Green (#00FF88) */}
              <div className="w-20 h-20 rounded-full bg-[#00FF88]/10 flex items-center justify-center border border-[#00FF88]/30 mb-6 relative">
                <motion.div
                  initial={{ rotate: -20, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="flex items-center justify-center"
                >
                  <Check size={40} className="text-[#00E070] stroke-[3]" />
                </motion.div>
                <div className="absolute -inset-1 rounded-full border border-[#00FF88]/20 animate-ping opacity-60 pointer-events-none" />
              </div>

              {/* Celebration Headers */}
              <h2 className="text-2xl font-serif font-black tracking-tight text-neutral-900 mb-3 uppercase">
                Vault Live
              </h2>
              
              <p className="text-[14.5px] font-black text-[#000000] leading-relaxed mb-4 font-sans">
                {t("onboarding.celebration_message", "Welcome aboard! Your secure financial vault is now live.")}
              </p>

              {checkingDestination === 'dedicated' && (
                <div 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="w-full text-xs text-[#2A4430] bg-[#A6DDB1]/20 border border-[#A6DDB1]/45 px-3 py-2.5 rounded-2xl mb-6 font-normal tracking-tight text-center leading-normal"
                >
                  ✓ Automated <span className="font-semibold text-black">"Salary Account"</span> & recurring wages ledger successfully provisioned
                </div>
              )}

              {/* Loading Bar simulation */}
              <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.4, ease: "easeInOut" }}
                  className="bg-[#00E070] h-full shadow-[0_0_8px_rgba(0,255,136,0.3)]"
                />
              </div>

              <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#00E070] mt-4 leading-none select-none">
                Initializing vantage cockpit...
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
          </>
        )}

      {/* Dynamic styles injected to ensure clean hide scrolls */}
      <style>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
      </div>
    </div>
  );
};
