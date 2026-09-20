// Graphify 어댑터(2.1.0): 설정 architecture.graph(기본 graphify-out/graph.json)의 Graphify graph.json 을 읽어 파일(module)·심볼(symbol)·
// 외부(module, props.external)·SQL 객체(function·table 에 합침) 노드와 imports·contains·calls·reads·inherits 엣지를 만든다. 사실 추출은 Graphify 가 하고
// 엔진은 산출물만 읽는다(스펙 DEC-23). 계약은 「Graphify 그래프 계약」: 최상위 키 여섯과 반드시 있는 필드가 없으면 architecture.graph-schema 오류이고
// 반쯤 읽은 그래프로 노드를 싣지 않는다. 모르는 relation 은 무시하고 건수만 남긴다. 통계는 g.architecture.graphify 에 남겨 파생이 data.json 에 싣는다.
//
// 노드 분류는 file_type 으로 한다(type 필드는 외부 노드 일부에만 있다).
//   concept                         → 외부 module(id 라벨, external). 패키지·문서 참조
//   code, 파일 판정                  → module(id 저장소 기준 경로). 판정: 라벨이 파일명 모양이고 source_file 의 basename 또는 dir/basename 과 같다
//                                      (Graphify 는 파일명이 겹치면 라벨에 상위 폴더를 붙인다). 심볼 없는 barrel·진입 파일도 파일이다(N0 SPEC_FIX=file-rule)
//   code, SQL 계열 스키마 접두 라벨   → 라벨 단위로 합쳐 livemap function(<이름>)·table(<스키마.이름>) 노드에 props.graphifyIds 로 붙인다(DEC-43, 아래 mergeSqlLabels).
//                                      정의 자리가 없는 라벨(OQ09_DECISION=b): 같은 이름의 livemap function·table 이 있으면 그 노드에 props.graphifyRefs 로만 붙인다
//                                      (Graphify 가 정의를 놓친 자리. 다리 매칭 graphifyIds 에는 세지 않아 bridge-unmatched 가 그대로 난다), 없으면 남의 스키마라
//                                      바깥 상대 symbol(id 라벨, external·sql·schema. 선언 파일의 바깥 상대 키는 스키마 단위다), 스키마 접두 없는 낱말 조각은 버린다
//   code, 그 밖                      → symbol(id <파일>:<이름>, 같은 파일에 같은 이름이 둘이면 @<위치>)
//   source_file 이 비고 들어오는 엣지 없음 → 조각 노드, 버린다
// relation 대응(DEC-24·DEC-28): imports·imports_from·re_exports → imports(끝점을 module 로 올린다), contains·method → contains, calls·indirect_call → calls,
//   reads_from·references·indexes·cites → reads, inherits → inherits. 엣지 props 에 confidence 와 참일 때만 typeOnly·deferred, 원 relation 이 다르면 via,
//   imports 는 기여 링크 중 가장 앞선 source_location 줄 line(층 위반 좌표의 근거).
// 순서: migrations 뒤에 둔다. livemap 이 만든 function·table 노드에 Graphify 증거를 덧붙이기 때문이다(먼저 돌아도 노드는 만들어지고 src 만 Graphify 자리가 된다).
export const DEFAULT_GRAPH = 'graphify-out/graph.json';
export const REQUIRED_TOP = ['directed', 'multigraph', 'graph', 'nodes', 'links', 'hyperedges'];
export const REQUIRED_NODE = ['id', 'label', 'community', 'community_name', 'file_type', 'source_file'];
export const REQUIRED_LINK = ['source', 'target', 'relation', 'confidence', 'confidence_score', 'source_file', 'source_location', 'weight'];
// Graphify relation → livemap 엣지 종류. 끝점을 module 로 올리는 것은 imports 계열만이다
const RELATIONS = {
  imports: 'imports', imports_from: 'imports', re_exports: 'imports',
  contains: 'contains', method: 'contains',
  calls: 'calls', indirect_call: 'calls',
  reads_from: 'reads', references: 'reads', indexes: 'reads', cites: 'reads',
  inherits: 'inherits',
};
const VIA = new Set(['method', 'indexes', 'cites']);
const MODULE_LEVEL = new Set(['imports', 'imports_from', 're_exports']);
const FILE_LABEL = /^[^()\s]+\.[A-Za-z0-9]+$/;
const SQL_LABEL = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(\(\))?$/;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lineOf = (loc) => { const m = /^L(\d+)$/.exec(loc || ''); return m ? Number(m[1]) : null; };
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// 계약 위반 목록(빈 배열이면 통과). 최상위 키 여섯, 노드 필드 여섯, 링크 필드 여덟의 존재만 본다(값은 Graphify 판마다 달라도 된다)
export function schemaProblems(doc) {
  if (!isObj(doc)) return ['최상위가 객체가 아님'];
  const out = REQUIRED_TOP.filter((k) => !(k in doc)).map((k) => `최상위 키 없음: ${k}`);
  if (out.length) return out;
  if (!Array.isArray(doc.nodes)) out.push('nodes 가 배열이 아님');
  if (!Array.isArray(doc.links)) out.push('links 가 배열이 아님');
  if (out.length) return out;
  doc.nodes.forEach((n, i) => { if (!isObj(n)) out.push(`nodes[${i}] 객체 아님`); else for (const k of REQUIRED_NODE) if (!(k in n)) out.push(`nodes[${i}](${n.id ?? '?'}) 필드 없음: ${k}`); });
  doc.links.forEach((l, i) => { if (!isObj(l)) out.push(`links[${i}] 객체 아님`); else for (const k of REQUIRED_LINK) if (!(k in l)) out.push(`links[${i}](${l.source ?? '?'} → ${l.target ?? '?'}) 필드 없음: ${k}`); });
  return out;
}

// 파일 노드 판정: 라벨이 파일명 모양이고 source_file 의 basename 또는 dir/basename 과 같다
export const isFileNode = (n) => !!n.source_file && FILE_LABEL.test(n.label) && (n.source_file === n.label || n.source_file.endsWith('/' + n.label));

// SQL 라벨 합치기(DEC-43): 같은 라벨 노드를 논리 노드 하나로. 정의 자리는 source_file 있는 노드, 묶음은 source_file 사전순(=migration 생성 순) 첫 자리의 커뮤니티.
// 같은 파일 안에 둘이면 id 순. 입력 순서와 무관하게 같은 결과를 낸다(SC-24). 결과는 라벨 순
export function mergeSqlLabels(nodes) {
  const byLabel = new Map();
  for (const n of nodes) { if (!byLabel.has(n.label)) byLabel.set(n.label, []); byLabel.get(n.label).push(n); }
  return [...byLabel.entries()].sort(([a], [b]) => cmp(a, b)).map(([label, ns]) => {
    const sites = ns.filter((n) => n.source_file).sort((a, b) => cmp(a.source_file, b.source_file) || cmp(a.id, b.id));
    const first = sites[0] || null;
    const q = SQL_LABEL.exec(label);
    return {
      label, ids: ns.map((n) => n.id).sort(cmp), sites: sites.length,
      community: first ? first.community : null, communityName: first ? first.community_name : null,
      schema: q ? q[1] : null, name: q ? q[2] : label.replace(/\(\)$/, ''), isFn: label.endsWith('()'), isTable: !!q && !q[3],
      file: first ? first.source_file : null, line: first ? lineOf(first.source_location) : null,
    };
  });
}

export default function graphify(g, fs, cfg) {
  const path = cfg.architecture?.graph || DEFAULT_GRAPH;
  if (!fs.has(path)) {
    g.architecture = { graphify: null, graphMissing: true };
    g.issue('warn', '구조 그래프', `Graphify 그래프 파일 없음: ${path}. 구조 화면은 부품과 기존 사슬 두 층까지 그린다`, { code: 'architecture.graph-missing', subject: { kind: 'config', id: 'architecture.graph' }, anchors: [{ file: 'map/config.json' }] });
    return `Graphify 그래프 없음: ${path}`;
  }
  let doc;
  try { doc = JSON.parse(fs.read(path)); } catch (e) { doc = { parseError: String(e.message || e) }; }
  const problems = doc.parseError ? [`JSON 읽기 실패: ${doc.parseError}`] : schemaProblems(doc);
  if (problems.length) {
    g.architecture = { graphify: null, graphMissing: false };
    const shown = problems.slice(0, 5).join('; ') + (problems.length > 5 ? ` 외 ${problems.length - 5}` : '');
    g.issue('error', '구조 그래프', `${path} 이 Graphify 계약과 다름(${problems.length}): ${shown}`, { code: 'architecture.graph-schema', subject: { kind: 'config', id: 'architecture.graph' }, anchors: [{ file: path }] });
    return `Graphify 계약 위반 ${problems.length}건: ${path}`;
  }

  // 입력 순서에 기대지 않는다: 노드는 id 순, 링크는 (source, relation, target) 순으로 본다
  const nodes = doc.nodes.slice().sort((a, b) => cmp(a.id, b.id));
  const links = doc.links.slice().sort((a, b) => cmp(a.source, b.source) || cmp(a.relation, b.relation) || cmp(a.target, b.target));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Set(links.map((l) => l.target));
  const sqlFile = (f) => /\.sql$/i.test(f || '');
  const sqlLinked = new Set();
  for (const l of links) if (sqlFile(l.source_file)) { sqlLinked.add(l.source); sqlLinked.add(l.target); }

  // 1. 분류
  const files = [], symbols = [], external = [], sql = [];
  let fragments = 0;
  for (const n of nodes) {
    if (n.file_type === 'concept') { external.push(n); continue; }
    if (!n.source_file && !incoming.has(n.id)) { fragments += 1; continue; }
    if (isFileNode(n)) { files.push(n); continue; }
    const sqlSeries = !/\.sql$/i.test(n.label) && (sqlFile(n.source_file) || (!n.source_file && sqlLinked.has(n.id)));
    if (sqlSeries && (SQL_LABEL.test(n.label) || !n.source_file)) { sql.push(n); continue; }
    if (!n.source_file) { external.push(n); continue; } // 파일 없는 코드 노드(참조만): 외부로 둔다
    symbols.push(n);
  }

  // 2. 노드 만들기. ref: Graphify 노드 id → livemap 노드 키 [kind, id]
  const ref = new Map();
  const moduleOf = new Map(); // source_file → module id(파일 노드가 있는 경로)
  for (const n of files) {
    g.add('module', n.source_file, n.label, { graphifyId: n.id, community: n.community, communityName: n.community_name }, { file: n.source_file, line: 1, rule: 'graphify:file' });
    ref.set(n.id, ['module', n.source_file]);
    moduleOf.set(n.source_file, n.source_file);
  }
  for (const n of external) {
    g.add('module', n.label, n.label, { external: true, graphifyId: n.id, community: n.community, communityName: n.community_name }, null);
    ref.set(n.id, ['module', n.label]);
  }
  // 심볼 id: <파일>:<이름>. 같은 파일·이름이 둘 이상이면 모두 @<위치>를 붙이고, 그래도 겹치면 #<Graphify id>
  const symKey = new Map();
  for (const n of symbols) { const k = `${n.source_file}:${n.label}`; if (!symKey.has(k)) symKey.set(k, []); symKey.get(k).push(n); }
  for (const [k, ns] of symKey) {
    const withLoc = ns.map((n) => [n, ns.length > 1 ? `${k}@${n.source_location || '?'}` : k]);
    const dup = new Map(); for (const [, id] of withLoc) dup.set(id, (dup.get(id) || 0) + 1);
    for (const [n, base] of withLoc) {
      const id = dup.get(base) > 1 ? `${base}#${n.id}` : base;
      const line = lineOf(n.source_location);
      g.add('symbol', id, n.label, { module: n.source_file, line, callable: !!n._callable, class: !!n._callable_class, graphifyId: n.id, community: n.community, communityName: n.community_name }, { file: n.source_file, line, rule: 'graphify:symbol' });
      ref.set(n.id, ['symbol', id]);
    }
  }
  const merged = mergeSqlLabels(sql);
  let sqlFunctions = 0, sqlTables = 0, sqlExternal = 0, sqlNoise = 0;
  for (const m of merged) {
    const props = { schema: m.schema, graphifyIds: m.ids, community: m.community, communityName: m.communityName };
    let key;
    if (m.sites === 0) {
      if (!m.schema) { sqlNoise += 1; continue; } // 스키마 낱말·SQL 낱말 조각. 그리로 가는 엣지는 끝점이 없어 버려진다
      const own = m.isFn ? g.get('function', m.name) : g.get('table', m.label);
      if (own) { key = [own.kind, own.id]; g.add(own.kind, own.id, own.label, { graphifyRefs: m.ids }); }
      else { key = ['symbol', m.label]; g.add('symbol', m.label, m.label, { external: true, sql: true, ...props }, null); sqlExternal += 1; }
    }
    else if (m.isFn) {
      key = ['function', m.name];
      const existing = g.get('function', m.name);
      g.add('function', m.name, m.name, existing ? props : { qualified: `${m.schema}.${m.name}`, ...props }, { file: m.file, line: m.line, rule: 'graphify:sql' });
      sqlFunctions += 1;
    } else {
      key = ['table', m.label];
      g.add('table', m.label, m.name, props, { file: m.file, line: m.line, rule: 'graphify:sql' });
      sqlTables += 1;
    }
    for (const id of m.ids) ref.set(id, key);
  }

  // 3. 엣지: 같은 (from, kind, to)는 하나로 합친다. confidence 는 하나라도 EXTRACTED 면 EXTRACTED, typeOnly·deferred 는 모두 참일 때만
  const agg = new Map();
  const unknownRelations = {};
  let droppedEdges = 0, inferred = 0, typeOnly = 0, deferred = 0;
  const relationCounts = {};
  for (const l of links) {
    relationCounts[l.relation] = (relationCounts[l.relation] || 0) + 1;
    if (l.confidence === 'INFERRED') inferred += 1;
    if (l.type_only === true) typeOnly += 1;
    if (l.deferred === true) deferred += 1;
    const kind = RELATIONS[l.relation];
    if (!kind) { unknownRelations[l.relation] = (unknownRelations[l.relation] || 0) + 1; continue; }
    let from = ref.get(l.source), to = ref.get(l.target);
    if (MODULE_LEVEL.has(l.relation)) {
      const up = (k, gn) => (!k ? null : k[0] === 'module' ? k : gn?.source_file && moduleOf.has(gn.source_file) ? ['module', gn.source_file] : null);
      from = up(from, byId.get(l.source)); to = up(to, byId.get(l.target));
    }
    if (!from || !to || (from[0] === to[0] && from[1] === to[1])) { droppedEdges += 1; continue; }
    const k = `${from.join(':')}\u0000${kind}\u0000${to.join(':')}`;
    const a = agg.get(k) || { from, to, kind, extracted: false, typeOnly: true, deferred: true, via: new Set(), line: null };
    if (MODULE_LEVEL.has(l.relation)) { const ln = lineOf(l.source_location); if (ln !== null && (a.line === null || ln < a.line)) a.line = ln; }
    a.extracted ||= l.confidence !== 'INFERRED';
    a.typeOnly &&= l.type_only === true;
    a.deferred &&= l.deferred === true;
    if (VIA.has(l.relation)) a.via.add(l.relation); else a.via.add(null);
    agg.set(k, a);
  }
  for (const a of agg.values()) {
    const props = { confidence: a.extracted ? 'EXTRACTED' : 'INFERRED' };
    if (a.typeOnly) props.typeOnly = true;
    if (a.deferred) props.deferred = true;
    const via = [...a.via].filter(Boolean);
    if (via.length && !a.via.has(null)) props.via = via.sort().join('|');
    if (a.kind === 'imports' && a.line !== null) props.line = a.line; // 파일 의존의 import 줄(P5-15a). 다른 종류는 싣지 않는다
    g.link(a.from[0], a.from[1], a.kind, a.to[0], a.to[1], props);
  }

  g.architecture = {
    graphMissing: false,
    graphify: {
      nodes: doc.nodes.length, edges: doc.links.length, relations: Object.keys(relationCounts).length, relationCounts,
      communities: new Set(doc.nodes.map((n) => n.community)).size, inferred, typeOnly, deferred, unknownRelations,
      generatedAt: typeof fs.mtime === 'function' ? fs.mtime(path) : null, tool: 'graphify', builtAtCommit: doc.built_at_commit ?? null,
      kept: { modules: files.length, symbols: symbols.length, external: external.length, sqlFunctions, sqlTables, sqlExternal },
      dropped: { fragments, sqlNoise, edges: droppedEdges },
    },
  };
  return null;
}
