import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium"
  },
  webServer: {
    command: "bundle exec ruby script/build_site && bundle exec ruby -Ilib -rwebvas -rwebvas/cli -e 'exit Webvas::CLI.run(%w[serve --port 4173 --root] + [ENV.fetch(\"WEBVAS_SITE_DIR\", \"public\")])'",
    url: "http://127.0.0.1:4173",
    env: { WEBVAS_SITE_DIR: process.env.WEBVAS_SITE_DIR || "public" },
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
