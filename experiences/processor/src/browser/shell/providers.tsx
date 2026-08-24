import { invariantViolationError } from "@pressly/errors/factories"
import * as React from "react"
import {
  useProcessorBrowserCapabilities,
  type ProcessorBrowserKeyInput,
} from "../browser-capabilities.tsx"

type Theme = "dark" | "light" | "system"
type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const THEME_VALUES: Theme[] = ["dark", "light", "system"]

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false
  }

  return THEME_VALUES.includes(value as Theme)
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const browser = useProcessorBrowserCapabilities()
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = browser.storage.read(storageKey)
    if (isTheme(storedTheme)) {
      return storedTheme
    }

    return defaultTheme
  })

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      browser.storage.write(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [browser.storage, storageKey]
  )

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const resolvedTheme =
        nextTheme === "system" ? browser.theme.system() : nextTheme
      const restoreTransitions = disableTransitionOnChange
        ? browser.theme.suppressTransitions()
        : null

      browser.theme.apply(resolvedTheme)

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [browser.theme, disableTransitionOnChange]
  )

  React.useEffect(() => {
    applyTheme(theme)

    if (theme !== "system") {
      return undefined
    }

    const handleChange = () => {
      applyTheme("system")
    }
    return browser.theme.subscribeSystem(handleChange)
  }, [theme, applyTheme])

  React.useEffect(() => {
    const handleKeyDown = (event: ProcessorBrowserKeyInput) => {
      if (event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.editable) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      setThemeState((currentTheme) => {
        const nextTheme =
          currentTheme === "dark"
            ? "light"
            : currentTheme === "light"
              ? "dark"
              : browser.theme.system() === "dark"
                ? "light"
                : "dark"

        browser.storage.write(storageKey, nextTheme)
        return nextTheme
      })
    }

    return browser.keyboard.subscribe(handleKeyDown)
  }, [browser.keyboard, browser.storage, browser.theme, storageKey])

  React.useEffect(() => {
    const handleStorageChange = (event: {
      key: string | null
      newValue: string | null
    }) => {
      if (event.key !== storageKey) {
        return
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue)
        return
      }

      setThemeState(defaultTheme)
    }

    return browser.storage.subscribe(handleStorageChange)
  }, [browser.storage, defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw invariantViolationError({
      code: "processor_theme_provider_missing",
      message: "useTheme must be used within a ThemeProvider.",
    })
  }

  return context
}
