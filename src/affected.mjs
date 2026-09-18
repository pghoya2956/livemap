// affected: 바뀐 파일 → 그 파일을 쓰는 화면 → 그 화면을 지나는 브라우저 검사(spec)를 고른다.
// 작업 중 피드백을 줄이는 용도이고 병합 전 전체 실행을 대신하지 않는다. node 검사는 고르지 않는다(화면과 이어지지 않는다).
// 화면 밖 코드(서버·DB·헬퍼·공용 라이브러리·설정)가 하나라도 바뀌면 무엇이 깨질지 좁힐 수 없어 전체 실행이다.
// 문서 경로(작업 문서·여정·로드맵·위키·캡처·판정)만 바뀐 변경은 브라우저 검사를 고르지 않는다.
import { buildGraph } from './cli.mjs';
import { docPaths } from './adapters/testreport.mjs';

const SPEC = /\.spec\.mjs$/;
const NODE_TEST = /\.test\.mjs$/;

// 바뀐 파일 목록(루트 기준). base가 있으면 그 커밋부터 HEAD까지, 없으면 작업트리와 HEAD의 차이(추적되지 않은 파일 포함)
export function changedFiles(fs, base) {
  const out = new Set();
  const add = (text) => { for (const line of String(text || '').split('\n')) { const p = line.trim(); if (p) out.add(p); } };
  if (base) add(fs.git('diff', '--name-only', base, 'HEAD'));
  else {
    add(fs.git('diff', '--name-only', 'HEAD'));
    add(fs.git('ls-files', '--others', '--exclude-standard'));
  }
  return [...out];
}

export async function affected({ root = process.cwd(), base = null } = {}) {
  const log = console.log;
  console.log = (...a) => console.error(...a); // 어댑터 진행 출력이 명령 줄에 섞이지 않게 한다
  let built;
  try { built = await buildGraph(root); } finally { console.log = log; }
  const { g, fs, cfg } = built;
  const docs = docPaths(cfg);
  const isDoc = (f) => docs.some((d) => f === d || f.startsWith(`${d}/`));
  const changed = changedFiles(fs, base);

  // 화면 → 그 화면을 지나는 spec
  const specsOf = new Map();
  for (const e of g.toJSON().edges) {
    if (e.kind !== 'covers' || !e.to.startsWith('screen:')) continue;
    const spec = e.from.replace(/^test:/, '');
    if (!SPEC.test(spec)) continue;
    const id = e.to.replace(/^screen:/, '');
    if (!specsOf.has(id)) specsOf.set(id, new Set());
    specsOf.get(id).add(spec);
  }
  // 파일 → 화면
  const screensOf = new Map();
  for (const s of g.of('screen')) for (const f of s.props.files || []) {
    if (!screensOf.has(f)) screensOf.set(f, new Set());
    screensOf.get(f).add(s.id);
  }

  const specs = new Set();
  const outside = [];
  for (const f of changed) {
    if (isDoc(f)) continue;
    if (SPEC.test(f)) { specs.add(f); continue; }
    // node 검사 파일은 브라우저 검사를 고르는 근거가 아니다(화면과 이어지지 않는다). 헬퍼는 아래 화면 밖으로 간다
    if (cfg.tests?.dir && f.startsWith(`${cfg.tests.dir}/`) && NODE_TEST.test(f) && !f.startsWith(`${cfg.tests.dir}/helpers/`)) continue;
    const screens = screensOf.get(f);
    if (screens) { for (const id of screens) for (const spec of specsOf.get(id) || []) specs.add(spec); continue; }
    outside.push(f);
  }

  const cmd = 'npx --no playwright test';
  if (outside.length) {
    return { all: true, specs: [], changed, reason: `화면 밖 파일 ${outside.length}: ${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ' 외' : ''}`, command: cmd };
  }
  const list = [...specs].sort();
  return { all: false, specs: list, changed, reason: list.length ? `바뀐 파일 ${changed.length}` : '바뀐 파일이 문서뿐', command: list.length ? `${cmd} ${list.join(' ')}` : null };
}

export function affectedText(r) {
  if (r.all) return [`전체 실행: ${r.reason}`, r.command];
  if (!r.specs.length) return [`고를 브라우저 검사 없음: ${r.reason}`];
  return [`브라우저 검사 ${r.specs.length}건 (${r.reason})`, r.command];
}
