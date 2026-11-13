import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  webServer: {command:"npm run dev -- --port 5173 --strictPort",url:"http://127.0.0.1:5173",reuseExistingServer:!process.env.CI},
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (process.env.CI ? undefined : "/usr/bin/chromium"),
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    },
  },
});
