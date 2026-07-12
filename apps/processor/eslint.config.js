import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"
import { architecturePlugin } from "../../eslint.config.mjs"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      architecture: architecturePlugin,
    },
    rules: {
      "architecture/processor-zone-imports": "error",
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@pressly/",
              message:
                "Processor UI primitives cannot depend on product protocols or application packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/ports/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?:react(?:/.*)?$|react-dom(?:/.*)?$|radix-ui$|@base-ui/.*|sonner$|next-themes$)",
              message:
                "Processor ports describe framework-free capabilities and cannot import UI frameworks or vendors.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "document",
          message: "Browser globals belong in processor adapters or app code.",
        },
        {
          name: "fetch",
          message: "Network effects belong in processor adapters.",
        },
        {
          name: "localStorage",
          message: "Browser storage belongs in processor adapters.",
        },
        {
          name: "window",
          message: "Browser globals belong in processor adapters or app code.",
        },
      ],
    },
  },
  {
    files: ["src/ports/**/*.{ts,tsx}"],
    ignores: ["src/ports/**/*.port.ts", "src/ports/**/*.error.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Processor port files must declare their role with *.port.ts or *.error.ts.",
        },
      ],
    },
  },
  {
    files: ["src/adapters/**/*.{ts,tsx}"],
    ignores: ["src/adapters/**/*.adapter.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Processor adapter files must declare their role with *.adapter.ts. Test fixtures belong under test/.",
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    ignores: [
      "src/features/**/*.model.ts",
      "src/features/**/*.presenter.ts",
      "src/features/**/*.view.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Processor feature files must declare their role with *.model.ts, *.presenter.ts, or *.view.tsx.",
        },
      ],
    },
  },
  {
    files: [
      "src/common/**/*.{ts,tsx}",
      "src/hooks/**/*.{ts,tsx}",
      "src/shared/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Processor code must use an explicit app, port, adapter, feature, or component owner; generic common/shared/hooks/lib buckets are forbidden.",
        },
      ],
    },
  },
])
