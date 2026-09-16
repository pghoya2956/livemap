# livemap

Project status board engine. It scans a repository (routes, API handlers, migrations, tests, task docs, git history, deploy manifests) into a graph and serves a one-screen board of journeys, screens, APIs, tests and work in progress. No runtime dependencies, Node 22.

저장소를 스캔해 "어디까지 실제로 동작하나, 지금 무엇을 하나, 무엇이 바뀌었나"를 한 화면에 보여주는 상황판 엔진이다. 프로젝트 코드를 실행하지 않고 파일과 git만 읽는다.

## 설치

```bash
npm i -D -E @pghoya2956/livemap
npm i -D -E @playwright/test@1.63.0   # 화면 예산 검사를 쓸 때만
npx --no livemap init                 # map/ 초안·.gitignore·npm 스크립트
```

`init`이 만드는 것: `map/config.json`, `map/semantic/journeys.json`, `map/README.md`, `map/captures/README.md`, `.gitignore`의 `map/.out/`, npm 스크립트 `map`·`map:check`·`map:serve`·`map:export`·`test:report`(Playwright가 있으면 `map:budget`). 다시 실행하면 아무것도 바꾸지 않는다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `livemap build [--out map/.out]` | 스캔 → `graph.json`·`data.json`·`overview.json` |
| `livemap check` | 정합 검사. 오류가 있으면 exit 1 |
| `livemap serve [--port 4180]` | `http://127.0.0.1:4180/map/`, 요청마다 재빌드(5초 캐시) |
| `livemap serve --static <dir>` | export 폴더를 재빌드 없이 같은 배치로 |
| `livemap export <dir>` | 화면·서체·캡처·생성물을 `/map/` 배치 그대로 한 폴더에 |
| `livemap test-report` | 단위 검사를 JUnit으로(`config.tests`) |
| `livemap --version` | 버전 |
| 화면 예산 | `npx --no playwright test --config node_modules/@pghoya2956/livemap/budget/playwright.config.mjs` |

명령은 프로젝트 루트에서 부른다. CI에서는 npm 스크립트나 `npx --no livemap`을 쓴다.

## 설정

`map/config.json` 하나가 프로젝트별이다. 참조 어댑터는 React Router + Node BFF + SQL migration + Markdown 작업 문서 관례를 읽는다. 스택이 다르면 `map/adapters/<이름>.mjs`에 프로젝트 어댑터를 둔다.

```json
{
  "engine": 1,
  "project": { "name": "ReefDesk", "host": "https://reefdesk.example.invalid" },
  "adapters": ["router", "bff", "migrations", "tests", "wiki", "tasks", "roadmap", "git", "deploy", "testreport"],
  "router": { "app": "web/src/App.tsx", "pagesDir": "web/src/pages", "localDirs": ["web/src/pages"], "mockPattern": "/mock'", "livePattern": "lib/queries", "hookApi": { "Bookings": "/api/bookings" } },
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

## 문서

| 문서 | 내용 |
|---|---|
| [docs/adapter-contract.md](docs/adapter-contract.md) | 어댑터 시그니처·노드·엣지·프로젝트 어댑터 |
| [docs/semantic-authoring.md](docs/semantic-authoring.md) | 여정 파일 작성 |
| [docs/semantic-schema.md](docs/semantic-schema.md) | 시맨틱 레이어 모델 |
| [docs/hosting-and-csp.md](docs/hosting-and-csp.md) | export·정적 서빙·CSP·CI |
| [docs/view-budget.md](docs/view-budget.md) | 화면 예산 규칙 |
| [docs/migrate.md](docs/migrate.md) | major 이행 |

## 버전

semver. 프로젝트는 정확한 버전으로 고정한다(`-E`). `config.json` 키, 여정 형식, 어댑터 계약, 명령·종료 코드, 생성물 파일 이름, export 배치, 예산 설정 경로를 바꾸면 major다. 변경 기록은 [CHANGELOG.md](CHANGELOG.md).

## 라이선스

MIT. `site/fonts/`의 Pretendard Variable은 SIL Open Font License 1.1이다.
