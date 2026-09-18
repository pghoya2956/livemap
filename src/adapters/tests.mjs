import { join } from 'node:path';
import { setReading } from '../lib/reading.mjs';
import { extractPathLiterals } from '../lib/literals.mjs';
// 검사 어댑터: tests/ 파일에서 test 노드를 만들고, 화면·API·DB 함수를 덮는(covers) 엣지를 잇는다.
// 화면은 두 길로 잇는다. 하나는 파일(로컬 import 닫힘 포함)의 경로 리터럴이고, 둘은 Playwright 단계 태그 `@<여정>/<단계>`다.
// 리터럴은 작은·큰따옴표와 백틱 템플릿을 같은 규칙으로 읽는다(`/r/${slug}` → `/r/:param`). 헬퍼가 돌려주는 템플릿도 닫힘에 들어와 잡힌다.
// 태그는 여정 파일의 그 단계가 가리키는 화면으로 푼다. 주소가 변수·환경 변수라 글자에 없는 검사는 이 길로만 이어진다.
const TAG = /tag\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|`[^`]*`)/g;
const TAG_ITEM = /['"`]@([^'"`,\s]+)['"`]/g;
// 이동 호출: page.goto(…)와, 닫힘 안에서 .goto(를 부르는 헬퍼(진입 헬퍼 등)의 호출
const DEF = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=/g;
// 이름 = 경로 값: 문자열·템플릿 하나, 문자열 배열, 경로를 돌려주는 화살표 함수
const CONST_PATH = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>\s*)?(['"`])(\/[^'"`\n]*)\2/g;
const CONST_LIST = /(?:export\s+)?const\s+(\w+)\s*=\s*\[([^\]]*)\]/g;

// 파일에서 이동 헬퍼 이름을 찾는다. 정의마다 본문 범위를 정해 그 안에서 .goto(를 부르면 이동으로 본다.
// 본문은 중괄호 블록이면 짝을 맞춰 자르고, 식 하나짜리 화살표 함수면 그 줄 끝까지다.
function bodyOf(text, from) {
  const open = text.indexOf('{', from);
  const nl = text.indexOf('\n', from);
  if (open < 0 || (nl >= 0 && nl < open && !/^[\s)=>]*$/.test(text.slice(from, nl)))) return text.slice(from, nl < 0 ? text.length : nl);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (depth === 0) return text.slice(open, i); }
  }
  return text.slice(open);
}

function navNames(text) {
  const names = new Set(['goto']);
  for (const m of text.matchAll(DEF)) {
    const name = m[1] || m[2];
    if (name && /\.goto\s*\(/.test(bodyOf(text, m.index + m[0].length))) names.add(name);
  }
  return names;
}

// 파일 안 상수 이름 → 경로 목록. 인자를 받아 경로를 돌려주는 헬퍼도 같은 표에 둔다.
function constPaths(text) {
  const map = new Map();
  for (const m of text.matchAll(CONST_PATH)) map.set(m[1], [m[3]]);
  for (const m of text.matchAll(CONST_LIST)) {
    const paths = [...m[2].matchAll(/(['"`])(\/[^'"`\n]*)\1/g)].map((x) => x[2]);
    if (paths.length) map.set(m[1], paths);
  }
  return map;
}

// 리터럴 경로가 화면 id에 맞나. 조각 수가 같고, 화면의 `:param` 자리는 아무 조각이나 받는다.
export function matchesScreen(litPath, screenId) {
  if (litPath === screenId) return true;
  const a = litPath.split('/'), b = screenId.split('/');
  if (a.length !== b.length) return false;
  return b.every((seg, i) => seg === a[i] || (seg.startsWith(':') && a[i] !== ''));
}

// 여정 파일에서 단계 id → 화면 목록. 1.x는 JSON 한 파일이다(2.0.0에서 md 디렉터리로 바뀐다).
function stepScreens(fs, cfg) {
  const map = new Map();
  if (!cfg.semantic || !fs.has(cfg.semantic)) return map;
  let sem;
  try { sem = JSON.parse(fs.read(cfg.semantic)); } catch { return map; }
  for (const j of sem.journeys || []) for (const s of j.steps || []) map.set(`${j.id}/${s.id}`, s.screens || []);
  return map;
}

export default function tests(g, fs, cfg) {
  const c = cfg.tests;
  const files = fs.walk(c.dir, (p) => /\.(test|spec)\.mjs$/.test(p));
  if (!files.length) return `검사 파일 없음: ${c.dir}`;
  const gate = new RegExp(c.gatePattern);
  const steps = stepScreens(fs, cfg);
  // 검사 파일이 helpers를 거쳐 API를 부르는 경우가 많아, 같은 폴더 안 로컬 import를 닫힘으로 합쳐 본다.
  const closure = (file, depth = 2, seen = new Set()) => {
    if (seen.has(file) || depth < 0) return seen;
    seen.add(file);
    for (const m of fs.read(file).matchAll(/from\s+'(\.[^']+)'/g)) {
      const t = join(file, '..', m[1]);
      if (t.startsWith(c.dir + '/') && fs.has(t)) closure(t, depth - 1, seen);
    }
    return seen;
  };
  for (const f of files) {
    const own = fs.read(f);
    const t = [...closure(f)].map(fs.read).join('\n');
    const count = (own.match(/^\s*(?:test|it)\(/gm) || []).length;
    // 제목이 ${ 를 가진 템플릿 문자열이면 반복문으로 여러 번 등록될 수 있어 줄 수가 실제 개수보다 작을 수 있다.
    const templated = own.split('\n').flatMap((line, i) => (/^\s*(?:test|it)\(\s*`[^`]*\$\{/.test(line) ? [i + 1] : []));
    const id = f;
    // 단계 태그: test(…, { tag: ['@여정/단계'] }) — 한 검사가 여러 단계를 지나면 여러 개다
    const tags = [];
    for (const m of own.matchAll(TAG)) for (const x of m[1].matchAll(TAG_ITEM)) if (!x[1].includes('${') && !tags.includes(x[1])) tags.push(x[1]);
    const node = g.add('test', id, f.replace(`${c.dir}/`, '').replace(/\.(test|spec)\.mjs$/, ''), { kind: f.endsWith('.spec.mjs') ? 'e2e' : 'unit', count, gated: gate.test(own), tags }, { file: f, line: 1, rule: 'tests:test(|it(' });
    if (/tag\s*:\s*\[[^\]]*\$\{/.test(own)) setReading(node, 'tags', 'partial', `태그가 템플릿 문자열인 검사(${f})는 단계를 글자로 알 수 없다`);
    if (templated.length) setReading(node, 'count', 'partial', `제목이 템플릿 문자열인 호출(${f}:${templated.join(',')})은 반복 등록이면 실제 개수가 더 많다`);
    // 화면: 이동 호출에 들어간 경로와 단계 태그가 가리키는 화면.
    // 글자 어디에나 있는 주소를 세면 "닿지 않아야 한다"는 음성 단언의 주소까지 덮은 것으로 잡힌다.
    // 이름 표는 닫힘 전체에서 모은다. 헬퍼 파일이 정의한 경로 상수·경로 헬퍼가 검사 파일의 이동 호출 인자로 들어온다
    const texts = [...closure(f)].map((x) => fs.read(x));
    const names = new Set(texts.flatMap((x) => [...navNames(x)]));
    const consts = new Map(texts.flatMap((x) => [...constPaths(x)]));
    const NAV = new RegExp(`\\b(${[...names].join('|')})\\s*\\(([\\s\\S]{0,300}?)\\)`, 'g');
    const lits = [];
    for (const text of texts) {
      for (const m of text.matchAll(NAV)) {
        const args = m[2];
        for (const l of extractPathLiterals(args)) if (!l.open) lits.push(l);
        for (const id of args.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) for (const p of consts.get(id[1]) || []) lits.push({ path: p });
      }
    }
    const tagged = new Set(tags.flatMap((tag) => steps.get(tag) || []));
    const unknown = steps.size ? tags.filter((tag) => !steps.has(tag)) : [];
    if (unknown.length) {
      g.issue('warn', '검사 태그', `${f}: 여정에 없는 단계 태그 ${unknown.join(', ')}`, {
        code: 'tests.tag-unknown', subject: { kind: 'test', id }, anchors: [{ file: f, line: 1 }], resolutions: ['source'],
      });
    }
    for (const s of g.of('screen')) {
      if (tagged.has(s.id) || lits.some((l) => matchesScreen(l.path, s.id))) g.link('test', id, 'covers', 'screen', s.id);
    }
    for (const a of g.of('api')) {
      const key = a.id.replace(':id', '');
      if (t.includes(`'${a.id}'`) || (a.id.includes(':id') && new RegExp(`'${key}[^']`).test(t))) g.link('test', id, 'covers', 'api', a.id);
    }
    // DB 함수 직접 호출(rpc('name') 또는 /rest/v1/rpc/name)
    for (const fn of g.of('function')) {
      if (new RegExp(`rpc\\(\\s*['\"\`]${fn.id}['\"\`]|/rpc/${fn.id}\\b`).test(t)) g.link('test', id, 'covers', 'function', fn.id);
    }
  }
  return null;
}
