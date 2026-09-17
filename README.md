# livemap

Project status board engine. It scans a repository (routes, API handlers, migrations, tests, task docs, git history, deploy manifests) into a graph and serves a one-screen board of journeys, screens, APIs, tests and work in progress. No runtime dependencies, Node 22.

저장소를 스캔해 "어디까지 실제로 동작하나, 지금 무엇을 하나, 무엇이 바뀌었나"를 한 화면에 보여주는 상황판 엔진이다. 프로젝트 코드를 실행하지 않고 파일과 git만 읽는다.

## 설치

```bash
npm i -D -E @pghoya2956/livemap
npm i -D -E @playwright/test@1.63.0   # 화면 예산 검사를 쓸 때만
npx --no livemap init                 # map/ 초안·.gitignore·npm 스크립트·커밋 전 훅
```

`init`이 만드는 것: `map/config.json`, `map/semantic/journeys.json`, `map/README.md`, `map/captures/README.md`, `.gitignore`의 `map/.out/`, npm 스크립트 `map`·`map:check`·`map:serve`·`map:export`·`test:report`(Playwright가 있으면 `map:budget`), 커밋 전 훅 `.githooks/pre-commit`과 `git config core.hooksPath .githooks`(1.2.0, 아래 「커밋 전 훅」). 다시 실행하면 아무것도 바꾸지 않는다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `livemap build [--out map/.out]` | 스캔 → `graph.json`·`data.json`·`overview.json` |
| `livemap check [--json] [--strict]` | 정합 검사. 오류가 있으면 exit 1. `--json`은 stdout에 이슈 JSON만, `--strict`는 `tasks.*`·`judgment.*` 경고도 오류로 센다([docs/issue-codes.md](docs/issue-codes.md)) |
| `livemap check --staged` | 커밋 전 훅용. 스테이징한 작업 문서·판정 파일에 걸린 문제만 오류로 센다 |
| `livemap serve [--port 4180]` | `http://127.0.0.1:4180/map/`, 요청마다 재빌드(5초 캐시) |
| `livemap serve --static <dir>` | export 폴더를 재빌드 없이 같은 배치로 |
| `livemap export <dir>` | 화면·서체·캡처·생성물을 `/map/` 배치 그대로 한 폴더에 |
| `livemap test-report` | 단위 검사를 JUnit과 결과 JSON으로(`config.tests`) |
| `livemap test-report --import <파일> [--sha <커밋>]` | livemap 리포터·Playwright JSON·JUnit 출력을 결과 JSON에 넣는다([docs/test-results.md](docs/test-results.md)) |
| `livemap --version` | 버전 |
| 화면 예산 | `npx --no playwright test --config node_modules/@pghoya2956/livemap/budget/playwright.config.mjs` |

명령은 프로젝트 루트에서 부른다. CI에서는 npm 스크립트나 `npx --no livemap`을 쓴다.

`npx`로 부를 때 엔진 옵션은 `--` 뒤에 둔다. `npx --no livemap --version`은 `--version`을 npx가 가져가 npm 버전을 출력한다. `npx --no livemap -- --version` 또는 `node_modules/.bin/livemap --version`을 쓴다.

## 로컬 엔진 끼워 보기

엔진 저장소에서 고친 판을 쓰는 프로젝트에서 확인할 때는 `npm install --no-save --install-links <엔진 저장소 경로>`를 쓴다. `package.json`·lockfile은 바뀌지 않고, `npm ci`가 끼운 판을 걷어낸다. `--install-links` 없이 폴더를 설치하면 심링크가 되어 화면 예산 설정이 `@playwright/test`를 엔진 저장소 쪽에서 찾다 실패한다.

## 설정

`map/config.json` 하나가 프로젝트별이다. 참조 어댑터는 React Router + Node BFF + SQL migration + Markdown 작업 문서 관례를 읽는다. 스택이 다르면 `map/adapters/<이름>.mjs`에 프로젝트 어댑터를 둔다.

```json
{
  "engine": 1,
  "project": { "name": "ReefDesk", "host": "https://reefdesk.example.invalid" },
  "adapters": ["router", "bff", "migrations", "tests", "wiki", "tasks", "roadmap", "git", "deploy", "testreport"],
  "router": { "app": "web/src/App.tsx", "pagesDir": "web/src/pages", "localDirs": ["web/src/pages"], "mockPattern": "/mock'", "livePattern": "lib/queries" },
  "bff": { "server": "app/server.mjs" },
  "migrations": { "dir": "db/migrations" },
  "tests": { "dir": "tests", "gatePattern": "ALLOW_DESTRUCTIVE", "report": "map/.out/junit.xml" },
  "git": { "branch": "main", "sinceDays": 14, "areas": [["web/", "화면"], ["app/", "서버"]], "runtimePaths": ["web", "app"] },
  "semantic": "map/semantic/journeys.json",
  "captures": { "site": "map/captures" },
  "floors": { "screen": 5, "api": 3 },
  "budget": { "viewport": [1440, 900], "maxPanels": 8, "maxRowsPerPanel": 6, "navItems": 5 }
}
```

화면→API 호출은 1.2.0부터 화면 코드의 `/api/` 문자열 리터럴로 관측하므로 hook 이름 대응표 `router.hookApi`는 폐기 예정이다.
1.x 동안은 설정에 있으면 계속 읽고, `livemap check`가 항목마다 지워도 되는지(`router.hookapi-redundant`) 리터럴로 안 잡히는지(`router.hookapi-only`) 알린다.
2.0.0에서 키를 지운다([docs/migrate.md](docs/migrate.md)).

## 커밋 전 훅

`livemap init`은 git 저장소 루트에서 `.githooks/pre-commit`(`npx --no livemap check --staged`)을 만들고 `git config core.hooksPath .githooks`를 둔다. 작업 폴더 문서나 `map/judgments/` 판정 파일을 스테이징한 커밋에서, 그 파일에 걸린 `tasks.*`·`judgment.*` 문제가 있으면 종료 코드 1로 커밋을 멈춘다. 출력에는 문제 코드, 근거 줄, 판정 초안이 나온다. 에이전트 세션이 원문을 규칙대로 고치거나 판정 파일을 써서 스테이징하고 다시 커밋한다. `--no-verify`로 넘기지 않는다.

- 대상 파일이 없는 커밋(코드만 바꾼 커밋)은 빌드하지 않고 통과한다.
- `core.hooksPath`는 git 설정이라 클론마다 `livemap init`을 한 번 돌린다.
- 이미 다른 `core.hooksPath`나 훅 관리자(husky·lefthook·pre-commit), `.git/hooks/pre-commit`이 있으면 덮지 않고 그 설정에 넣을 한 줄을 출력한다.
- 규칙과 판정 파일은 [docs/semantic-authoring.md](docs/semantic-authoring.md) 「작업 문서」.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/adapter-contract.md](docs/adapter-contract.md) | 어댑터 시그니처·노드·엣지·프로젝트 어댑터 |
| [docs/semantic-authoring.md](docs/semantic-authoring.md) | 여정 파일·작업 문서·판정 파일 작성 |
| [docs/semantic-schema.md](docs/semantic-schema.md) | 시맨틱 레이어 모델, 읽기 상태, 생성물 필드 |
| [docs/issue-codes.md](docs/issue-codes.md) | check 이슈 코드·JSON 출력·커밋 전 훅 |
| [docs/test-results.md](docs/test-results.md) | 검사 결과 JSON·최신 판정·리포터·CI 배선 |
| [docs/hosting-and-csp.md](docs/hosting-and-csp.md) | export·정적 서빙·CSP·CI |
| [docs/view-budget.md](docs/view-budget.md) | 화면 예산 규칙 |
| [docs/migrate.md](docs/migrate.md) | major 이행 |

## 버전

semver. 프로젝트는 정확한 버전으로 고정한다(`-E`). `config.json` 키, 여정 형식, 어댑터 계약, 명령·종료 코드, 생성물 파일 이름, export 배치, 예산 설정 경로를 바꾸면 major다. 변경 기록은 [CHANGELOG.md](CHANGELOG.md).

## 라이선스

MIT. `site/fonts/`의 Pretendard Variable은 SIL Open Font License 1.1이다.
