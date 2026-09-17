// 브라우저 없는 Playwright 검사(일부러 실패)
import { test, expect } from '@playwright/test';
test('일부러 틀린다', { tag: '@sample/fail' }, async () => { expect(1 + 1).toBe(3); });
