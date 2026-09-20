// architecture 단계(2.1.0, 스펙 PN-16, DEC-15·DEC-16·DEC-45): 다리 단계 뒤에 돌아 선언(map/architecture/)과 사실(그래프)을 대조한다.
//   부품 소속: 선언한 폴더로 module 을 부품에 배정한다. 겹치면 가장 깊은 선언이 이기고 같은 깊이는 architecture.duplicate-id 오류. 어느 부품에도 없으면 architecture.module-unassigned
//   층 배정: 부품 안 층 폴더로. 부품 폴더 안이지만 층 밖이면 층 없음(경고 아님). 노드 0 인 층은 architecture.lane-empty
//   층 위반: imports 엣지(Graphify imports·imports_from·re_exports)로만 판정하고 typeOnly 는 뺀다(DEC-15). deferred(동적 import)는 위반으로 세되 문구에
//     '[동적 import]' 를 표시한다(OQ10_DECISION=C. 지연 import 도 런타임 의존이다). cfg.architecture.deferred 를 'ignore' 로 두면 타입 전용처럼 뺀다
//   물려받기: 커뮤니티 없는 화면은 renders 대상 파일, API 는 defined_in 대상 파일의 묶음을 받는다(invokes 를 먼저 쓰지 않는다). 로그인·livemap 만 아는 테이블·바깥 상대는 묶음 없음
//   바깥 상대: `- 스키마:` 를 선언한 부품이 그 스키마의 바깥 상대 SQL 노드를 담는다. 선언 없는 스키마는 architecture.external-undeclared
//   흐름: 단계(여정/장면)와 좌표를 풀어 nodes·counts 를 만든다. 좌표가 없으면 architecture.flow-step-missing 오류, 이어진 좌표 사이에 엣지가 없거나 추정뿐이면 architecture.flow-broken
//   depends: 그림의 선(declared)과 실측 엣지(measured)의 합집합을 container → container 엣지로 둔다
// 결과는 g.architecture.stage 에 남기고 파생(src/derive.mjs)이 data.json architecture 절로 싣는다. 설정 architecture.dir 이 없거나 폴더가 없으면 partial 이다.
import { readArchitectureDir } from './lib/architecture-md.mjs';
import { ISSUE_CODES } from './lib/issues.mjs';

const CHAIN_KINDS = new Set(['imports', 'calls', 'invokes', 'touches']); // 층 사이 선을 세는 엣지
const COMMUNITY_KINDS = new Set(['imports', 'calls', 'invokes', 'touches', 'reads', 'renders', 'defined_in', 'inherits']);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const inDir = (path, d) => { const dir = d.replace(/\/+$/, ''); return path === dir || path.startsWith(dir + '/'); };
const key = (n) => `${n.kind}:${n.id}`;
const empty = (status, error) => ({ status, error, declaration: null, containers: [], lanes: [], laneLinks: [], communities: [], communityLinks: [], modules: [], flows: [], violations: [], inherited: 0, deferredPolicy: null });

// 가장 깊은(긴) 폴더 선언이 이긴다. 같은 깊이에 소유자가 둘이면 conflict
function pick(path, owners) {
  let best = null, depth = -1, conflict = [];
  for (const o of owners) for (const d of o.dirs || []) {
    if (!inDir(path, d)) continue;
    const len = d.replace(/\/+$/, '').length;
    if (len > depth) { best = o; depth = len; conflict = [o.id]; }
    else if (len === depth && !conflict.includes(o.id)) conflict.push(o.id);
  }
  return best ? { owner: best, conflict: conflict.length > 1 ? conflict : null } : null;
}

export function architectureStage(g, fs, cfg, sem = { journeys: [] }) {
  const dir = cfg?.architecture?.dir;
  // graphify 어댑터가 돌지 않았고 선언 폴더 설정도 없는 프로젝트는 구조 지도가 꺼진 것이다: g.architecture 를 만들지 않아 data.json 절·산출물이 없다(2.0.2 그대로)
  if (!dir && !g.architecture) return empty('partial', '설정 architecture.dir 없음: 선언 폴더(map/architecture)를 두면 구조를 대조한다');
  g.architecture ??= { graphify: null, graphMissing: null };
  const done = (r) => { g.architecture.stage = r; return r; };
  if (!dir) return done(empty('partial', '설정 architecture.dir 없음: 선언 폴더(map/architecture)를 두면 구조를 대조한다'));
  const readme = `${dir}/README.md`;
  if (!fs.has(readme)) return done(empty('partial', `선언 폴더 없음: ${dir} (README.md 가 없다)`));
  const decl = readArchitectureDir(fs, dir);
  const issue = (code, label, message, subject, anchors = []) => g.issue(ISSUE_CODES[code]?.level ?? 'warn', label, message, { code, subject, anchors });
  const at = (file, line = null) => (file ? [{ file, line: Number.isInteger(line) && line >= 1 ? line : null }] : []);
  for (const p of decl.problems) issue(p.code, '구조 선언', p.message, p.subject ? { kind: 'container', id: p.subject } : { kind: 'config', id: 'architecture.dir' }, at(p.file, p.line));

  // 1. 부품 노드와 그림에만 있는 부품, 폴더 존재
  const containers = decl.containers.map((c) => ({ id: c.id, name: c.name, kind: c.kind, boundary: c.boundary, dirs: c.dirs, schemas: c.schemas, file: c.file, line: c.line, prose: c.prose, lanes: c.lanes, flowDecls: c.flows, counts: { screens: 0, files: 0, symbols: 0, mocks: 0 }, deps: [], flows: 0, externals: [] }));
  const byId = new Map(containers.map((c) => [c.id, c]));
  for (const c of containers) g.add('container', c.id, c.name, { kind: c.kind, boundary: c.boundary, dirs: c.dirs, schemas: c.schemas, file: c.file }, { file: c.file ?? readme, line: c.file ? 1 : c.line ?? null, rule: c.file ? 'architecture:부품 파일' : 'architecture:부품 표' });
  for (const n of decl.diagram?.nodes ?? []) if (!byId.has(n.id)) issue('architecture.container-undeclared', '구조 선언', `그림에 있는 부품 ${n.id}(${n.label})이 부품 표에 없음`, { kind: 'container', id: n.id }, at(readme));
  for (const c of containers) {
    if (c.kind !== 'ours') continue;
    const missing = c.dirs.filter((d) => !fs.has(d));
    if (!c.dirs.length) issue('architecture.container-unanchored', '구조 선언', `부품 ${c.id}: 폴더 선언(- 폴더:)이 없음`, { kind: 'container', id: c.id }, at(c.file ?? readme, c.file ? null : c.line));
    else if (missing.length) issue('architecture.container-unanchored', '구조 선언', `부품 ${c.id}: 저장소에 없는 폴더 ${missing.join(', ')}`, { kind: 'container', id: c.id }, at(c.file ?? readme));
  }

  // 2. 파일 → 부품 → 층 배정
  const ours = containers.filter((c) => c.kind === 'ours');
  const modules = g.of('module').filter((m) => !m.props.external).sort((a, b) => cmp(a.id, b.id));
  const info = new Map();
  const conflicts = new Set();
  const conflictIssue = (what, path, ids, subj) => { const k = `${what}|${ids.join('|')}`; if (conflicts.has(k)) return; conflicts.add(k); issue('architecture.duplicate-id', '구조 선언', `${what} 폴더 겹침: ${path} 가 ${ids.join('·')} 에 같은 깊이로 든다`, subj, at(readme)); };
  for (const m of modules) {
    const p = pick(m.id, ours);
    let container = null, lane = null;
    if (p) {
      if (p.conflict) conflictIssue('부품', m.id, p.conflict, { kind: 'container', id: p.conflict[0] });
      container = p.owner;
      const l = pick(m.id, container.lanes);
      if (l) { if (l.conflict) conflictIssue('층', m.id, l.conflict, { kind: 'container', id: container.id }); lane = l.owner; }
      g.link('container', container.id, 'contains', 'module', m.id);
    } else issue('architecture.module-unassigned', '구조 선언', `파일 ${m.id} 이 어느 부품 폴더에도 들지 않음`, { kind: 'module', id: m.id }, at(m.id));
    const symbols = g.out('module', m.id, 'contains').filter((n) => n.kind === 'symbol').length;
    info.set(m.id, { id: m.id, container: container?.id ?? null, lane: lane?.id ?? null, symbols, community: m.props.community ?? null, communityName: m.props.communityName ?? null, deps: [], violations: [] });
    if (container) { container.counts.files += 1; container.counts.symbols += symbols; }
  }
  const laneCount = new Map();
  for (const i of info.values()) if (i.lane) laneCount.set(`${i.container}/${i.lane}`, (laneCount.get(`${i.container}/${i.lane}`) || 0) + 1);
  const graphMissing = !!g.architecture.graphMissing;
  if (!graphMissing) for (const c of ours) for (const l of c.lanes) if (!laneCount.get(`${c.id}/${l.id}`)) issue('architecture.lane-empty', '구조 선언', `층 ${l.id}(${l.name}): 폴더 ${l.dirs.join(', ') || '없음'} 에 든 파일이 0건`, { kind: 'config', id: `architecture.lane.${l.id}` }, at(c.file, l.line));

  // 3. 바깥 상대: 스키마 단위로 묶는다
  const extSql = g.of('symbol').filter((s) => s.props.external && s.props.sql).sort((a, b) => cmp(a.id, b.id));
  const schemas = [...new Set(extSql.map((s) => s.props.schema).filter(Boolean))].sort(cmp);
  for (const schema of schemas) {
    const owner = containers.find((c) => c.kind === 'external' && c.schemas.includes(schema));
    const nodes = extSql.filter((s) => s.props.schema === schema);
    if (!owner) { issue('architecture.external-undeclared', '구조 선언', `바깥 상대 스키마 ${schema}(객체 ${nodes.length}: ${nodes.map((n) => n.id).slice(0, 3).join(', ')})를 선언한 부품이 없음. README.md 부품 표에 바깥 상대를 더하고 그 파일에 '- 스키마: ${schema}' 를 적으면 여기 선다`, { kind: 'config', id: `architecture.external.${schema}` }, at(readme)); continue; }
    for (const n of nodes) { owner.externals.push(key(n)); g.link('container', owner.id, 'contains', 'symbol', n.id); }
  }

  // 4. 화면·API·함수·테이블의 부품과 물려받기
  const containerOfModule = (id) => info.get(id)?.container ?? null;
  const nodeContainer = new Map(); // key → 부품 id
  let inherited = 0;
  const inherit = (node, targets) => {
    const t = targets.find((x) => x.props.community != null);
    if (t && node.props.community == null) { node.props.community = t.props.community; node.props.communityName = t.props.communityName; node.props.communityInherited = true; inherited += 1; }
  };
  const screens = g.of('screen'), apis = g.of('api'), fns = g.of('function'), tables = g.of('table'), auths = g.of('auth');
  for (const s of screens) { const files = g.out('screen', s.id, 'renders'); inherit(s, files); const c = files.map((f) => containerOfModule(f.id)).find(Boolean) ?? null; if (c) { nodeContainer.set(key(s), c); const cc = byId.get(c); cc.counts.screens += 1; if (s.props.source === 'mock' || s.props.source === 'mixed') cc.counts.mocks += 1; } }
  for (const a of apis) { const files = g.out('api', a.id, 'defined_in'); inherit(a, files); const c = files.map((f) => containerOfModule(f.id)).find(Boolean) ?? null; if (c) nodeContainer.set(key(a), c); }
  for (const n of [...fns, ...tables]) { const p = n.src?.file ? pick(n.src.file, ours) : null; if (p) nodeContainer.set(key(n), p.owner.id); }
  for (const c of containers) for (const e of c.externals) nodeContainer.set(e, c.id);
  for (const m of modules) if (info.get(m.id).container) nodeContainer.set(key(m), info.get(m.id).container);

  // 5. 층 목록과 층 id 풀이. nodes 는 그 층의 노드 수(2.1.0 그대로), members 는 그 층에 선 노드 목록 { id, kind, label, community, part }(P3-14a, LANE_NODES_FIELD=members.
  //    파일 경로 같은 큰 값은 넣지 않는다). 같은 필드의 타입을 숫자에서 배열로 바꾸면 스펙 예시·검사·읽는 쪽이 조용히 깨져 새 이름을 쓴다
  const lanes = [];
  const item = (n) => ({ id: n.id, kind: n.kind, label: n.label, community: n.props.community ?? null, part: nodeContainer.get(key(n)) ?? null });
  const modulesOfLane = (cid, lid) => modules.filter((m) => { const i = info.get(m.id); return i.container === cid && (lid === null ? true : i.lane === lid); }).map(item);
  const pushLane = (l, list) => lanes.push({ ...l, nodes: list.length, members: list });
  const kindLane = { screen: 'screen', api: 'api', function: 'function', table: 'table', auth: 'auth' };
  const laneOf = (k) => {
    const n = g.nodes.get(k);
    if (!n) return null;
    if (n.kind === 'module') { const i = info.get(n.id); if (!i || !i.container) return null; return i.lane ?? (byId.get(i.container).lanes.length ? null : i.container); }
    return kindLane[n.kind] ?? null;
  };
  for (const c of ours) {
    if (c.lanes.length) for (const l of c.lanes) pushLane({ id: l.id, name: l.name, container: c.id, kind: 'code', visible: true, allow: l.allow ?? null }, modulesOfLane(c.id, l.id));
    else pushLane({ id: c.id, name: c.name, container: c.id, kind: 'code', visible: true }, modulesOfLane(c.id, null));
    const has = (nodes) => nodes.filter((n) => nodeContainer.get(key(n)) === c.id).sort((a, b) => cmp(a.id, b.id)).map(item);
    for (const [kind, list] of [['screen', screens], ['api', apis], ['function', fns], ['table', tables]]) { const xs = has(list); if (xs.length) pushLane({ id: kind, name: kind, container: c.id, kind, visible: true }, xs); }
  }
  if (auths.length) pushLane({ id: 'auth', name: 'auth', container: null, kind: 'auth', visible: true }, auths.slice().sort((a, b) => cmp(a.id, b.id)).map(item));

  // 6. 층 위반·파일 의존·층 사이 선·부품 사이 실측
  const deferredPolicy = cfg.architecture?.deferred ?? 'count'; // OQ10_DECISION=C: 기본은 세되 표시
  const violations = [];
  const laneLinkCount = new Map(), measured = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const e of g.edges) {
    if (!CHAIN_KINDS.has(e.kind)) continue;
    if (e.kind === 'imports') {
      const from = info.get(e.from.slice('module:'.length)), to = g.nodes.get(e.to);
      if (!from || !to || to.props.external) continue;
      from.deps.push(to.id);
      const toI = info.get(to.id);
      if (toI && from.container && from.container === toI.container && from.lane && toI.lane && from.lane !== toI.lane) {
        const rule = byId.get(from.container).lanes.find((l) => l.id === from.lane);
        const skip = e.props?.typeOnly === true || (e.props?.deferred === true && deferredPolicy === 'ignore');
        if (rule?.allow && !rule.allow.includes(toI.lane) && !skip) {
          violations.push({ code: 'architecture.layer-violation', from: from.id, to: to.id, fromLane: from.lane, toLane: toI.lane, at: { file: from.id, line: null }, ...(e.props?.deferred ? { deferred: true } : {}) });
          from.violations.push(to.id);
          issue('architecture.layer-violation', '구조 규칙', `architecture.layer-violation: ${from.id} → ${to.id}: 층 ${from.lane} 는 ${toI.lane} 를 가져올 수 없다(허용: ${rule.allow.join(', ') || '없음'})${e.props?.deferred ? ' [동적 import]' : ''}`, { kind: 'module', id: from.id }, at(from.id));
        }
      }
    }
    const fl = laneOf(e.from), tl = laneOf(e.to);
    if (fl && tl && fl !== tl) bump(laneLinkCount, `${fl}\u0000${tl}`);
    const fc = nodeContainer.get(e.from), tc = nodeContainer.get(e.to);
    if (fc && tc && fc !== tc) bump(measured, `${fc}\u0000${tc}`);
  }
  for (const e of g.edges) if (e.kind === 'reads') { const fc = nodeContainer.get(e.from), tc = nodeContainer.get(e.to); if (fc && tc && fc !== tc) bump(measured, `${fc}\u0000${tc}`); }
  const laneLinks = [...laneLinkCount].map(([k, n]) => { const [from, to] = k.split('\u0000'); return { from, to, n }; }).sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));

  // 7. depends: 그림의 선 먼저(선언 순), 실측만 있는 짝은 이름 순
  const declared = decl.links.filter((l) => byId.has(l.from) && byId.has(l.to));
  const pairs = new Map(declared.map((l) => [`${l.from}\u0000${l.to}`, true]));
  for (const k of [...measured.keys()].sort(cmp)) if (!pairs.has(k)) pairs.set(k, false);
  for (const [k, isDeclared] of pairs) {
    const [from, to] = k.split('\u0000');
    if (from === to) continue;
    g.link('container', from, 'depends', 'container', to, { declared: isDeclared, measured: measured.get(k) || 0 });
    byId.get(from).deps.push(to);
  }

  // 8. 묶음(community)과 묶음 사이 선(물려받기 뒤)
  const zoneRules = (cfg.architecture?.zones ?? []).map(([re, zone]) => [new RegExp(re), zone]);
  const communities = new Map();
  const comm = (id, name) => { if (!communities.has(id)) communities.set(id, { id, name, zone: null, nodes: 0, lanes: [], visible: true, inherited: 0, byContainer: new Map() }); return communities.get(id); };
  for (const m of modules) {
    const i = info.get(m.id);
    if (i.community == null) continue;
    const c = comm(i.community, i.communityName);
    c.nodes += 1;
    if (i.lane && !c.lanes.includes(i.lane)) c.lanes.push(i.lane);
    if (i.container) c.byContainer.set(i.container, (c.byContainer.get(i.container) || 0) + 1);
  }
  for (const n of [...screens, ...apis]) if (n.props.communityInherited) comm(n.props.community, n.props.communityName).inherited += 1;
  for (const n of [...fns, ...tables, ...g.of('symbol')]) if (n.props.community != null) comm(n.props.community, n.props.communityName);
  const laneOrder = new Map(ours.flatMap((c) => c.lanes.map((l, i) => [l.id, i])));
  const communityList = [...communities.values()].sort((a, b) => cmp(a.id, b.id)).map((c) => {
    const rule = zoneRules.find(([re]) => re.test(c.name ?? ''));
    const top = [...c.byContainer].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0];
    const lanesSorted = c.lanes.slice().sort((a, b) => (laneOrder.get(a) ?? 99) - (laneOrder.get(b) ?? 99) || cmp(a, b));
    return { id: c.id, name: c.name, zone: rule ? rule[1] : top ? top[0] : null, nodes: c.nodes, lanes: lanesSorted, visible: c.visible, inherited: c.inherited };
  });
  const commLinks = new Map();
  for (const e of g.edges) {
    if (!COMMUNITY_KINDS.has(e.kind)) continue;
    const a = g.nodes.get(e.from)?.props.community, b = g.nodes.get(e.to)?.props.community;
    if (a == null || b == null || a === b) continue;
    const k = `${a}\u0000${b}`;
    const l = commLinks.get(k) || { from: a, to: b, n: 0, kinds: {} };
    l.n += 1; l.kinds[e.kind] = (l.kinds[e.kind] || 0) + 1;
    commLinks.set(k, l);
  }
  const communityLinks = [...commLinks.values()].sort((a, b) => a.from - b.from || a.to - b.to);

  // 9. 흐름
  const steps = new Map((sem?.journeys ?? []).flatMap((j) => (j.steps ?? []).map((s) => [`${j.id}/${s.id}`, { j, s }])));
  const adj = new Map();
  for (const e of g.edges) { const inferred = e.props?.confidence === 'INFERRED'; (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)).push({ to: e.to, inferred }); (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)).push({ to: e.from, inferred }); }
  const modulesOfScreen = (k) => g.out('screen', k.slice('screen:'.length), 'renders').map(key);
  const modulesOfApi = (k) => g.out('api', k.slice('api:'.length), 'defined_in').map(key);
  const anchorsOfModule = (k) => [...g.in('module', k.slice('module:'.length), 'renders'), ...g.in('module', k.slice('module:'.length), 'defined_in')].map(key);
  // 좌표의 자리 묶음: 심볼은 그 파일과 파일을 그리는 화면·API, 파일은 자기와 화면·API, 화면·API 는 자기와 파일
  const cluster = (k) => {
    const n = g.nodes.get(k);
    if (!n) return new Set([k]);
    const set = new Set([k]);
    if (n.kind === 'symbol' && n.props.module) { const mk = `module:${n.props.module}`; set.add(mk); for (const x of anchorsOfModule(mk)) set.add(x); }
    if (n.kind === 'module') for (const x of anchorsOfModule(k)) set.add(x);
    if (n.kind === 'screen') for (const x of modulesOfScreen(k)) set.add(x);
    if (n.kind === 'api') for (const x of modulesOfApi(k)) set.add(x);
    return set;
  };
  const between = (A, B) => { // A·B 자리 묶음 사이 엣지의 확신도. 같은 종류 좌표는 직접 엣지만 본다
    let inferredOnly = false;
    for (const a of A) for (const x of adj.get(a) ?? []) if (B.has(x.to)) { if (!x.inferred) return 'ok'; inferredOnly = true; }
    return inferredOnly ? 'inferred' : 'no-edge';
  };
  const connected = (a, b) => {
    const ka = g.nodes.get(a)?.kind, kb = g.nodes.get(b)?.kind;
    if (ka && ka === kb) return between(new Set([a]), new Set([b]));
    const A = cluster(a), B = cluster(b);
    for (const x of A) if (B.has(x)) return 'ok';
    return between(A, B);
  };
  const resolve = (kind, ref) => {
    if (kind === 'api') { const hit = apis.find((a) => a.label === ref || a.id === ref) ?? apis.find((a) => a.id === ref.replace(/^[A-Z]+\s+/, '')); return hit ? key(hit) : null; }
    const k = `${kind}:${ref}`;
    if (g.nodes.has(k)) return k;
    // Graphify 는 호출 가능한 심볼 라벨에 () 를 붙인다(MyBooking()). 선언은 () 없이 적어도 된다(스펙 예 `함수 web/src/pages/Pay.tsx:Pay`)
    if (kind === 'symbol' && !ref.endsWith('()') && g.nodes.has(`${k}()`)) return `${k}()`;
    return null;
  };
  const flows = [];
  for (const c of containers) for (const f of c.flowDecls) {
    const subject = { kind: 'flow', id: f.id };
    const anchors = at(c.file, f.line);
    const step = steps.get(f.step);
    if (!step) issue('architecture.flow-step-missing', '구조 흐름', `흐름 ${f.id}: 단계 ${f.step ?? '(없음)'} 이 여정에 없음`, subject, anchors);
    for (const bad of f.bad) issue('architecture.flow-step-missing', '구조 흐름', `흐름 ${f.id}: 읽을 수 없는 좌표 '${bad}'(종류 낱말 화면·파일·함수·API·DB 함수·테이블 뒤에 좌표를 적는다)`, subject, anchors);
    const path = f.path.map((p) => ({ ...p, node: resolve(p.kind, p.ref), ...(graphMissing && (p.kind === 'module' || p.kind === 'symbol') ? { skipped: true } : {}) }));
    for (const p of path) if (!p.node && !p.skipped) issue('architecture.flow-step-missing', '구조 흐름', `흐름 ${f.id}: 좌표 '${p.kind} ${p.ref}' 에 맞는 노드가 없음`, subject, anchors);
    const resolved = path.filter((p) => p.node);
    const broken = [];
    for (let i = 1; !graphMissing && i < resolved.length; i += 1) {
      const r = connected(resolved[i - 1].node, resolved[i].node);
      if (r === 'ok') continue;
      broken.push({ from: resolved[i - 1].node, to: resolved[i].node, reason: r });
      issue('architecture.flow-broken', '구조 흐름', `흐름 ${f.id}: ${resolved[i - 1].node} → ${resolved[i].node} 사이에 ${r === 'inferred' ? '추정(INFERRED) 엣지뿐' : '엣지가 없음'}. 판정 파일로 채울 수 있다`, subject, anchors);
    }
    // 단계에서 펼친 노드: 화면 → 화면 파일·API → 로그인·DB 함수 → 테이블
    const stepScreens = (step?.s.screens ?? []).map((p) => g.get('screen', p)).filter(Boolean);
    const stepApis = [...new Set([...stepScreens.flatMap((s) => g.out('screen', s.id, 'calls')), ...(step?.s.apis ?? []).map((p) => g.get('api', p)).filter(Boolean)])];
    const files = [...new Set(stepScreens.flatMap((s) => g.out('screen', s.id, 'renders')))];
    const invoked = [...new Set(stepApis.flatMap((a) => g.out('api', a.id, 'invokes')))];
    const authN = invoked.filter((n) => n.kind === 'auth'), fnN = invoked.filter((n) => n.kind === 'function');
    const tableN = [...new Set(fnN.flatMap((fn) => g.out('function', fn.id, 'touches')))];
    const sorted = (xs) => xs.map(key).sort(cmp);
    const nodes = [...sorted(stepScreens), ...sorted(files), ...sorted(stepApis), ...sorted(authN), ...sorted(fnN), ...sorted(tableN)];
    // P3-14a: 길 위 노드 사이의 실측 엣지. 화면이 기능 길의 선을 그린다. 선언 좌표 사슬(path)과 겹쳐도 된다
    const inFlow = new Set(nodes);
    const edges = g.edges.filter((e) => inFlow.has(e.from) && inFlow.has(e.to)).map((e) => ({ from: e.from, to: e.to, kind: e.kind })).sort((x, y) => cmp(x.from, y.from) || cmp(x.kind, y.kind) || cmp(x.to, y.to));
    const counts = { screen: stepScreens.length, file: files.length, api: stepApis.length, auth: authN.length, fn: fnN.length, table: tableN.length };
    const status = step?.s.status ?? null;
    g.add('flow', f.id, f.name, { container: c.id, step: f.step, status }, { file: c.file, line: f.line, rule: 'architecture:흐름' });
    for (const p of resolved) { const [k, ...rest] = p.node.split(':'); g.link('flow', f.id, 'contains', k, rest.join(':')); }
    c.flows += 1;
    flows.push({ id: f.id, name: f.name, container: c.id, step: f.step, status, nodes, edges, counts, broken, path, story: `화면 ${counts.screen}개에서 API ${counts.api}개를 부르고 DB 함수 ${counts.fn}개가 테이블 ${counts.table}개를 건드린다${counts.auth ? `. 로그인 ${counts.auth}건` : ''}` });
  }

  return done({
    status: 'ok', error: null, deferredPolicy,
    declaration: { dir, diagram: decl.diagram ? { direction: decl.diagram.direction, boundaries: decl.diagram.boundaries } : null, problems: decl.problems.length },
    containers: containers.map((c) => ({ id: c.id, name: c.name, kind: c.kind, boundary: c.boundary, dirs: c.dirs, schemas: c.schemas, counts: c.counts, deps: c.deps, flows: c.flows, externals: c.externals, src: { file: c.file ?? readme, line: c.file ? 1 : c.line ?? null } })),
    lanes, laneLinks, communities: communityList, communityLinks,
    modules: [...info.values()],
    flows, violations, inherited,
  });
}

export default architectureStage;
