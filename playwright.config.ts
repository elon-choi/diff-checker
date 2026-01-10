import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright UI 스냅샷 테스트 설정
 * UI 변경 시 자동으로 스냅샷을 비교하여 회귀를 감지합니다.
 */
export default defineConfig({
  testDir: './tests/ui-snapshots',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Next.js 앱 개발 서버 실행
  webServer: {
    command: 'pnpm dev:next',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
