// 구조 산출물 생성기(2.1.0, 스펙 「map/.out/architecture.md 산출물」 PN-31~PN-34, DEC-3·DEC-22·DEC-29): data.json 의 architecture 절만 읽어
// 세션 시작에 읽히는 짧은 md 한 장(절 여덟, Mermaid flowchart 하나와 기능별 sequenceDiagram)과 함수 수준 architecture.json 을 만든다.
//   절: 머리 한 줄 → 부품 표 → 시스템 그림 → 규칙(지켜짐·어긋남·선언만) → 기능 표 → 기능별 호출 흐름 → 어긋남과 끊김 → 어디를 고치나
//   상한 OUT_LIMIT(8,000바이트). sequenceDiagram 을 넣는 기능은 현재 마일스톤(진행, 없으면 다음) 소속 우선·지나는 노드 수 차선으로 고르고(동작 상태는 쓰지 않는다),
//   개수는 'fit'(상한 안에서 그 순서로 채움, 기본) 또는 정수(설정 architecture.sequenceDiagrams. 확정은 OQ-02, Phase 5). 넘으면 architecture.out-too-long
//   스킬 사본(architecture.skillFile): 같은 본문 앞에 frontmatter 두 줄(name 은 폴더 이름). 커밋된 사본 본문이 지금 생성물과 다르면 architecture.skill-stale
// Mermaid 는 에이전트가 글자로 읽고 사람이 쓴 원본과 같은 문법이다. 외부 의존성 없이 문자열만 만든다.
import { basename, dirname } from 'node:path';

export const OUT_LIMIT = 8000;
export const DEFAULT_SEQUENCE = 'fit';
export const SECTION_TITLES = ['부품', '시스템 그림', '규칙', '기능', '기능별 호출 흐름', '어긋남과 끊김', '어디를 고치나'];
export const SKILL_DESCRIPTION = (project) => `「${project}」이 무엇으로 되어 있나. 부품·경계·규칙·기능별 호출 흐름. 화면·API·DB를 바꾸기 전에 읽는다.`;
const KIND_WORD = { ours: '우리 코드', external: '바깥 상대', undeclared: '표에 없음' };
const NODE_WORD = { screen: '화면', module: '파일', symbol: '함수', api: 'API', function: 'DB 함수', table: '테이블', auth: '로그인' };
const EDGE_WORD = { 'screen>symbol': 'renders', 'screen>module': 'renders', 'symbol>api': 'calls', 'screen>api': 'calls', 'module>api': 'calls', 'api>function': 'invokes', 'api>auth': 'invokes', 'function>table': 'touches', 'symbol>symbol': 'calls', 'symbol>function': 'calls', 'function>function': 'calls' };
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const q = (s) => String(s ?? '').replace(/"/g, '”');
const dash = (xs) => (xs && xs.length ? xs.join(', ') : '—');
const split = (k) => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
const label = (k) => { const [kind, id] = split(k); const short = kind === 'symbol' ? id.split(':').pop() : id; return `${NODE_WORD[kind] ?? kind} ${short}`; };

// 기능 고르기: 현재 마일스톤(진행, 없으면 다음) 소속 장면을 가진 흐름 먼저, 그 다음 지나는 노드 수, 마지막 id 순. 동작 상태는 쓰지 않는다
export function selectFlows(flows, d) {
  const ms = d.milestones ?? [];
  const current = (ms.find((m) => m.status === '진행') ?? ms.find((m) => m.status === '다음'))?.id ?? null;
  const inCurrent = new Set();
  if (current) for (const item of d.roadmap ?? []) if (item.milestone === current) for (const s of item.scenes ?? []) inCurrent.add(s.ref);
  return flows.slice().sort((a, b) => (Number(inCurrent.has(b.step)) - Number(inCurrent.has(a.step))) || ((b.nodes?.length ?? 0) - (a.nodes?.length ?? 0)) || cmp(a.id, b.id));
}

function flowchart(a) {
  const lines = ['flowchart LR'];
  const bounds = a.declaration?.diagram?.boundaries ?? [];
  const byBoundary = new Map();
  for (const c of a.containers) { const k = c.boundary ?? ''; if (!byBoundary.has(k)) byBoundary.set(k, []); byBoundary.get(k).push(c); }
  const node = (c, indent) => lines.push(`${indent}${c.id}["${q(c.name)}"]`);
  const walk = (parent, indent) => {
    for (const b of bounds.filter((x) => (x.parent ?? null) === parent)) {
      lines.push(`${indent}subgraph ${b.id}["${q(b.label)}"]`);
      for (const c of byBoundary.get(b.id) ?? []) node(c, indent + '  ');
      walk(b.id, indent + '  ');
      lines.push(`${indent}end`);
    }
  };
  walk(null, '  ');
  const known = new Set(bounds.map((b) => b.id));
  for (const [k, cs] of byBoundary) if (k === '' || !known.has(k)) for (const c of cs) node(c, '  ');
  for (const c of a.containers) for (const to of c.deps ?? []) lines.push(`  ${c.id} --> ${to}`);
  return lines;
}

function sequence(f) {
  const steps = (f.path?.length ? f.path.map((p) => p.node).filter(Boolean) : f.nodes) ?? [];
  const ids = new Map();
  const pid = (k) => { if (!ids.has(k)) ids.set(k, `P${ids.size + 1}`); return ids.get(k); };
  const lines = ['sequenceDiagram'];
  for (const k of steps) lines.push(`  participant ${pid(k)} as ${q(label(k))}`);
  for (let i = 1; i < steps.length; i += 1) {
    const [ka] = split(steps[i - 1]), [kb] = split(steps[i]);
    const broken = (f.broken ?? []).find((b) => b.from === steps[i - 1] && b.to === steps[i]);
    lines.push(`  ${pid(steps[i - 1])}${broken ? '--x' : '->>'}${pid(steps[i])}: ${broken ? `끊김(${broken.reason})` : (EDGE_WORD[`${ka}>${kb}`] ?? 'uses')}`);
  }
  return lines;
}

// 절 여덟을 순서대로 만든다. seq 는 sequenceDiagram 을 넣을 기능 수
function compose(d, { version, seq, ordered, generatedAt }) {
  const a = d.architecture;
  const project = d.project?.name ?? String(d.project ?? '');
  const rules = a.lanes.filter((l) => l.kind === 'code' && Array.isArray(l.allow));
  const gf = a.graphify;
  const out = [];
  const p = (...ls) => out.push(...ls);
  p(`# 구조: ${project}`, '', `부품 ${a.containers.length} · 묶음 ${a.communities.length} · 기능 ${a.flows.length} · 규칙 ${rules.length} · 어긋남 ${a.violations.length} · 생성 ${generatedAt} · livemap ${version} · Graphify ${gf ? `노드 ${gf.nodes} · 엣지 ${gf.edges}${gf.builtAtCommit ? ` · ${gf.builtAtCommit}` : ''}` : '없음'}`, '');
  p('## 부품', '', '| id | 이름 | 경계 | 종류 | 폴더 | 수 |', '|---|---|---|---|---|---|');
  for (const c of a.containers) p(`| ${c.id} | ${c.name} | ${c.boundary ?? '—'} | ${KIND_WORD[c.kind] ?? c.kind} | ${dash(c.dirs)} | 화면 ${c.counts.screens} · 파일 ${c.counts.files} · 심볼 ${c.counts.symbols} |`);
  p('', '## 시스템 그림', '', '```mermaid', ...flowchart(a), '```', '');
  p('## 규칙', '');
  if (!rules.length) p('- 허용 목록(- 가져올 수 있는 층:)을 적은 층이 없다');
  const link = new Map(a.laneLinks.map((l) => [`${l.from}>${l.to}`, l.n]));
  for (const l of rules) {
    const kept = l.allow.filter((t) => link.get(`${l.id}>${t}`));
    const declaredOnly = l.allow.filter((t) => !link.get(`${l.id}>${t}`));
    const broken = a.violations.filter((v) => v.fromLane === l.id);
    p(`- 층 ${l.id}(${l.container}) 가져올 수 있는 층: ${dash(l.allow)}`);
    // 셋으로 나눈다: 지켜짐(허용하고 실측도 있음)·어긋남(허용 밖 import, 좌표)·선언만(허용했지만 실측 0)
    p(`  - 지켜짐: ${kept.length ? kept.map((t) => `${l.id} → ${t} ${link.get(`${l.id}>${t}`)}건`).join(' · ') : '없음'}`);
    if (broken.length) for (const v of broken) p(`  - 어긋남: ${v.fromLane} → ${v.toLane} ${v.from} → ${v.to}${v.deferred ? ' [동적 import]' : ''}`);
    else p('  - 어긋남: 없음');
    p(`  - 선언만: ${declaredOnly.length ? `${declaredOnly.map((t) => `${l.id} → ${t}`).join(' · ')}(실측 0)` : '없음'}`);
  }
  p('', '## 기능', '', '| id | 이름 | 상태 | 수 |', '|---|---|---|---|');
  for (const f of a.flows) p(`| ${f.id} | ${f.name} | ${f.status ?? '—'} | 화면 ${f.counts.screen} · API ${f.counts.api} · DB 함수 ${f.counts.fn} · 테이블 ${f.counts.table} |`);
  if (!a.flows.length) p('| — | 흐름 선언 없음 | — | — |');
  p('', '## 기능별 호출 흐름', '');
  if (!seq) p(`- 상한 안에 sequenceDiagram 을 넣지 못함(기능 ${a.flows.length}). 기능 표만 있다`);
  for (const f of ordered.slice(0, seq)) p(`### ${f.name} (${f.id})`, '', '```mermaid', ...sequence(f), '```', '');
  if (seq && seq < ordered.length) p(`- 나머지 ${ordered.length - seq}개는 상한 때문에 빠짐: ${ordered.slice(seq).map((f) => f.id).join(', ')}`, '');
  p('## 어긋남과 끊김', '');
  const issues = (d.issues ?? []).filter((i) => typeof i.code === 'string' && i.code.startsWith('architecture.'));
  const DETAIL = new Set(['architecture.layer-violation', 'architecture.flow-broken', 'architecture.flow-step-missing']);
  const detail = issues.filter((i) => DETAIL.has(i.code)), rest = issues.filter((i) => !DETAIL.has(i.code));
  if (!issues.length) p('- 없음');
  for (const i of detail) { const an = i.anchors?.[0]; p(`- ${i.code} · ${i.message.replace(/^architecture\.[a-z-]+: /, '')}${an ? ` · ${an.file}${an.line ? `:${an.line}` : ''}` : ''}`); }
  const byCode = new Map(); for (const i of rest) byCode.set(i.code, (byCode.get(i.code) || 0) + 1);
  for (const [code, n] of [...byCode].sort()) p(`- ${code} ${n}건: livemap check --json`);
  p('', '## 어디를 고치나', '',
    `- 구조 정본 폴더: ${a.declaration?.dir ?? 'map/architecture'}/ (README.md 의 그림·부품 표, 부품 파일의 폴더·층·흐름)`,
    '- 설정 파일: map/config.json (architecture.dir·graph·skillFile·zones·deferred·outLimit·sequenceDiagrams)',
    `- 여정 정본: ${d.sources?.semantic ?? '—'} (흐름의 단계가 가리키는 장면)`,
    '- Graphify 그래프: 프로젝트 루트에서 `uvx --from "graphifyy[sql]" graphify update .` 로 다시 만든다(.graphifyignore 허용 목록)');
  return out.join('\n') + '\n';
}

export function renderArchitectureMd(d, { version = '', limit = OUT_LIMIT, sequence = DEFAULT_SEQUENCE, generatedAt = d.generatedAt ?? '' } = {}) {
  const a = d.architecture ?? { containers: [], communities: [], flows: [], violations: [], lanes: [], laneLinks: [], graphify: null, declaration: null };
  const dd = { ...d, architecture: a };
  const ordered = selectFlows(a.flows, d);
  const build = (seq) => compose(dd, { version, seq, ordered, generatedAt });
  let seq = sequence === 'fit' ? ordered.length : Math.max(0, Math.min(Number(sequence) || 0, ordered.length));
  let text = build(seq);
  if (sequence === 'fit') while (seq > 0 && bytes(text) > limit) { seq -= 1; text = build(seq); }
  const size = bytes(text);
  return { text, bytes: size, tooLong: size > limit, limit, sequenceCount: seq, flowsTotal: ordered.length, sections: SECTION_TITLES };
}

// 스킬 사본: frontmatter 두 줄 뒤 닫는 --- 다음 줄부터 산출물 본문과 바이트가 같다
export function skillCopy(text, { name, project }) {
  return `---\nname: ${name}\ndescription: ${SKILL_DESCRIPTION(project)}\n---\n${text}`;
}
export function skillBody(copy) {
  const lines = String(copy ?? '').split('\n');
  if (lines[0] !== '---') return null;
  const close = lines.indexOf('---', 1);
  return close < 0 ? null : lines.slice(close + 1).join('\n');
}
// 생성 시각은 빌드마다 바뀌므로 낡음 비교에서 뺀다
const stable = (text) => String(text ?? '').replace(/· 생성 \S+/, '· 생성 <t>');

// 함수 수준 자료(DEC-39): symbols[] 와 심볼 사이 calls·reads
export function architectureJson(g) {
  const symbols = g.of('symbol').filter((s) => !s.props.external && s.props.module).map((s) => ({ id: s.id, module: s.props.module, line: s.props.line ?? null, callable: !!s.props.callable, community: s.props.community ?? null }));
  const edges = g.edges.filter((e) => (e.kind === 'calls' || e.kind === 'reads') && e.from.startsWith('symbol:') && e.to.startsWith('symbol:')).map((e) => ({ from: e.from, to: e.to, kind: e.kind, confidence: e.props?.confidence ?? null }));
  return { symbols, edges };
}

// 빌드가 쓰는 산출물 묶음과 판정. graphify 어댑터가 돌지 않은 프로젝트(architecture 절 없음)는 null
export function architectureOutputs(g, data, cfg, fs, { version = '' } = {}) {
  if (!data?.architecture) return null;
  const arch = cfg?.architecture ?? {};
  const limit = Number.isFinite(arch.outLimit) && arch.outLimit > 0 ? arch.outLimit : OUT_LIMIT;
  const sequence = arch.sequenceDiagrams ?? DEFAULT_SEQUENCE;
  const r = renderArchitectureMd(data, { version, limit, sequence });
  const issues = [];
  if (r.tooLong) issues.push({ level: 'warn', label: '구조 산출물', message: `architecture.out-too-long: map/.out/architecture.md 가 ${r.bytes}바이트로 상한 ${limit}바이트를 넘음(sequenceDiagram ${r.sequenceCount}/${r.flowsTotal}). architecture.outLimit 또는 sequenceDiagrams 로 조절한다`, detail: { code: 'architecture.out-too-long', subject: { kind: 'config', id: 'architecture.outLimit' }, anchors: [{ file: 'map/config.json' }] } });
  let copy = null;
  if (typeof arch.skillFile === 'string' && arch.skillFile) {
    const project = data.project?.name ?? String(data.project ?? '');
    copy = { path: arch.skillFile, text: skillCopy(r.text, { name: basename(dirname(arch.skillFile)), project }) };
    const current = fs.has(arch.skillFile) ? skillBody(fs.read(arch.skillFile)) : null;
    if (current === null || stable(current) !== stable(r.text)) issues.push({ level: 'warn', label: '구조 산출물', message: `architecture.skill-stale: 스킬 사본 ${arch.skillFile} ${current === null ? '이 없거나 frontmatter 가 없음' : '의 본문이 지금 생성물과 다름'}. livemap build 뒤 사본을 커밋한다`, detail: { code: 'architecture.skill-stale', subject: { kind: 'config', id: 'architecture.skillFile' }, anchors: [{ file: arch.skillFile }] } });
  }
  return { md: r.text, json: architectureJson(g), copy, issues, render: r };
}
