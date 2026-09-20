// livemap init: 없는 파일만 템플릿으로 만들고 .gitignore 줄과 npm 스크립트, 커밋 전 git 훅을 넣는다. 다시 실행하면 아무것도 바꾸지 않는다.
// 커밋 전 훅: .githooks/pre-commit(livemap check --staged)을 만들고 git config core.hooksPath .githooks를 둔다.
//   이미 다른 core.hooksPath, 훅 관리자(.husky·lefthook·pre-commit), .git/hooks의 pre-commit, 다른 내용의 .githooks/pre-commit이 있으면
//   덮지 않고 그 설정에 넣을 한 줄을 출력한다. git 저장소 루트가 아니면 설치하지 않는다.
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

export const INIT_FILES = [
  ['templates/config.json', 'map/config.json'],
  ['templates/journeys.json', 'map/semantic/journeys.json'],
  ['templates/README.md', 'map/README.md'],
  ['templates/captures-README.md', 'map/captures/README.md'],
  // 구조 지도(2.1.0): 시스템 그림·부품 표 틀과 부품 파일 틀. 초안을 채우는 일은 하네스 map 스킬의 에이전트 절차가 맡는다
  ['templates/architecture/README.md', 'map/architecture/README.md'],
  ['templates/architecture/web.md', 'map/architecture/web.md'],
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

export const HOOK_DIR = '.githooks';
export const HOOK_LINE = 'npx --no livemap check --staged';
export const HOOK_SCRIPT = `#!/bin/sh
# livemap: 스테이징된 작업 문서(tasks)·판정 파일(map/judgments)에 걸린 tasks.*·judgment.* 문제가 있으면 커밋을 멈춘다.
# 멈추면 출력의 문제 코드·판정 초안대로 원문을 고치거나 판정 파일을 적어 같은 커밋을 다시 시도한다(--no-verify로 넘기지 않는다).
${HOOK_LINE}
`;
const OTHER_MANAGERS = [['.husky', 'husky(.husky)'], ['lefthook.yml', 'lefthook(lefthook.yml)'], ['lefthook.yaml', 'lefthook(lefthook.yaml)'], ['.lefthook.yml', 'lefthook(.lefthook.yml)'], ['.pre-commit-config.yaml', 'pre-commit(.pre-commit-config.yaml)']];

const gitOut = (root, ...args) => { try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

// 커밋 전 훅 설치. created·notes에 줄을 더한다
function installHook(root, created, notes) {
  const top = gitOut(root, 'rev-parse', '--show-toplevel');
  if (top === null) { notes.push('git 저장소 아님: 커밋 전 훅을 설치하지 않음(git init 뒤 다시 livemap init)'); return; }
  const keep = (what) => notes.push(`커밋 전 훅: 기존 ${what}이 있어 덮지 않음. pre-commit 단계에 넣을 줄: ${HOOK_LINE}`);
  if (gitOut(root, 'rev-parse', '--show-prefix')) { keep('저장소 루트가 아닌 위치'); return; }
  const hook = join(root, HOOK_DIR, 'pre-commit');
  const hooksPath = gitOut(root, 'config', '--get', 'core.hooksPath') || '';
  const ours = existsSync(hook) && readFileSync(hook, 'utf8').split(/\r?\n/).some((l) => l.trim() === HOOK_LINE);
  if (hooksPath && hooksPath !== HOOK_DIR) { keep(`core.hooksPath(${hooksPath})`); return; }
  if (hooksPath === HOOK_DIR) {
    if (!existsSync(hook)) { writeHook(hook, created); return; }
    if (!ours) keep(`${HOOK_DIR}/pre-commit`);
    else if ((statSync(hook).mode & 0o111) !== 0o111) { chmodSync(hook, 0o755); created.push(`${HOOK_DIR}/pre-commit: 실행 권한`); }
    return;
  }
  const manager = OTHER_MANAGERS.find(([p]) => existsSync(join(root, p)));
  if (manager) { keep(manager[1]); return; }
  const gitHooks = gitOut(root, 'rev-parse', '--git-path', 'hooks');
  if (gitHooks && existsSync(join(resolve(root, gitHooks), 'pre-commit'))) { keep(`${gitHooks}/pre-commit`); return; }
  if (existsSync(hook) && !ours) { keep(`${HOOK_DIR}/pre-commit`); return; }
  if (!existsSync(hook)) writeHook(hook, created);
  gitOut(root, 'config', 'core.hooksPath', HOOK_DIR);
  created.push(`git config core.hooksPath ${HOOK_DIR}`);
}
function writeHook(hook, created) {
  mkdirSync(dirname(hook), { recursive: true });
  writeFileSync(hook, HOOK_SCRIPT);
  chmodSync(hook, 0o755);
  created.push(`${HOOK_DIR}/pre-commit`);
}

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

  installHook(root, created, notes);

  for (const c of created) console.log(`+ ${c}`);
  for (const k of kept) console.log(`= ${k}`);
  for (const n of notes) console.log(`! ${n}`);
  if (!created.length) console.log('livemap init: 변경 없음');
  return 0;
}
