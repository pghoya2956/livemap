// 명령 계층 검사: 실행 진입(심링크), engine 키, export, serve 배치, init, 어댑터 이름 가림.
// 픽스처(fixtures/mini)를 임시 폴더에 복사해 쓰고, 명령은 bin/livemap.mjs를 자식 프로세스로 부른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, locate } from '../src/serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const BIN = join(PKG, 'bin', 'livemap.mjs');
const MINI = join(HERE, 'fixtures', 'mini');

const made = [];
const tmp = (label) => { const d = mkdtempSync(join(tmpdir(), `livemap ${label} 검사-`)); made.push(d); return d; };
test.after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function project() {
  const dir = tmp('project');
  cpSync(MINI, dir, { recursive: true });
  return dir;
}
function run(cwd, args, bin = BIN) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('실행 진입: 심링크로 부른 bin이 check를 실행한다(exit 1, 라우트 없음: /nope)', () => {
  const dir = project();
  const link = join(tmp('bin'), 'livemap');
  symlinkSync(BIN, link);
  const r = run(dir, ['check'], link);
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.out, /라우트 없음: \/nope/);
});

test('--version은 package.json 버전', () => {
  const r = run(MINI, ['--version']);
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), readJson(join(PKG, 'package.json')).version);
});

test('알 수 없는 명령은 사용 안내와 exit 2', () => {
  const r = run(MINI, ['nope']);
  assert.equal(r.code, 2);
  assert.match(r.err, /export <dir>/);
});

test('engine 키: 없으면 1로 보고 major가 다르면 exit 2와 이행 문서 경로', () => {
  const dir = project();
  const cfgFile = join(dir, 'map/config.json');
  const cfg = readJson(cfgFile);
  // 키가 없으면 1로 본다. 엔진 major가 2라 멈춘다
  delete cfg.engine;
  writeJson(cfgFile, cfg);
  const missing = run(dir, ['check']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /node_modules\/@pghoya2956\/livemap\/docs\/migrate\.md/);
  // 같은 major면 돈다
  writeJson(cfgFile, { ...cfg, engine: 2 });
  assert.equal(run(dir, ['build']).code, 0);
});

test('export: 생성물이 없으면 exit 2', () => {
  const dir = project();
  const r = run(dir, ['export', join(dir, 'out-site')]);
  assert.equal(r.code, 2);
  assert.match(r.err, /먼저 livemap build/);
  assert.equal(existsSync(join(dir, 'out-site')), false);
});

test('export: 배치 표의 파일이 생기고, 이전 export의 옛 파일은 사라진다', () => {
  const dir = project();
  mkdirSync(join(dir, 'map/captures'), { recursive: true });
  writeFileSync(join(dir, 'map/captures/live.jpg'), 'jpg');
  assert.equal(run(dir, ['build']).code, 0);
  const target = join(dir, 'map/.out/site');
  assert.equal(run(dir, ['export', 'map/.out/site']).code, 0);
  for (const f of ['index.html', 'map.css', 'map.js', 'fonts/PretendardVariable.woff2', 'fonts/LICENSE.txt', 'captures/live.jpg', 'data/data.json', 'data/overview.json', 'data/graph.json', '.livemap-export']) {
    assert.ok(existsSync(join(target, f)), `없음: ${f}`);
  }
  writeFileSync(join(target, 'captures/stale.jpg'), 'old');
  assert.equal(run(dir, ['export', 'map/.out/site']).code, 0);
  assert.equal(existsSync(join(target, 'captures/stale.jpg')), false);
  // 대상이 --out 안이어도 자기 자신을 복사하지 않는다
  assert.equal(existsSync(join(target, 'site')), false);
  assert.deepEqual(readdirSync(join(target, 'data')).sort(), ['data.json', 'graph.json', 'overview.json']);
});

test('export: 비어 있지 않은 다른 폴더는 지우지 않고 exit 2', () => {
  const dir = project();
  assert.equal(run(dir, ['build']).code, 0);
  const r = run(dir, ['export', 'map']);
  assert.equal(r.code, 2);
  assert.ok(existsSync(join(dir, 'map/config.json')));
  assert.equal(run(dir, ['export', 'map/.out']).code, 2);
  assert.ok(existsSync(join(dir, 'map/.out/data.json')));
});

test('locate: 주소 배치와 경로 탈출 거부', () => {
  assert.deepEqual(locate('/map/'), { kind: 'site', rel: 'index.html' });
  assert.deepEqual(locate('/map/fonts/PretendardVariable.woff2'), { kind: 'site', rel: 'fonts/PretendardVariable.woff2' });
  assert.deepEqual(locate('/map/captures/a.jpg'), { kind: 'captures', rel: 'a.jpg' });
  assert.deepEqual(locate('/map/data/overview.json'), { kind: 'data', rel: 'overview.json' });
  for (const bad of ['/map/../package.json', '/map/%2e%2e/package.json', '/map/..%2fpackage.json', '/map/.livemap-export', '/map/data/../x', '/other']) {
    assert.equal(locate(bad), null, bad);
  }
});

async function fetchAll(server, paths) {
  await new Promise((ok) => server.listening ? ok() : server.once('listening', ok));
  const { port } = server.address();
  const out = {};
  for (const p of paths) {
    const res = await fetch(`http://127.0.0.1:${port}${p}`);
    out[p] = { status: res.status, cache: res.headers.get('cache-control'), csp: res.headers.get('content-security-policy'), body: Buffer.from(await res.arrayBuffer()) };
  }
  return out;
}

test('serve 배치: 화면·서체·캡처·생성물 200, data만 no-store, 경로 탈출 거부, --static이 같은 응답', async () => {
  const dir = project();
  mkdirSync(join(dir, 'map/captures'), { recursive: true });
  writeFileSync(join(dir, 'map/captures/live.jpg'), 'jpg');
  assert.equal(run(dir, ['build']).code, 0);
  assert.equal(run(dir, ['export', 'map/.out/site']).code, 0);
  const paths = ['/map/', '/map/map.css', '/map/fonts/PretendardVariable.woff2', '/map/captures/live.jpg', '/map/data/overview.json'];
  const log = console.log; console.log = () => {};
  const out = join(dir, 'map/.out');
  const dyn = serve({ root: dir, out, port: 0, captures: join(dir, 'map/captures'), build: async () => {} });
  const stat = serve({ port: 0, static: join(out, 'site') });
  try {
    const a = await fetchAll(dyn, [...paths, '/map/../package.json', '/map/%2e%2e/map/config.json']);
    const b = await fetchAll(stat, paths);
    for (const p of paths) {
      assert.equal(a[p].status, 200, `serve ${p}`);
      assert.equal(b[p].status, 200, `static ${p}`);
      assert.equal(a[p].cache, p.startsWith('/map/data/') ? 'no-store' : 'no-cache');
      assert.equal(b[p].cache, a[p].cache);
      assert.ok(a[p].csp.includes("default-src 'self'"));
      assert.ok(a[p].body.equals(b[p].body), `같은 응답: ${p}`);
    }
    assert.notEqual(a['/map/../package.json'].status, 200);
    assert.notEqual(a['/map/%2e%2e/map/config.json'].status, 200);
  } finally {
    console.log = log;
    dyn.close(); stat.close();
  }
});

test('도움말: 하위 명령에 붙인 --help·-h 도 도움말이고 명령을 실행하지 않는다', () => {
  // init 은 파일을 쓰므로 도움말 요청에 실행되면 사용자가 예상 못 한 변경이 생긴다
  for (const args of [['init', '--help'], ['init', '-h'], ['build', '--help'], ['check', '--help']]) {
    const dir = tmp('help');
    const r = run(dir, args);
    assert.equal(r.code, 0, `${args.join(' ')} 종료 코드`);
    assert.match(r.out, /usage: livemap <command>/, `${args.join(' ')} 도움말 출력`);
    assert.deepEqual(readdirSync(dir), [], `${args.join(' ')} 뒤 폴더가 비어 있어야 한다`);
  }
});

test('도움말: 최상위 --help·-h·help 는 그대로 동작한다', () => {
  for (const args of [['--help'], ['-h'], ['help']]) {
    const dir = tmp('help-top');
    const r = run(dir, args);
    assert.equal(r.code, 0);
    assert.match(r.out, /usage: livemap <command>/);
    assert.deepEqual(readdirSync(dir), []);
  }
});

test('init: 빈 폴더에 파일 4개·.gitignore·npm 스크립트, 다시 실행하면 무변경', () => {
  const dir = tmp('init');
  writeJson(join(dir, 'package.json'), { name: 'sample', version: '1.0.0', scripts: {} });
  const r1 = run(dir, ['init']);
  assert.equal(r1.code, 0);
  for (const f of ['map/config.json', 'map/semantic/journeys.json', 'map/README.md', 'map/captures/README.md']) assert.ok(existsSync(join(dir, f)), f);
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^map\/\.out\/$/m);
  const scripts = readJson(join(dir, 'package.json')).scripts;
  assert.equal(scripts.map, 'livemap build');
  assert.equal(scripts['map:export'], 'livemap export map/.out/site');
  assert.equal(scripts['map:budget'], undefined);
  assert.match(r1.out, /@playwright\/test 없음/);
  const snapshot = () => ['.gitignore', 'package.json', 'map/config.json'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n---\n');
  const before = snapshot();
  const r2 = run(dir, ['init']);
  assert.equal(r2.code, 0);
  assert.match(r2.out, /변경 없음/);
  assert.equal(snapshot(), before);
});

test('init: 값이 다른 기존 스크립트는 보존하고 보고, Playwright가 있으면 map:budget', () => {
  const dir = tmp('init-keep');
  writeJson(join(dir, 'package.json'), { name: 'sample', version: '1.0.0', scripts: { map: 'node map/cli.mjs build' }, devDependencies: { '@playwright/test': '1.63.0' } });
  const r = run(dir, ['init']);
  assert.equal(r.code, 0);
  const scripts = readJson(join(dir, 'package.json')).scripts;
  assert.equal(scripts.map, 'node map/cli.mjs build');
  assert.match(r.out, /npm 스크립트 map: 기존 값 유지/);
  assert.match(scripts['map:budget'], /budget\/playwright\.config\.mjs/);
});

test('이름 가림: 프로젝트 map/adapters/router.mjs가 있으면 알림 한 줄', () => {
  const dir = project();
  mkdirSync(join(dir, 'map/adapters'), { recursive: true });
  writeFileSync(join(dir, 'map/adapters/router.mjs'), 'export default function router() { return null; }\n');
  const r = run(dir, ['build']);
  assert.equal(r.code, 0);
  assert.equal(r.out.split('\n').filter((l) => l === '프로젝트 어댑터가 참조 어댑터를 가림: router').length, 1);
  rmSync(join(dir, 'map/adapters'), { recursive: true });
  assert.doesNotMatch(run(dir, ['build']).out, /가림/);
});
