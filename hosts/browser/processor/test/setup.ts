import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import {
  initializeProcessorLocalization,
  processorLanguageStorageKey,
} from '@pressly/experience-processor/browser';
import { afterEach, beforeEach } from 'vitest';

const localization = initializeProcessorLocalization(
  {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
    remove: (key) => window.localStorage.removeItem(key),
    subscribe: () => () => undefined,
  },
  {
    applyLanguage: (language) => {
      document.documentElement.lang = language;
      document.documentElement.dir = 'ltr';
    },
    readLanguage: () => document.documentElement.lang,
  },
);

configure({ asyncUtilTimeout: 5_000 });

if (HTMLElement.prototype.hasPointerCapture === undefined)
  HTMLElement.prototype.hasPointerCapture = () => false;
if (HTMLElement.prototype.setPointerCapture === undefined)
  HTMLElement.prototype.setPointerCapture = () => undefined;
if (HTMLElement.prototype.releasePointerCapture === undefined)
  HTMLElement.prototype.releasePointerCapture = () => undefined;
if (HTMLElement.prototype.scrollIntoView === undefined)
  HTMLElement.prototype.scrollIntoView = () => undefined;

beforeEach(() => {
  void localization.i18n.changeLanguage('en');
  window.localStorage.removeItem(processorLanguageStorageKey);
});

afterEach(cleanup);
