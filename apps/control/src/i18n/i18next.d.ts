import 'i18next';
import type { englishControlMessages } from './index';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof englishControlMessages;
    };
  }
}
