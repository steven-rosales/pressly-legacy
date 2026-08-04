import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import englishAppMessages from './locales/en/app.json';
import englishAuthenticationMessages from './locales/en/authentication.json';
import englishConfigurationMessages from './locales/en/configuration.json';
import englishCustomerMessages from './locales/en/customers.json';
import englishOrderMessages from './locales/en/orders.json';
import englishSecurityMessages from './locales/en/security.json';
import englishTeamMessages from './locales/en/team.json';
import spanishAppMessages from './locales/es/app.json';
import spanishAuthenticationMessages from './locales/es/authentication.json';
import spanishConfigurationMessages from './locales/es/configuration.json';
import spanishCustomerMessages from './locales/es/customers.json';
import spanishOrderMessages from './locales/es/orders.json';
import spanishSecurityMessages from './locales/es/security.json';
import spanishTeamMessages from './locales/es/team.json';

type ResourceShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : ResourceShape<T[Key]>;
};

export const englishControlMessages = {
  ...englishAppMessages,
  ...englishAuthenticationMessages,
  ...englishConfigurationMessages,
  ...englishCustomerMessages,
  ...englishOrderMessages,
  ...englishSecurityMessages,
  ...englishTeamMessages,
} as const;

export const spanishControlMessages = {
  ...spanishAppMessages,
  ...spanishAuthenticationMessages,
  ...spanishConfigurationMessages,
  ...spanishCustomerMessages,
  ...spanishOrderMessages,
  ...spanishSecurityMessages,
  ...spanishTeamMessages,
} satisfies ResourceShape<typeof englishControlMessages>;

export const controlLanguageStorageKey = 'pressly.control.language';

const supportedLanguages = ['en', 'es'] as const;
export type ControlLanguage = (typeof supportedLanguages)[number];

export const isControlLanguage = (
  value: string | null | undefined,
): value is ControlLanguage =>
  value !== null &&
  value !== undefined &&
  supportedLanguages.includes(value as ControlLanguage);

export const localeForLanguage = (
  language: string | null | undefined,
): 'en-US' | 'es-US' => (language?.startsWith('es') ? 'es-US' : 'en-US');

const synchronizeDocument = (language: string) => {
  document.documentElement.lang = language.startsWith('es') ? 'es' : 'en';
  document.documentElement.dir = 'ltr';
};

let preferenceStorage: Storage | undefined;
let languageListenerRegistered = false;

const synchronizeLanguage = (language: string) => {
  const normalized = language.startsWith('es') ? 'es' : 'en';
  preferenceStorage?.setItem(controlLanguageStorageKey, normalized);
  synchronizeDocument(normalized);
};

export const initializeControlLocalization = (storage: Storage) => {
  preferenceStorage = storage;
  const stored = storage.getItem(controlLanguageStorageKey);
  const language = isControlLanguage(stored) ? stored : 'en';

  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      resources: {
        en: { translation: englishControlMessages },
        es: { translation: spanishControlMessages },
      },
      lng: language,
      fallbackLng: 'en',
      supportedLngs: supportedLanguages,
      load: 'languageOnly',
      initAsync: false,
      interpolation: { escapeValue: false },
    });
  } else {
    void i18next.changeLanguage(language);
  }

  if (!languageListenerRegistered) {
    i18next.on('languageChanged', synchronizeLanguage);
    languageListenerRegistered = true;
  }
  synchronizeDocument(i18next.resolvedLanguage ?? language);

  return i18next;
};
