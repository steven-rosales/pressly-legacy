import { invariantViolationError } from "@pressly/errors/factories"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useControlBrowserCapabilities } from "../browser-capabilities.tsx"

export const controlThemeStorageKey = "pressly.control.theme"

const themes = ["light", "dark"] as const
export type ControlTheme = (typeof themes)[number]

type ThemeContextValue = Readonly<{
  theme: ControlTheme
  setTheme: (theme: ControlTheme) => void
}>

const ThemeContext = createContext<ThemeContextValue | null>(null)

const isTheme = (value: string | null): value is ControlTheme =>
  value !== null && themes.includes(value as ControlTheme)

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: ReactNode
  defaultTheme?: ControlTheme
}) {
  const browser = useControlBrowserCapabilities()
  const [theme, setThemeState] = useState<ControlTheme>(() => {
    const stored = browser.storage.read(controlThemeStorageKey)
    return isTheme(stored) ? stored : defaultTheme
  })

  const setTheme = useCallback(
    (nextTheme: ControlTheme) => {
      browser.storage.write(controlThemeStorageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [browser.storage],
  )

  useEffect(() => {
    browser.theme.apply(theme)
  }, [browser.theme, theme])

  useEffect(() => {
    const synchronizeTheme = (event: {
      key: string | null
      newValue: string | null
    }) => {
      if (event.key !== controlThemeStorageKey) return
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme)
    }
    return browser.theme.subscribe(synchronizeTheme)
  }, [browser.theme, defaultTheme])

  const value = useMemo(() => ({ theme, setTheme }), [setTheme, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (value === null)
    throw invariantViolationError({
      code: "control_theme_provider_missing",
      message: "useTheme must be used within a ThemeProvider.",
    })
  return value
}
