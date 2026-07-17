import i18next, { type Resource } from "i18next"
import { initReactI18next } from "react-i18next"

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

export const initializeI18nextLocalizationAdapter = (input: {
  resources: Resource
  storage: Storage
}) => {
  preferenceStorage = input.storage
  const stored = input.storage.getItem(processorLanguageStorageKey)
  const language = isProcessorLanguage(stored) ? stored : "en"

  if (!i18next.isInitialized)
    void i18next.use(initReactI18next).init({
      resources: input.resources,
      lng: language,
      fallbackLng: "en",
      supportedLngs: supportedLanguages,
      load: "languageOnly",
      initAsync: false,
      interpolation: { escapeValue: false },
    })
  else void i18next.changeLanguage(language)

  if (!languageListenerRegistered) {
    i18next.on("languageChanged", synchronizeLanguage)
    languageListenerRegistered = true
  }
  synchronizeDocument(i18next.resolvedLanguage ?? language)

  return i18next
}
