import { IconMoon, IconSun } from "@tabler/icons-react"
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
  const selectTheme = (nextTheme: string) => {
    if (nextTheme === "light" || nextTheme === "dark") {
      onThemeChange(nextTheme)
    }
  }

  return (
    <Card className="self-start bg-background">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose how the processor looks on this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="responsive">
          <FieldContent>
            <FieldTitle id="color-mode-label">Color mode</FieldTitle>
            <FieldDescription>
              Your preference is saved automatically.
            </FieldDescription>
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
              Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark">
              <IconMoon aria-hidden="true" />
              Dark
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </CardContent>
    </Card>
  )
}
