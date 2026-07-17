import { initializeI18nextLocalizationAdapter } from "@/adapters/localization/i18next-localization.adapter"
import {
  englishAuthenticationMessages,
  spanishAuthenticationMessages,
} from "@/features/authentication/authentication.messages"
import {
  englishHistoryMessages,
  spanishHistoryMessages,
} from "@/features/history/history.messages"
import {
  englishIntakeMessages,
  spanishIntakeMessages,
} from "@/features/intake/intake.messages"
import {
  englishLocationSelectionMessages,
  spanishLocationSelectionMessages,
} from "@/features/location-selection/location-selection.messages"
import {
  englishOrderControlMessages,
  spanishOrderControlMessages,
} from "@/features/order-control/order-control.messages"
import {
  englishProductionBoardMessages,
  spanishProductionBoardMessages,
} from "@/features/production-board/production-board.messages"
import {
  englishSchedulingMessages,
  spanishSchedulingMessages,
} from "@/features/scheduling/scheduling.messages"
import {
  englishSettingsMessages,
  spanishSettingsMessages,
} from "@/features/settings/settings.messages"
import { englishAppMessages, spanishAppMessages } from "../app.messages"

type ResourceShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : ResourceShape<T[Key]>
}

export const englishProcessorMessages = {
  ...englishAppMessages,
  ...englishAuthenticationMessages,
  ...englishLocationSelectionMessages,
  ...englishSettingsMessages,
  ...englishIntakeMessages,
  ...englishSchedulingMessages,
  ...englishHistoryMessages,
  ...englishOrderControlMessages,
  ...englishProductionBoardMessages,
} as const

export const spanishProcessorMessages = {
  ...spanishAppMessages,
  ...spanishAuthenticationMessages,
  ...spanishLocationSelectionMessages,
  ...spanishSettingsMessages,
  ...spanishIntakeMessages,
  ...spanishSchedulingMessages,
  ...spanishHistoryMessages,
  ...spanishOrderControlMessages,
  ...spanishProductionBoardMessages,
} satisfies ResourceShape<typeof englishProcessorMessages>

export const initializeProcessorLocalization = (storage: Storage) =>
  initializeI18nextLocalizationAdapter({
    storage,
    resources: {
      en: { translation: englishProcessorMessages },
      es: { translation: spanishProcessorMessages },
    },
  })
