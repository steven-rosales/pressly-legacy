import { IconLanguage } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../browser/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
} from "../../browser/components/ui/field"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../browser/components/ui/toggle-group"

const processorLanguages = ["en", "es"] as const
type ProcessorLanguage = (typeof processorLanguages)[number]

const isProcessorLanguage = (value: string): value is ProcessorLanguage =>
  processorLanguages.includes(value as ProcessorLanguage)

export function LanguageSettings() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage?.startsWith("es") ? "es" : "en"

  return (
    <Card className="self-start bg-background">
      <CardHeader>
        <CardTitle>{t("language.title")}</CardTitle>
        <CardDescription>{t("language.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="responsive">
          <FieldContent>
            <FieldTitle id="language-label">{t("language.title")}</FieldTitle>
            <FieldDescription>{t("language.preferenceSaved")}</FieldDescription>
          </FieldContent>
          <ToggleGroup
            type="single"
            value={language}
            onValueChange={(value) => {
              if (isProcessorLanguage(value)) void i18n.changeLanguage(value)
            }}
            variant="outline"
            aria-labelledby="language-label"
          >
            <ToggleGroupItem value="en">
              <IconLanguage aria-hidden="true" />
              {t("language.english")}
            </ToggleGroupItem>
            <ToggleGroupItem value="es">
              <IconLanguage aria-hidden="true" />
              {t("language.spanish")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </CardContent>
    </Card>
  )
}
