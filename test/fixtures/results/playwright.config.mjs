// 결과 계약 픽스처의 Playwright 설정: 브라우저 없이 tests/*.spec.mjs만 돌리고 산출물은 무시되는 map/.out 아래에 둔다
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: 'tests', testMatch: '*.spec.mjs', outputDir: 'map/.out/playwright-artifacts', workers: 1 });
