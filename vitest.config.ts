import { defineConfig } from "vitest/config";

// The Excalidraw runtime needs a real browser (canvas metrics, fonts), so unit
// tests cover the dependency-free logic only; the rest is exercised in the app.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
