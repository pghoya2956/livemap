// 다리 단계(2.1.0, 스펙 「livemap 다리」 DEC-34·DEC-40·DEC-42·DEC-47): Graphify 그래프에는 화면 쪽과 서버 쪽 사이 엣지가 0건이다(AST 는 HTTP 경계를 못 넘는다).
// 연결 단계(src/link.mjs)가 화면 → API calls 를 만든 뒤 이 단계가 돈다. adapters[] 에 들지 않고 graphify 어댑터가 돌지 않은 프로젝트에서는 아무것도 하지 않는다.
//   새로 만드는 다리: 화면 → 화면 파일 renders(props.file), API → 서버 파일 defined_in(src.file), API → 로그인 노드 invokes(props.calls 의 auth: 접두). 엣지 props.bridge 가 참
//   옮겨 붙는 사슬: API → DB 함수 invokes, DB 함수 → 테이블 touches. 끝점인 function·table 노드가 graphify 어댑터의 SQL 라벨 합치기로 합친 노드(props.graphifyIds)가 됐으므로
//     엣지 자체는 그대로 두고 끝점이 합친 노드인 엣지를 센다. 화면 → API calls 는 다시 만들지 않고 세기만 한다
//   매칭률은 엣지 기준과 객체 기준을 나눠 남긴다(DEC-40). 방금 만든 로그인 노드는 세지 않는다
//   못 맞춘 짝은 두 방향: livemap 만 아는 테이블(touches 대상인데 graphifyIds 없음) architecture.bridge-unmatched, 어떤 DB 함수도 닿지 않는 Graphify 테이블 architecture.table-unreached
//   그래프 파일이 없으면(architecture.graphMissing) 새 다리 없이 기존 사슬만 세고 경고를 내지 않는다
// 통계는 g.architecture.bridges 에 남긴다(파생이 data.json architecture.bridges 에 싣는다).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 로그인 노드 종류 auth(AUTH_KIND_DECISION=A). 스펙 데이터 모델의 새 종류 넷에 없던 다섯째 종류다. function 에 실으면 summary.dbFunctions·functions[] 의 2.0.2 값이 바뀌고,
// symbol 은 파일 안 이름이라 뜻이 다르다. id 는 API props.calls 의 auth:<제공자> 그대로
export const AUTH_KIND = 'auth';

// 이름 규칙 (^|\.)이름\(\)$: livemap 함수 이름(스키마 없음)을 스키마 접두를 가진 SQL 함수 라벨에 맞춘다. 접미 일치(xlist_resorts)는 걸러진다
export function matchFunctionLabel(name, labels) {
  const re = new RegExp(`(^|\\.)${esc(name)}\\(\\)$`);
  return labels.filter((l) => re.test(l));
}

export function bridgeArchitecture(g, fs, cfg) {
  const arch = g.architecture;
  if (!arch) return null;
  const loaded = !!arch.graphify;
  const mark = { bridge: true };
  const byKind = { renders: 0, defined_in: 0, auth: 0, calls: 0, invokes: 0, touches: 0 };
  const misses = { renders: [], defined_in: [] };
  const authNodes = new Set();
  const linkNew = (...args) => { const n = g.edges.length; g.link(...args, mark); return g.edges.length > n; };

  if (loaded) {
    const modules = new Set(g.of('module').filter((m) => !m.props.external).map((m) => m.id));
    for (const s of g.of('screen')) {
      const f = s.props.file;
      if (!f) continue;
      if (modules.has(f)) { if (linkNew('screen', s.id, 'renders', 'module', f)) byKind.renders += 1; } else misses.renders.push(s.id);
    }
    for (const a of g.of('api')) {
      const f = a.src?.file;
      if (!f) continue;
      if (modules.has(f)) { if (linkNew('api', a.id, 'defined_in', 'module', f)) byKind.defined_in += 1; } else misses.defined_in.push(a.id);
    }
    for (const a of g.of('api')) for (const c of a.props.calls || []) {
      if (typeof c !== 'string' || !c.startsWith('auth:')) continue;
      g.add(AUTH_KIND, c, c, { external: true, auth: true, provider: c.slice('auth:'.length) }, null);
      authNodes.add(c);
      if (linkNew('api', a.id, 'invokes', AUTH_KIND, c)) byKind.auth += 1;
    }
  }

  // 기존 사슬: 연결 단계의 화면 → API, bff 의 API → DB 함수, migrations 의 DB 함수 → 테이블
  const calls = g.edges.filter((e) => e.kind === 'calls' && e.from.startsWith('screen:') && e.to.startsWith('api:'));
  const invokes = g.edges.filter((e) => e.kind === 'invokes' && e.from.startsWith('api:') && e.to.startsWith('function:'));
  const touches = g.edges.filter((e) => e.kind === 'touches' && e.from.startsWith('function:') && e.to.startsWith('table:'));
  byKind.calls = calls.length; byKind.invokes = invokes.length; byKind.touches = touches.length;
  let matched = null, unmatched = null;
  if (loaded) {
    const merged = (key) => (g.nodes.get(key)?.props.graphifyIds?.length ?? 0) > 0;
    const invokedFns = new Set(invokes.map((e) => e.to)), touched = new Set(touches.map((e) => e.to));
    matched = {
      fnEdges: [invokes.filter((e) => merged(e.to)).length, invokes.length],
      fnObjects: [[...invokedFns].filter(merged).length, invokedFns.size],
      tableEdges: [touches.filter((e) => merged(e.to)).length, touches.length],
      tableObjects: [[...touched].filter(merged).length, touched.size],
    };
    const anchors = (t) => (t.src?.file ? [{ file: t.src.file, line: Number.isInteger(t.src.line) && t.src.line >= 1 ? t.src.line : null }] : []);
    const livemapOnly = [...touched].filter((k) => !merged(k)).sort(cmp);
    for (const k of livemapOnly) {
      const t = g.nodes.get(k);
      const n = touches.filter((e) => e.to === k).length;
      g.issue('warn', '구조 다리', `테이블 ${t.id}: Graphify 정의 자리 없음, livemap 만 아는 테이블(touches ${n})`, { code: 'architecture.bridge-unmatched', subject: { kind: 'table', id: t.id }, anchors: anchors(t) });
    }
    const unreached = g.of('table').filter((t) => (t.props.graphifyIds?.length ?? 0) > 0 && !touched.has(`table:${t.id}`)).sort((a, b) => cmp(a.id, b.id));
    for (const t of unreached) g.issue('warn', '구조 다리', `테이블 ${t.id}: 어떤 DB 함수도 닿지 않음(Graphify 정의 자리 ${t.props.graphifyIds.length})`, { code: 'architecture.table-unreached', subject: { kind: 'table', id: t.id }, anchors: anchors(t) });
    unmatched = { livemapOnly: livemapOnly.length, unreached: unreached.length };
  }
  const stats = { made: byKind.renders + byKind.defined_in + byKind.auth, moved: calls.length + invokes.length + touches.length, byKind, matched, unmatched, misses, authNodes: authNodes.size };
  arch.bridges = stats;
  return stats;
}
