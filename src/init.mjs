// livemap init: 없는 파일만 템플릿으로 만들고 .gitignore 줄과 npm 스크립트를 넣는다. 다시 실행하면 아무것도 바꾸지 않는다.
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const INIT_FILES = [
  ['templates/config.json', 'map/config.json'],
  ['templates/journeys.json', 'map/semantic/journeys.json'],
  ['templates/README.md', 'map/README.md'],
  ['templates/captures-README.md', 'map/captures/README.md'],
];
export const IGNORE_LINE = 'map/.out/';
export const BUDGET_SCRIPT = 'playwright test --config node_modules/@pghoya2956/livemap/budget/playwright.config.mjs';
export const SCRIPTS = {
  map: 'livemap build',
  'map:check': 'livemap check',
  'map:serve': 'livemap serve',
  'map:export': 'livemap export map/.out/site',
  'test:report': 'livemap test-report',
};

const hasPlaywright = (root, pkg) => existsSync(join(root, 'node_modules/@playwright/test/package.json'))
  || Boolean(pkg?.devDependencies?.['@playwright/test'] || pkg?.dependencies?.['@playwright/test']);

export function init({ root, pkgRoot }) {
  const created = [];
  const kept = [];
  for (const [from, to] of INIT_FILES) {
    const dst = join(root, to);
    if (existsSync(dst)) continue;
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(pkgRoot, from), dst);
    created.push(to);
  }

  const ignore = join(root, '.gitignore');
  const ignoreText = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  if (!ignoreText.split(/\r?\n/).some((l) => l.trim() === IGNORE_LINE || l.trim() === `/${IGNORE_LINE}`)) {
    writeFileSync(ignore, `${ignoreText}${ignoreText && !ignoreText.endsWith('\n') ? '\n' : ''}${IGNORE_LINE}\n`);
    created.push(`.gitignore: ${IGNORE_LINE}`);
  }

  const pkgFile = join(root, 'package.json');
  const notes = [];
  if (!existsSync(pkgFile)) {
    notes.push('package.json 없음: npm init 뒤 다시 실행하면 npm 스크립트를 넣는다');
  } else {
    const raw = readFileSync(pkgFile, 'utf8');
    const pkg = JSON.parse(raw);
    const want = { ...SCRIPTS };
    if (hasPlaywright(root, pkg)) want['map:budget'] = BUDGET_SCRIPT;
    else notes.push('@playwright/test 없음: 화면 예산 검사를 쓰려면 npm i -D -E @playwright/test@1.63.0 뒤 다시 livemap init');
    const scripts = { ...(pkg.scripts || {}) };
    let changed = false;
    for (const [name, value] of Object.entries(want)) {
      if (!(name in scripts)) { scripts[name] = value; created.push(`npm 스크립트 ${name}`); changed = true; }
      else if (scripts[name] !== value) kept.push(`npm 스크립트 ${name}: 기존 값 유지("${scripts[name]}", 권장 "${value}")`);
    }
    if (changed) {
      pkg.scripts = scripts;
      const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
      writeFileSync(pkgFile, JSON.stringify(pkg, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
    }
  }

  for (const c of created) console.log(`+ ${c}`);
  for (const k of kept) console.log(`= ${k}`);
  for (const n of notes) console.log(`! ${n}`);
  if (!created.length) console.log('livemap init: 변경 없음');
  return 0;
}
