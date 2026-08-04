import 'i18next';
import type { englishProcessorMessages } from './index';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof englishProcessorMessages;
    };
  }
}
