import { defineConfig } from "@playwright/test";

const webgpuArgs = [
  "--enable-unsafe-webgpu",
  ...(process.platform === "darwin"
    ? ["--enable-gpu"]
    : [
        "--enable-unsafe-swiftshader",
        "--use-webgpu-adapter=swiftshader",
        "--enable-dawn-features=allow_unsafe_apis",
        "--disable-dawn-features=use_dxc",
        "--enable-webgpu-developer-features",
        "--use-gpu-in-tests",
        "--enable-accelerated-2d-canvas"
      ])
];

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    launchOptions: { args: webgpuArgs }
  },
  webServer: {
    command: `${process.env.RUBY_BIN || "ruby"} exe/webvas serve public --port 4173`,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
