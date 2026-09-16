// 상황판 화면 예산 검사 설정. 프로젝트 루트(cwd)에서 부른다:
//   npx --no playwright test --config node_modules/@pghoya2956/livemap/budget/playwright.config.mjs
// 엔진 serve를 4181 포트(loopback)에 띄우고 개요를 잰다. LIVEMAP_BUDGET_STATIC=<export 폴더>면 serve --static을 잰다.
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bin = resolve(here, '..', 'bin', 'livemap.mjs');
const root = process.cwd();
const port = Number(process.env.MAP_PORT || 4181);
const staticDir = process.env.LIVEMAP_BUDGET_STATIC;
const target = staticDir ? ` --static ${JSON.stringify(resolve(root, staticDir))}` : '';

export default defineConfig({
  testDir: here,
  testMatch: /view-budget\.spec\.mjs/,
  outputDir: resolve(root, 'map/.out/budget-results'),
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}/map/`, viewport: { width: 1440, height: 900 } },
  webServer: { command: `node ${JSON.stringify(bin)} serve${target} --port ${port}`, url: `http://127.0.0.1:${port}/map/data/overview.json`, reuseExistingServer: false, timeout: 60_000, cwd: root },
});
