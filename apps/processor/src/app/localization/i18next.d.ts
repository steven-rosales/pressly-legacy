import "i18next"
import type { englishProcessorMessages } from "./localization.composition"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: {
      translation: typeof englishProcessorMessages
    }
  }
}
