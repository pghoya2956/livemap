// 여러 저장소 워크스페이스(2.2.0) 화면 순수 함수. JSX 없는 모듈이라 단위 검사가 import한다.
// 상위 저장소의 repo 값은 '.'이고 이름은 프로젝트 이름이다. 자식 행의 경로 값(planFile·judged 등)은 자식 루트 기준이라 화면에서 '<repo>/' 를 붙여 보인다.

export const BUILD_WORD = { ok: '정상', failed: '빌드 실패', missing: '폴더 없음', skipped: '워크트리라 건너뜀' };
export const CONFIG_WORD = { child: '자식 설정', override: '대체 설정', auto: '자동 설정' };
export const DRIFT_WORD = { R1: '목록에만 있음', R2: '디스크에만 있음', R3: '상위 색인에 있음', R4: '원격 불일치' };

/** 저장소 이름: 상위('.')는 프로젝트 이름, 자식은 표식의 path. */
export const repoLabel = (repo, projectName) => (!repo || repo === '.' ? projectName || '상위' : repo);

/** 자식 루트 기준 경로를 저장소 표시와 함께. 상위('.')·워크스페이스 밖(repo 없음)은 그대로. */
export const repoPath = (repo, path) => (repo && repo !== '.' && path ? `${repo}/${path}` : path);

/** 저장소 접두를 뗀 작업 폴더 이름(<path>:<폴더> → <폴더>). */
export const bareTask = (name, repo) => (repo && repo !== '.' && String(name).startsWith(`${repo}:`) ? String(name).slice(repo.length + 1) : name);

/** 상황판 주소: http:·https: 로 시작할 때만 링크로 쓴다. 그 밖의 값은 null(화면은 글자로 보인다). */
export const boardHref = (board) => (typeof board === 'string' && /^https?:\/\//i.test(board) ? board : null);

/** 개요 전광판 저장소 항목(DEC-27): 자식마다 하나. 동작 단계가 있으면 「<이름> 동작 단계 x/y」, 없으면 「<이름> 14일 변경 n」.
 *  repos 는 overview.json 의 repos(상위가 첫 행)이고 첫 행은 빼고 센다. */
export function repoTickerItems(repos = []) {
  return repos.slice(1).map((r) => (r.stepsTotal
    ? { label: `${r.name} 동작 단계`, project: true, value: `${r.stepsLive ?? 0}/${r.stepsTotal}` }
    : { label: `${r.name} 14일 변경`, project: true, value: r.commits ?? 0 }));
}

/** 저장소 필터 칩: 저장소 절 순서로 [{ repo, label, count }]. 행이 없는 저장소도 0으로 남긴다(필터가 저장소 목록과 같다). */
export function repoFilters(repos = [], rows = [], projectName) {
  const n = new Map();
  for (const r of rows) n.set(r.repo ?? '.', (n.get(r.repo ?? '.') || 0) + 1);
  return repos.map((r) => ({ repo: r.path, label: repoLabel(r.path, projectName), count: n.get(r.path) || 0 }));
}

// ── 제품 축이 빈 개요(2.3.0) ──
/** 제품 축 있음(2.2.0 구성): 마일스톤·진척·최근 변경·기능 지도·기능별 변경·특보·화면 캡처·기능 현황. 화면은 이 경우 2.2.0 DOM 그대로 그린다 */
export const PRODUCT_SLOTS = ['ms', 'progress', 'changes', 'map', 'trend', 'signals', 'capture', 'table'];

/** 개요 자리 8개의 패널 키(DEC-3·24). 자리 순서는 왼쪽 셋 → 가운데 큰 칸 → 가운데 아래 둘 → 오른쪽 둘이다.
 *  제품 축이 비면(productEmpty) 저장소·작업 패널로 바꾸고, 로드맵이나 마일스톤이 있으면 첫 자리는 마일스톤·로드맵 패널 그대로 두고 진행 작업 분포를 뺀다.
 *  새 패널 키는 그대로 패널 클래스다(검사·크롤 선택자). */
export function overviewSlots(d) {
  if (!d.productEmpty) return PRODUCT_SLOTS;
  const roadmap = (d.roadmapItems?.length ?? 0) > 0 || (d.milestones?.length ?? 0) > 0;
  return roadmap
    ? ['ms', 'repos', 'changes', 'work-tasks', 'repo-trend', 'signals', 'ledger', 'decisions']
    : ['repos', 'spread', 'changes', 'work-tasks', 'repo-trend', 'signals', 'ledger', 'decisions'];
}

/** 저장소 표 행(DEC-5·7): 워크스페이스면 개요 repos(상위가 첫 행), 아니면 프로젝트 한 행. HEAD·상황판 주소는 싣지 않는다.
 *  상태 낱말은 빌드가 정상이 아니면 빌드 낱말(warn), 동작 단계가 있으면 「x/y 동작」, 없으면 「정상」. */
export function repoRows(d) {
  const word = (r) => (r.build !== 'ok' ? BUILD_WORD[r.build] || r.build : r.stepsTotal ? `${r.stepsLive ?? 0}/${r.stepsTotal} 동작` : BUILD_WORD.ok);
  if (d.repos?.length) return d.repos.map((r, i) => ({ name: r.name, top: i === 0, commits: r.commits ?? 0, running: r.running ?? 0, word: word(r), warn: r.build !== 'ok' }));
  return [{ name: d.project?.name || '상위', top: false, commits: d.activity?.total ?? 0, running: d.counts?.tasksRunning ?? 0, word: BUILD_WORD.ok, warn: false }];
}

/** 진행 작업의 단계별 수: 많은 순, 같으면 먼저 나온 단계가 앞. [{ stage, n }] */
export function stageCounts(tasks = []) {
  const n = new Map();
  for (const t of tasks) n.set(t.stage || '—', (n.get(t.stage || '—') || 0) + 1);
  return [...n].map(([stage, k]) => ({ stage, n: k })).sort((a, b) => b.n - a.n);
}

/** 진행 중인 작업 저장소 칩(DEC-6·27): 워크스페이스이고 진행 작업이 있을 때만. 첫 칩은 전체(repo null), 나머지는 저장소 절 순서이고 0건도 남긴다. */
export function workRepoFilters(d) {
  const tasks = d.work?.tasks ?? [];
  if (!d.repos?.length || !tasks.length) return [];
  const n = new Map();
  for (const t of tasks) n.set(t.repo, (n.get(t.repo) || 0) + 1);
  return [{ repo: null, label: '모든 저장소', count: tasks.length }, ...d.repos.map((r) => ({ repo: r.name, label: r.name, count: n.get(r.name) || 0 }))];
}

/** 장부 행 링크: 작업 링크가 풀린 행만 작업 화면으로 간다. 없으면 null(정적 행) */
export const ledgerHref = (row) => (row?.task ? `#/tasks/${encodeURIComponent(row.task)}` : null);

/** 장부 메모 다시 자르기(DEC-18): 엔진과 같은 끝 문장 규칙. max자를 넘으면 끝 max자 안의 첫 문장 끝(. ! ? 뒤 공백) 다음부터,
 *  없으면 첫 공백 다음부터 남기고 앞에 「…」. 화면 줄이 모자랄 때 max를 줄여 다시 부른다. 엔진이 붙인 앞 「…」은 떼고 센다 */
export function noteTail(text, max) {
  const s = String(text ?? '').replace(/^…/, '');
  const cp = [...s];
  if (cp.length <= max) return String(text ?? '');
  const tail = cp.slice(-max).join('');
  const m = tail.match(/[.!?]\s/) ?? tail.match(/\s/);
  return `…${m ? tail.slice(m.index + m[0].length) : tail}`;
}
