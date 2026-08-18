import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/bin/**", "**/build/**", "**/coverage/**", "**/dist/**", "**/node_modules/**"]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }]
    }
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked
  },
  {
    files: ["**/test/**/*.ts", "**/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off"
    }
  },
  {
    files: ["apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/ui/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        WebSocket: "readonly",
        window: "readonly"
      }
    }
  },
  {
    files: ["**/*.config.{js,mjs,cjs}", "**/scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly"
      }
    }
  }
);
