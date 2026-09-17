// 브라우저 없는 Playwright 검사(통과)
import { test, expect } from '@playwright/test';
test('합계가 맞다', { tag: '@sample/pass' }, async () => { expect(1 + 1).toBe(2); });
