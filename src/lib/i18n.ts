import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import ar from '../locales/ar.json';
import ru from '../locales/ru.json';
import es from '../locales/es.json';
import hi from '../locales/hi.json';
import ur from '../locales/ur.json';
import ko from '../locales/ko.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  ru: { translation: ru },
  es: { translation: es },
  hi: { translation: hi },
  ur: { translation: ur },
  ko: { translation: ko },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    load: 'languageOnly',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;
