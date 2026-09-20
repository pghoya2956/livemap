# 이행 문서

`map/config.json`의 `engine`은 그 설정이 따르는 엔진 major다. 엔진은 자기 major와 다르면 멈추고 이 문서를 가리킨다. major가 바뀌는 릴리스마다 아래에 절을 더한다.

## 옛 설치 방식 → 1.x

프로젝트 `map/` 안에 엔진 파일을 복사해 쓰던 설치에서 옮길 때.

1. `npm i -D -E @pghoya2956/livemap@<버전>`(예산 검사를 쓰면 `@playwright/test`도 프로젝트 devDependency로 둔다).
2. `map/`에서 엔진 파일을 지운다: `cli.mjs`·`check.mjs`·`derive.mjs`·`serve.mjs`·`lib/`·`site/`의 `index.html`·`map.css`·`map.js`·`tests/`·`scripts/`·`semantic/schema.md`, 그리고 참조 어댑터 사본(`map/adapters/`에서 프로젝트가 직접 쓴 어댑터만 남긴다).
3. 캡처를 옛 화면 폴더(`map/site`) 아래 captures 폴더에서 `map/captures/`로 옮기고 `config.json`의 `captures.site`를 `map/captures`로 바꾼다.
4. `config.json`에 `"engine": 1`을 더한다.
5. npm 스크립트를 `livemap` 명령으로 바꾼다(`livemap init`이 없는 스크립트만 넣고 값이 다른 스크립트는 보고한다). 어댑터 단위 검사 스크립트는 지운다. 참조 어댑터 검사는 엔진 저장소 CI가 돈다.
6. 배포: 이미지 빌드 전에 `npm run map` → `npm run map:export`, 서버는 export 폴더 한 루트를 `/map/`로 준다(`hosting-and-csp.md`).
7. 확인: 전환 전(옛 설치)과 전환 뒤(패키지)를 같은 커밋에서 연속으로 돌려 비교한다.
   - 비교 대상은 `map/.out/`의 `graph.json`·`data.json`·`overview.json`과 `npm run map:check` 출력이다. 전환 전 결과를 다른 폴더에 복사해 두고 전환 뒤 같은 명령으로 다시 만든다.
   - 옛 설치와 같은 판의 엔진으로 옮기면 세 파일이 `generatedAt`을 빼면 같고 `check` 출력도 같다.
   - 전환하면서 엔진 판도 올리면 파일이 같지 않다. minor 판은 필드·노드를 더하기만 하므로, 전환 전 파일의 모든 경로·값이 전환 뒤 파일에 있는지(포함) 보고 새로 생긴 경로가 그 판의 CHANGELOG 항목인지 확인한다. `check`는 전환 전 출력에 CHANGELOG가 적은 새 줄만 더해져야 하고 오류 수는 같아야 한다.
   - 활동 숫자는 실행 시각 기준 14일 창(`git.sinceDays`)이라 두 실행 사이에 창 경계를 넘는 커밋이 있으면 달라진다. 차이가 경계 커밋뿐인지 보고 연속으로 다시 돌린다. `npm ci`와 설치 시간은 두 실행 사이가 아니라 앞에 둔다.
   - 끝으로 `npm run map:budget`이 통과하고 스크린샷 `map/.out/overview-1440.png`이 전환 전과 같은 정보를 보이는지 본다.

로컬에서 고친 엔진을 끼워 볼 때는 `npm install --no-save --install-links <엔진 저장소 경로>`를 쓴다. `--install-links` 없이 폴더를 설치하면 심링크가 되어 예산 설정이 `@playwright/test`를 엔진 저장소 쪽에서 찾다 실패한다.

## 1.x → 2.0.0(예고)

2.0.0은 아직 나오지 않았다. 1.2.0까지 폐기를 예고했거나 1.x 호환 때문에 남긴 항목을 모아 지울 예정이다. 목록은 바뀔 수 있고, 판이 나오면 이 절을 이행 절차로 바꾼다. 1.x에서 미리 옮겨 두면 2.0.0 올림이 설정·참조 수정 없이 끝난다.

| 항목 | 2.0.0 예정 | 1.x에서 미리 할 일 |
|---|---|---|
| 설정 `router.hookApi` | 키를 지운다. 화면→API는 리터럴 관측만 쓴다 | `livemap check`의 `router.hookapi-redundant` 항목을 설정에서 지우고, `router.hookapi-only` 항목은 화면 코드가 경로 리터럴을 쓰게 고친다 |
| `data.json` `tasks[].dec`·`oq`, `overview.json` `counts.oq` | 지운다 | 화면·스크립트가 `openQuestions`·`counts.openQuestions`를 읽게 한다 |
| 1.0.1 잔여 필드(`line`, `running`, `waiting`, `tasks`, 최상위 `openQuestions`, `areas`, `recent`, `roadmap[]`) | 지운다 | `overview.json` 1.1.0 필드를 읽는다 |
| 결정·계획 항목 노드 id | 전역 번호(`DEC-57`)에서 `<작업 폴더>#<번호>`로 | 여정 `refs`를 `<작업 폴더>#<번호>` 한정 참조로 적는다(`tasks.ambiguous-ref` 0) |
| 노드 종류 이름 | `milestone` → `roadmapItem`, `release` → `milestone` | 프로젝트 어댑터·스크립트가 노드 종류 이름에 기대는 곳을 찾아 둔다 |
| 여정 파일 | 설정 `semantic`이 역할별 md 디렉터리를 가리킬 수 있다. 화면·캡처·참조는 대응표(`journeyScreens`)로 옮긴다. `.json` 한 파일도 계속 읽는다 | 단계 ID를 `<여정>/<단계>`로 맞추고, 화면·캡처를 대응표로 옮길 준비를 한다 |
| 읽기 상태 강제 | `partial`·`stale`·`unknown`을 기본으로 오류로 셀지 정한다 | `livemap check --strict`로 과거 작업 채우기가 끝났는지 본다 |
| `config.json` `engine` | `2` | 2.0.0으로 올리는 커밋에서 바꾼다. 엔진은 major가 다르면 멈추고 이 문서를 가리킨다 |

## 2.0.x → 2.1.0

minor 판이라 `engine`은 그대로 `2`이고 엔진이 멈추지 않는다. 아무것도 하지 않아도 2.0.x와 같이 돌지만, 구조 지도를 켜려면 아래를 한다. 삭제와 이름 변경은 없다.

### 올리기만 할 때(구조 지도 없이)

1. `npm i -D -E @pghoya2956/livemap@2.1.0`.
2. `map/config.json`의 `budget.navItems`를 **6**으로 올린다. 「구조」가 내비에 들어가 엔진 내비 항목이 여섯이 됐다. 고치지 않으면 예산 검사가 실패하고, 그전에 `livemap check`가 `budget.nav-items-low`로 먼저 말한다.
3. `livemap build` → `livemap check`. 구조 절이 없으므로 `architecture.*` 이슈는 나오지 않고 「구조」 화면 자리에는 아직 선언이 없다는 안내가 선다.

### 구조 지도를 켤 때

1. **Graphify를 설치한다.** `uvx graphifyy[sql] --help`로 부를 수 있으면 된다. `[sql]` 추가분을 빼면 SQL 함수 노드가 0이 되어 DB 층이 통째로 빈다.
2. 저장소 루트에서 Graphify를 돌려 `graphify-out/graph.json`을 만든다. 읽히지 않을 폴더는 `.graphifyignore`에 적는다 — 폴더 목록을 스크립트에 따로 두면 사람이 계속 맞춰야 한다.
3. `map/config.json`에 `architecture`를 더한다.

   ```json
   "architecture": { "graph": "graphify-out/graph.json", "dir": "map/architecture", "skillFile": ".claude/skills/architecture/SKILL.md" }
   ```

   `skillFile`은 선택이다. 주면 산출물과 같은 본문에 frontmatter를 붙인 사본을 그 경로에 쓰고, 그 사본을 커밋한다.
4. `adapters` 배열을 설정에 **적어 둔** 프로젝트는 거기에 `"graphify"`를 더한다. 배열이 없으면 기본 목록에 들어 있어 그대로 켜진다.
5. `map/architecture/`에 선언을 쓴다. `README.md`에 부품과 바깥 상대를 Mermaid `flowchart`로 그리고, 부품마다 파일 하나에 층과 허용 목록과 기능 흐름을 적는다. 양식은 `docs/architecture-authoring.md`에 있다.
6. `livemap build` → `livemap check`. 처음에는 `architecture.module-unassigned`가 많이 나온다 — 선언한 층 어디에도 안 든 파일들이다. 층을 넓히거나 파일을 옮겨 줄여 나간다.

### 끄기

`architecture.dir`를 비우면 선언 대조와 「구조」 화면이 꺼진다. `adapters` 배열에서 `graphify`를 빼는 것으로는 안 꺼진다 — 다리와 선언 대조가 어댑터가 아니라 그 뒤의 후속 단계이기 때문이다.

### 확인

2.0.x에서 만든 `map/.out/graph.json`·`data.json`·`overview.json`을 따로 복사해 두고 올린 뒤 다시 만들어 비교한다. minor 판이므로 옛 파일의 모든 경로와 값이 새 파일에 그대로 있어야 하고, 새로 생긴 경로는 `data.json`의 `architecture` 절과 `summary`의 다섯(`containers`·`modules`·`communities`·`flows`·`boundaryViolations`), `overview.json`의 `boundaryViolations` 하나다. `check` 출력은 옛 출력에 `architecture.*`와 `budget.nav-items-low`만 더해져야 하고 오류 수는 같아야 한다.
