import i18next from "i18next"
import { initReactI18next } from "react-i18next"

import englishAppMessages from "./locales/en/app.json"
import englishAuthenticationMessages from "./locales/en/authentication.json"
import englishForecastMessages from "./locales/en/forecast.json"
import englishHistoryMessages from "./locales/en/history.json"
import englishIntakeMessages from "./locales/en/intake.json"
import englishLocationSelectionMessages from "./locales/en/location-selection.json"
import englishOrderControlMessages from "./locales/en/order-control.json"
import englishOrderResolutionMessages from "./locales/en/order-resolution.json"
import englishProductionBoardMessages from "./locales/en/production-board.json"
import englishSchedulingMessages from "./locales/en/scheduling.json"
import englishSettingsMessages from "./locales/en/settings.json"
import spanishAppMessages from "./locales/es/app.json"
import spanishAuthenticationMessages from "./locales/es/authentication.json"
import spanishForecastMessages from "./locales/es/forecast.json"
import spanishHistoryMessages from "./locales/es/history.json"
import spanishIntakeMessages from "./locales/es/intake.json"
import spanishLocationSelectionMessages from "./locales/es/location-selection.json"
import spanishOrderControlMessages from "./locales/es/order-control.json"
import spanishOrderResolutionMessages from "./locales/es/order-resolution.json"
import spanishProductionBoardMessages from "./locales/es/production-board.json"
import spanishSchedulingMessages from "./locales/es/scheduling.json"
import spanishSettingsMessages from "./locales/es/settings.json"

type ResourceShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : ResourceShape<T[Key]>
}

export { englishAppMessages, spanishAppMessages }

export const englishProcessorMessages = {
  ...englishAppMessages,
  ...englishAuthenticationMessages,
  ...englishForecastMessages,
  ...englishLocationSelectionMessages,
  ...englishSettingsMessages,
  ...englishIntakeMessages,
  ...englishSchedulingMessages,
  ...englishHistoryMessages,
  ...englishOrderControlMessages,
  ...englishOrderResolutionMessages,
  ...englishProductionBoardMessages,
} as const

export const spanishProcessorMessages = {
  ...spanishAppMessages,
  ...spanishAuthenticationMessages,
  ...spanishForecastMessages,
  ...spanishLocationSelectionMessages,
  ...spanishSettingsMessages,
  ...spanishIntakeMessages,
  ...spanishSchedulingMessages,
  ...spanishHistoryMessages,
  ...spanishOrderControlMessages,
  ...spanishOrderResolutionMessages,
  ...spanishProductionBoardMessages,
} satisfies ResourceShape<typeof englishProcessorMessages>

export const processorLanguageStorageKey = "pressly.processor.language"

const supportedLanguages = ["en", "es"] as const
type ProcessorLanguage = (typeof supportedLanguages)[number]

const isProcessorLanguage = (
  value: string | null | undefined
): value is ProcessorLanguage =>
  value !== null &&
  value !== undefined &&
  supportedLanguages.includes(value as ProcessorLanguage)

const synchronizeDocument = (language: string): void => {
  document.documentElement.lang = language.startsWith("es") ? "es" : "en"
  document.documentElement.dir = "ltr"
}

let preferenceStorage: Storage | undefined
let languageListenerRegistered = false

const synchronizeLanguage = (language: string): void => {
  const normalized = language.startsWith("es") ? "es" : "en"
  preferenceStorage?.setItem(processorLanguageStorageKey, normalized)
  synchronizeDocument(normalized)
}

export const initializeProcessorLocalization = (storage: Storage) => {
  preferenceStorage = storage
  const stored = storage.getItem(processorLanguageStorageKey)
  const language = isProcessorLanguage(stored) ? stored : "en"

  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      resources: {
        en: { translation: englishProcessorMessages },
        es: { translation: spanishProcessorMessages },
      },
      lng: language,
      fallbackLng: "en",
      supportedLngs: supportedLanguages,
      load: "languageOnly",
      initAsync: false,
      interpolation: { escapeValue: false },
    })
  } else {
    void i18next.changeLanguage(language)
  }

  if (!languageListenerRegistered) {
    i18next.on("languageChanged", synchronizeLanguage)
    languageListenerRegistered = true
  }
  synchronizeDocument(i18next.resolvedLanguage ?? language)

  return i18next
}
