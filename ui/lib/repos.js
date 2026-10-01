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
