/* eslint-disable react-refresh/only-export-components */
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

const applyTheme = (theme: ControlTheme) => {
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(theme)
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storage = window.localStorage,
}: {
  children: ReactNode
  defaultTheme?: ControlTheme
  storage?: Storage
}) {
  const [theme, setThemeState] = useState<ControlTheme>(() => {
    const stored = storage.getItem(controlThemeStorageKey)
    return isTheme(stored) ? stored : defaultTheme
  })

  const setTheme = useCallback(
    (nextTheme: ControlTheme) => {
      storage.setItem(controlThemeStorageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storage],
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const synchronizeTheme = (event: StorageEvent) => {
      if (event.storageArea !== storage || event.key !== controlThemeStorageKey)
        return
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme)
    }
    window.addEventListener("storage", synchronizeTheme)
    return () => window.removeEventListener("storage", synchronizeTheme)
  }, [defaultTheme, storage])

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
