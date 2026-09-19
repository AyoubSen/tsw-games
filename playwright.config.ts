import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  reporter: "line",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "pnpm dev:party",
      port: 1999,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm exec vite dev --port 4173 --strictPort",
      port: 4173,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
