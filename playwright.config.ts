import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright設定
 * E2Eテスト用
 */
export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: "html",
    use: {
        baseURL: "http://127.0.0.1:8787",
        trace: "on-first-retry",
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    // 開発サーバーが起動していることを前提とする
    // テスト実行前に `pnpm dev` を別ターミナルで起動する必要がある
    webServer: undefined,
});
