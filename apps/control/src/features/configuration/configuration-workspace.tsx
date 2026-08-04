import { IconLanguage, IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { useTheme, type ControlTheme } from '@/app/theme-provider';
import { isControlLanguage } from '@/i18n';

function LanguageConfiguration() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith('es') ? 'es' : 'en';

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>{t('configuration.language.title')}</CardTitle>
        <CardDescription>
          {t('configuration.language.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="responsive">
          <FieldContent>
            <FieldTitle id="control-language-label">
              {t('configuration.language.title')}
            </FieldTitle>
            <FieldDescription>
              {t('configuration.language.preferenceSaved')}
            </FieldDescription>
          </FieldContent>
          <ToggleGroup
            type="single"
            value={language}
            variant="outline"
            aria-labelledby="control-language-label"
            onValueChange={(value) => {
              if (isControlLanguage(value)) void i18n.changeLanguage(value);
            }}
          >
            <ToggleGroupItem value="en">
              <IconLanguage aria-hidden="true" />
              {t('configuration.language.english')}
            </ToggleGroupItem>
            <ToggleGroupItem value="es">
              <IconLanguage aria-hidden="true" />
              {t('configuration.language.spanish')}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </CardContent>
    </Card>
  );
}

function isControlTheme(value: string): value is ControlTheme {
  return value === 'light' || value === 'dark';
}

function AppearanceConfiguration() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>{t('configuration.appearance.title')}</CardTitle>
        <CardDescription>
          {t('configuration.appearance.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="responsive">
          <FieldContent>
            <FieldTitle id="control-color-mode-label">
              {t('configuration.appearance.colorMode')}
            </FieldTitle>
            <FieldDescription>
              {t('configuration.appearance.preferenceSaved')}
            </FieldDescription>
          </FieldContent>
          <ToggleGroup
            type="single"
            value={theme}
            variant="outline"
            aria-labelledby="control-color-mode-label"
            onValueChange={(value) => {
              if (isControlTheme(value)) setTheme(value);
            }}
          >
            <ToggleGroupItem value="light">
              <IconSun aria-hidden="true" />
              {t('configuration.appearance.light')}
            </ToggleGroupItem>
            <ToggleGroupItem value="dark">
              <IconMoon aria-hidden="true" />
              {t('configuration.appearance.dark')}
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </CardContent>
    </Card>
  );
}

export function ConfigurationWorkspace() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LanguageConfiguration />
      <AppearanceConfiguration />
    </div>
  );
}
