import { IconMoon, IconSun } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
} from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export function AppearanceSettings({
  theme,
  onThemeChange,
}: {
  theme: "light" | "dark"
  onThemeChange: (theme: "light" | "dark") => void
}) {
  const { t } = useTranslation()

  const selectTheme = (nextTheme: string) => {
    if (nextTheme === "light" || nextTheme === "dark") {
      onThemeChange(nextTheme)
    }
  }

  return (
    <Card className="self-start bg-background">
      <CardHeader>
        <CardTitle>{t("settings.appearance")}</CardTitle>
        <CardDescription>{t("settings.appearanceDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="responsive">
          <FieldContent>
            <FieldTitle id="color-mode-label">
              {t("settings.colorMode")}
            </FieldTitle>
            <FieldDescription>{t("settings.preferenceSaved")}</FieldDescription>
          </FieldContent>
          <ToggleGroup
            type="single"
            value={theme}
            onValueChange={selectTheme}
            variant="outline"
            aria-labelledby="color-mode-label"
          >
            <ToggleGroupItem value="light">
              <IconSun aria-hidden="true" />
              {t("settings.light")}
            </ToggleGroupItem>
            <ToggleGroupItem value="dark">
              <IconMoon aria-hidden="true" />
              {t("settings.dark")}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </CardContent>
    </Card>
  )
}
