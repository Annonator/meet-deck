import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      include: ["src/**/*.ts"]
    },
    environment: "node",
    restoreMocks: true
  }
});
