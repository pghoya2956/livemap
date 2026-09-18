// 팩 내용 계약: 소비 프로젝트에 가는 파일과 저장소 개발 도구를 가른다.
// 문서가 "소비자가 쓸 수 있다"고 적은 것이 실제로 팩에 있는지, 개발 도구가 새어 들어가지 않는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const packed = () => JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT, encoding: 'utf8' }))[0].files.map((f) => f.path);

test('소비 프로젝트가 쓰는 것은 팩에 있다: 실행기·엔진·화면·예산·템플릿·문서', () => {
  const files = packed();
  const top = new Set(files.map((p) => p.split('/')[0]));
  for (const dir of ['bin', 'src', 'site', 'budget', 'templates', 'docs']) assert.ok(top.has(dir), `팩에 ${dir} 없음`);
  assert.ok(files.includes('budget/playwright.config.mjs'), '예산 검사 설정이 팩에 있어야 한다');
  assert.ok(files.includes('src/reporters/node-results.mjs'), '공개 리포터 경로가 팩에 있어야 한다');
});

test('저장소 개발 도구는 팩에 없다: scripts/(크롤러·스모크·유출 검사)', () => {
  const files = packed();
  assert.deepEqual(files.filter((p) => p.startsWith('scripts/')), [], 'scripts/는 엔진 저장소에서만 돈다');
});
