// 워크스페이스 단계(2.2.0): 상위 map/config.json 의 workspace 키가 가리키는 표식 파일(.agent/repos.yaml)의 자식 저장소마다
// 자기 루트와 자기 설정으로 그래프를 만들고, task·decision·commit·ledger 노드만 저장소 접두 `<path>:` 를 붙여 상위 그래프에 합친다.
// buildGraph 의 어댑터 루프 바로 뒤, 연결 단계 앞에서 돈다. 합치는 노드가 넷뿐이라 뒤 단계가 읽는 화면·API 노드는 늘지 않는다.
//   자식 설정 세 갈래: 자식 map/config.json(child) → 없으면 자동 설정 위에 workspace.children.<path>.config 병합(override) → 그것도 없으면 자동 설정(auto)
//   자식 빌드는 항상 workspace: false 인 한 루트 빌드이고 파일을 쓰지 않는다. 자식 이슈·배지·deploy·제품 축 노드는 합치지 않고 저장소 절에 수만 싣는다
//   자식 문제는 상위 check 를 막지 않는다: 자식마다 repo:<path> 상태를 ok 또는 partial 로 남기고(failed 는 adapter.failed 오류가 된다) 실패는 경고 이슈로 낸다
// 저장소 어긋남 R1~R4 는 표식 읽개(lib/repos-marker.mjs)가 판정하고 여기서 repos.* 경고로 낸다. 자동 수정은 하지 않는다.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { auditRepos, R_KEYS, ROOT_PATH } from './lib/repos-marker.mjs';
import { checkProblems } from './check.mjs';

export const MERGED_KINDS = ['task', 'decision', 'commit', 'ledger'];
export const DRIFT_CODES = { R1: 'repos.listed-only', R2: 'repos.disk-only', R3: 'repos.parent-index', R4: 'repos.remote-mismatch' };
const CONFIG = 'map/config.json';
const ENGINE_PKG = 'node_modules/@pghoya2956/livemap/package.json';
// 대체 설정을 자동 설정 위에 합칠 때 안쪽 키 단위로 한 번 더 합치는 키. 어댑터가 이 키들의 안쪽 값을 바로 읽어 하나만 빠져도 실패한다
const NESTED_KEYS = ['git', 'tasks', 'wiki'];
const LABEL = '저장소';
const WORKTREE_NOTE = '워크트리라 자식 저장소 없음';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const show = (path) => (path === ROOT_PATH ? '상위 저장소' : path);

// 자동 설정: 자식에 tasks/ 가 있으면 tasks, .agent/wiki/index.md 가 있으면 wiki 어댑터를 넣고 git 은 항상 넣는다
export function autoConfig(childRoot, { path, branch, sinceDays, engineMajor }) {
  const adapters = [];
  if (isDir(join(childRoot, 'tasks'))) adapters.push('tasks');
  if (existsSync(join(childRoot, '.agent/wiki/index.md'))) adapters.push('wiki');
  adapters.push('git');
  return {
    engine: engineMajor,
    project: { name: path },
    adapters,
    tasks: { dir: 'tasks', index: 'tasks/index.md' },
    wiki: { index: '.agent/wiki/index.md' },
    git: { branch: branch || 'main', sinceDays: sinceDays ?? 14, areas: [], runtimePaths: [] },
  };
}

// 최상위 키는 대체 설정이 이기고 git·tasks·wiki 는 안쪽 키 단위로 합친다
export function mergeConfig(base, override) {
  const out = { ...base, ...override };
  for (const k of NESTED_KEYS) if (isObj(base[k]) && isObj(override[k])) out[k] = { ...base[k], ...override[k] };
  return out;
}

// → { config, source: 'child'|'override'|'auto', mismatch, error }. 자식 설정이 깨졌으면 config null 과 error,
// 자식 설정의 engine major 가 상위 엔진과 다르면 자동 설정으로 대신 돌고 mismatch 에 까닭을 적는다
export function resolveChildConfig(childRoot, { path, branch, sinceDays, engineMajor, override = null }) {
  const auto = () => autoConfig(childRoot, { path, branch, sinceDays, engineMajor });
  const file = join(childRoot, CONFIG);
  if (existsSync(file)) {
    let cfg;
    try { cfg = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { return { config: null, source: 'child', mismatch: null, error: `${CONFIG} 읽기 실패: ${e.message}` }; }
    const want = cfg?.engine ?? 1;
    if (Number(want) !== engineMajor) return { config: auto(), source: 'auto', mismatch: `${CONFIG}의 engine ${want}이 상위 엔진 major ${engineMajor}와 다름`, error: null };
    return { config: cfg, source: 'child', mismatch: null, error: null };
  }
  if (isObj(override)) return { config: mergeConfig(auto(), override), source: 'override', mismatch: null, error: null };
  return { config: auto(), source: 'auto', mismatch: null, error: null };
}

// 자식 그래프의 넷을 접두를 붙여 상위 그래프에 넣는다. 번호 정의의 definers·definedAt[].task 도 같은 접두를 붙여야 defines 엣지와 같은 노드를 가리킨다.
// 경로 값(src.file, props 의 file·planFile 등)은 자식 루트 기준 그대로 두고 repo 로 해석한다. 엣지는 두 끝이 모두 온 것만 옮긴다(첫 판에서는 defines 뿐)
export function importChild(g, child, path) {
  const pre = (id) => `${path}:${id}`;
  const taken = new Set();
  for (const node of child.nodes.values()) {
    if (!MERGED_KINDS.includes(node.kind)) continue;
    const props = { ...structuredClone(node.props), repo: path };
    if (node.kind === 'decision' && props.kind !== 'wiki') {
      if (Array.isArray(props.definers)) props.definers = props.definers.map(pre);
      if (Array.isArray(props.definedAt)) props.definedAt = props.definedAt.map((x) => ({ ...x, task: pre(x.task) }));
    }
    g.add(node.kind, pre(node.id), node.label, props, node.src ? { ...node.src } : null);
    taken.add(child.key(node.kind, node.id));
  }
  for (const e of child.edges) {
    if (!taken.has(e.from) || !taken.has(e.to)) continue;
    const a = child.nodes.get(e.from), b = child.nodes.get(e.to);
    g.link(a.kind, pre(a.id), e.kind, b.kind, pre(b.id), e.props ?? null);
  }
  return taken.size;
}

const statusCounts = (tasks) => { const out = {}; for (const t of tasks) { const s = t.props?.status ?? t.status; if (s) out[s] = (out[s] || 0) + 1; } return out; };
const installedEngine = (childRoot) => { try { return JSON.parse(readFileSync(join(childRoot, ENGINE_PKG), 'utf8')).version ?? null; } catch { return null; } };

// R1~R4 항목의 이슈 문구: 무엇이 어긋났고 무엇을 할지(처리는 이슈 계약 값만 쓰고 할 일은 문구에 적는다)
const LINK_OR_DROP = '이 머신에 자식 저장소를 연결하거나, 쓰지 않는 저장소면 표식 파일 목록에서 뺀다';
function driftMessage(rule, it) {
  if (rule === 'R1') return `목록에만 있음 ${show(it.path)}(${it.why === 'missing' ? '폴더 없음' : '.git 없음'}): ${LINK_OR_DROP}`;
  if (rule === 'R2') return `디스크에만 있음 ${it.path}: 표식 파일 목록에 더하거나 상위 폴더 밖으로 옮긴다`;
  if (rule === 'R3') return `상위 색인에 있음 ${it.path}(파일 ${it.files}개): 상위 저장소 색인에서 뺀다(git rm -r --cached)`;
  return `원격 불일치 ${show(it.path)}(목록 ${it.listed || '없음'}, 실제 ${it.actual || '없음'}): 표식 파일의 url 이나 그 저장소의 origin 을 맞춘다`;
}

// 워크스페이스 단계. buildGraph 는 부르는 쪽(cli.mjs)이 넘긴다(순환 import 를 피한다). → { repos } (상위가 첫 행)
export async function workspaceStage(g, root, cfg, { buildGraph, version, engineMajor }) {
  const ws = isObj(cfg.workspace) ? cfg.workspace : {};
  const markerRel = typeof ws.repos === 'string' && ws.repos ? ws.repos : null;
  const children = isObj(ws.children) ? ws.children : {};
  const head = g.get('deploy', 'head')?.props || null;
  // 상위 행은 자식 노드를 합치기 전에 센다
  const top = { path: ROOT_PATH, name: cfg.project?.name || basename(root), role: null, branch: cfg.git?.branch || null, head: head?.sha ?? null, build: 'ok', commits: g.of('commit').length, tasks: statusCounts(g.of('task')), drift: [] };
  const repos = [top];
  const subject = (id) => ({ kind: 'repo', id });

  if (!markerRel) {
    g.issue('error', LABEL, `표식 파일 경로가 없음: ${CONFIG}의 workspace.repos 에 표식 파일 경로(예: .agent/repos.yaml)를 적는다`, { code: 'repos.marker-missing', subject: { kind: 'config', id: 'workspace.repos' } });
    return { repos };
  }
  const audit = auditRepos(root, markerRel);
  if (audit.error?.kind === 'missing') {
    g.issue('error', LABEL, `표식 파일 없음: ${markerRel}. ${CONFIG}의 workspace.repos 경로를 고치거나 표식 파일을 관리하는 하네스 스킬로 표식 파일을 만든다`, { code: 'repos.marker-missing', subject: { kind: 'config', id: 'workspace.repos' } });
    return { repos };
  }
  if (audit.error) {
    const at = audit.error.line ? `${audit.error.line}행` : '읽기 실패';
    g.issue('error', LABEL, `표식 파일을 읽지 못함 ${markerRel} ${at}: 표식 파일 형식(root:·repos: 절, 두 칸 - path:, 네 칸 url·branch·role)에 맞춘다`, {
      code: 'repos.marker-unreadable', subject: { kind: 'config', id: 'workspace.repos' },
      anchors: audit.error.line ? [{ file: markerRel, line: audit.error.line, excerpt: audit.error.text }] : [],
    });
    return { repos };
  }
  if (audit.root.branch) top.branch = audit.root.branch;

  // 어긋남: 항목마다 경고 하나. 저장소 행에는 그 저장소에 걸린 항목을 싣는다
  const driftOf = new Map();
  for (const rule of R_KEYS) {
    for (const it of audit[rule]) {
      if (!driftOf.has(it.path)) driftOf.set(it.path, []);
      driftOf.get(it.path).push({ rule, ...it });
      g.issue('warn', LABEL, driftMessage(rule, it), { code: DRIFT_CODES[rule], subject: subject(it.path) });
    }
  }
  top.drift = driftOf.get(ROOT_PATH) || [];

  for (const entry of audit.repos) {
    const { path } = entry;
    const extra = isObj(children[path]) ? children[path] : {};
    const childRoot = join(root, path);
    const row = {
      path, name: path, role: entry.role || null, branch: entry.branch || null, head: null, build: 'ok', config: null,
      engine: { installed: installedEngine(childRoot), used: version }, board: typeof extra.board === 'string' && extra.board ? extra.board : null,
      commits: 0, tasks: {}, summary: null, drift: driftOf.get(path) || [],
    };
    repos.push(row);
    const name = `repo:${path}`;
    if (audit.worktree) { row.build = 'skipped'; g.report(name, 'partial', 0, WORKTREE_NOTE); continue; }
    if (!isDir(childRoot)) { row.build = 'missing'; g.report(name, 'partial', 0, '폴더 없음'); continue; }

    const resolved = resolveChildConfig(childRoot, { path, branch: entry.branch, sinceDays: cfg.git?.sinceDays, engineMajor, override: extra.config ?? null });
    row.config = resolved.source;
    if (resolved.mismatch) g.issue('warn', LABEL, `엔진 major 불일치 ${path}: ${resolved.mismatch}. 자동 설정으로 대신 읽었다. 자식 저장소의 엔진을 상위와 같은 major 로 맞춘다`, { code: 'repos.child-engine-mismatch', subject: subject(path) });
    let built = null, error = resolved.error;
    if (!error) {
      try { built = await buildGraph(childRoot, { workspace: false, config: resolved.config }); }
      catch (e) { error = String(e?.message || e); }
    }
    if (!built) {
      row.build = 'failed';
      g.report(name, 'partial', 0, `자식 빌드 실패: ${error}`);
      g.issue('warn', LABEL, `자식 빌드 실패 ${path}: ${error}. 자식 저장소의 ${CONFIG}(없으면 상위 workspace.children.${path}.config)를 고친다`, { code: 'repos.child-build-failed', subject: subject(path) });
      continue;
    }
    const count = importChild(g, built.g, path);
    g.report(name, 'ok', count, null);
    const d = built.data;
    const problems = checkProblems(d, built.cfg);
    const errors = problems.filter((p) => p.level === 'error').length;
    Object.assign(row, {
      head: d.head?.sha ?? null, commits: d.commits.length, tasks: statusCounts(d.tasks),
      summary: { stepsLive: d.summary.stepsLive, stepsTotal: d.summary.stepsTotal, warnings: problems.length - errors, deployBehind: d.deploy?.behind ?? null, errors },
    });
  }
  return { repos };
}
