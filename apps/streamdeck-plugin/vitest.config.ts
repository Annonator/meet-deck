import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    decorator: {
      legacy: true
    },
    target: "es2022"
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true
  }
});
