# 검사 결과

상황판의 검사 신호, 검사 파일별 마지막 실행, 기능 단계 등급 A는 검사 결과 JSON에서 읽는다(1.2.0). 러너가 파일마다 낸 실행 수·통과·실패를 그대로 받고, 결과를 만든 커밋 뒤에 코드가 바뀌었는지로 결과가 최신인지 정한다. 엔진은 검사를 해석하거나 다시 돌리지 않는다.

## 결과 JSON

경로는 설정 `tests.report`와 같은 폴더의 `test-results.json`이다(기본 `map/.out/test-results.json`). livemap이 소유하는 형식이고 필드 이름은 CTRF를 따른다.

```json
{
  "schema": 1,
  "runs": [
    {
      "runner": "node",
      "source": "livemap test-report",
      "sha": "4f1c2d0e9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
      "dirtyPaths": [],
      "at": "2026-01-01T01:02:03.000Z",
      "exit": 1,
      "outsideRoot": 0,
      "files": [
        { "filePath": "tests/booking.test.mjs", "tests": 36, "passed": 35, "failed": 1, "skipped": 0, "pending": 0, "tags": [] }
      ]
    },
    {
      "runner": "playwright",
      "source": "map/.out/playwright.json",
      "stamped": "import",
      "sha": "4f1c2d0e9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
      "dirtyPaths": [],
      "at": "2026-01-01T01:10:00.000Z",
      "exit": null,
      "outsideRoot": 0,
      "files": [
        { "filePath": "tests/search.spec.mjs", "tests": 10, "passed": 10, "failed": 0, "skipped": 0, "pending": 0, "flaky": 0, "tags": ["diver/search"] }
      ]
    }
  ]
}
```

| 필드 | 뜻 |
|---|---|
| `runner` | `node`, `playwright`, `junit` |
| `source` | 실행 출처. `livemap test-report`, 가져온 파일의 루트 기준 경로 |
| `stamped` | `import`면 `sha`·`dirtyPaths`를 러너가 아니라 가져올 때 적었다 |
| `sha` | 실행한 커밋(`git rev-parse HEAD`). git이 없으면 `null` |
| `dirtyPaths` | 실행 때 커밋되지 않은 변경 경로(`git status --porcelain`, 루트 기준 정렬) |
| `at` | 실행 시각(UTC ISO). Playwright는 `stats.startTime`, JUnit은 첫 `testsuite`의 `timestamp` |
| `exit` | 러너 종료 코드. 모르면 `null` |
| `outsideRoot` | 프로젝트 루트 밖이라 뺀 파일 수 |
| `files[]` | 파일별 `tests`·`passed`·`failed`·`skipped`·`pending`, Playwright만 `flaky`, 러너 태그 `tags` |
| `totals` | JUnit 실행만. 파일 속성이 없어 `files`가 비어도 실행 전체 합계가 남는다 |

- 같은 러너·같은 출처의 실행은 바꾸고, 새 실행은 뒤에 붙인다. 파일은 임시 파일에 쓴 뒤 이름을 바꿔 넣어, 두 실행이 동시에 써도 깨지지 않고 나중 실행이 남는다.
- `filePath`는 검사 노드 id(검사 파일 경로)와 글자 그대로 맞춘다. `tests/booking.test.mjs`의 결과는 `tests/booking-journey.test.mjs`에 붙지 않는다.

## 결과 만들기

### Node 검사: livemap test-report

```bash
npx --no livemap test-report
```

`tests.dir`의 `*.test.mjs`를 `node --test`로 한 번 돌리면서 JUnit 리포터(1.x 호환 `tests.report`와 옆 `.json` 메타)와 livemap 리포터를 함께 붙인다. 결과 JSON의 `node`·`livemap test-report` 실행을 바꾸고, 종료 코드는 러너 종료 코드다. 이 명령을 `node --test` 안에서 불러도(검사 래퍼) 자식 러너가 파일을 건너뛰지 않는다.

### Node 검사: 리포터를 기존 명령에 붙이기

검사 명령이 따로 있으면(파일 목록·환경 변수·제외 파일) 그 명령에 livemap 리포터를 더하고 출력 파일을 가져온다.

```bash
node --test \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=@pghoya2956/livemap/src/reporters/node-results.mjs \
  --test-reporter-destination=map/.out/node-results.json \
  tests/*.test.mjs
npx --no livemap test-report --import map/.out/node-results.json
```

- 리포터 경로 `@pghoya2956/livemap/src/reporters/node-results.mjs`는 공개 경로다. 옮기면 major다.
- 리포터는 `test:pass`·`test:fail` 이벤트에서 `details.type`이 `suite`인 것을 빼고 파일별로 센다. `skip`이면 `skipped`, `todo`면 `pending`이다. 불러오기에 실패한 파일은 실패 1로 센다. Node v22.0.0 문서에 있는 이벤트 필드만 쓰고 `test:summary`는 쓰지 않는다.
- 리포터는 러너의 작업 폴더를 프로젝트 루트로 본다. 프로젝트 루트에서 러너를 부른다.
- 리포터는 종료 코드를 모르므로 출력의 `exit`는 `null`이다. 실패 신호는 파일별 `failed`로 난다.

### Playwright

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=map/.out/playwright.json npx --no playwright test --reporter=list,json
npx --no livemap test-report --import map/.out/playwright.json
```

- 파일은 `config.rootDir`와 `suites[].file`(중첩 suite 포함)을 합친 경로다. 결과는 `tests[].status`로 센다: `expected` 통과, `unexpected` 실패, `flaky` 통과이며 `flaky` 수에 더함, `skipped` 건너뜀. 태그는 `specs[].tags`의 합집합이다(`@`를 뗀 값, Playwright 1.63.0 실측).
- Playwright `outputDir`(기본 `test-results/`)가 작업트리 안에 생기고 git이 무시하지 않으면 가져올 때 `dirtyPaths`에 들어가 결과가 낡는다. `.gitignore`에 넣거나 `map/.out/` 아래로 둔다.

### JUnit

```bash
npx --no livemap test-report --import reports/junit.xml --sha "$(git rev-parse HEAD)"
```

최상위·중첩 `<testcase>`를 모두 센다. `file` 속성(없으면 가장 가까운 `testsuite`의 속성)이 있으면 파일별로 나누고, 없으면 실행 합계(`totals`)만 남는다.

### --import 규칙

- 형식은 내용으로 가린다. `schema 1`과 `runs` 배열이면 livemap 결과(리포터 출력 포함), `config` 객체와 `suites` 배열이면 Playwright JSON, `<testsuites`·`<testsuite`·`<testcase`가 있으면 JUnit이다. 가릴 수 없거나 파일이 없으면 종료 코드 2이고 결과 JSON을 쓰지 않는다.
- livemap 결과는 파일에 적힌 `sha`·`dirtyPaths`·`at`을 지킨다. `source`가 `null`인 실행(리포터 출력)만 가져온 파일 경로를 채운다.
- Playwright·JUnit 출력에는 커밋이 없어 `--sha`(없으면 가져올 때의 HEAD)와 가져올 때의 `dirtyPaths`를 적고 `stamped: "import"`를 남긴다. 러너를 돌린 커밋과 가져오는 커밋이 다르면 `--sha`로 실행 커밋을 준다. 오래된 결과를 지금 HEAD로 가져오면 최신으로 보이므로 CI에서는 러너 바로 뒤에 가져온다.

## 최신 판정

testreport 어댑터는 결과 JSON이 있으면 그것만 읽는다. 실행마다 다음 셋이 모두 맞으면 최신이다.

1. 실행 `sha`가 git 어댑터의 HEAD(`git.branch` → origin → HEAD)와 같거나 그 조상이다.
2. `sha` 뒤 HEAD까지 문서 경로 밖을 바꾼 커밋이 0이다(`git rev-list --count <sha>..<HEAD> -- . ':(exclude)<문서 경로>'…`).
3. `dirtyPaths`에 문서 경로 밖 경로가 없다. `dirtyPaths`가 없는 실행(JUnit 메타)은 이 조건을 건너뛴다.

문서 경로는 새 설정 키 없이 기존 설정에서 정한다: `tasks.dir`, `wiki.index`의 폴더(루트 파일이면 그 파일), `semantic`, `roadmap.file`, `captures.site`, `deploy.manifest`, `map/judgments`. 설정에 없는 키는 뺀다. 코드·CI·로컬 스택·설정 파일 변경은 모두 결과를 낡게 한다. 그래서 작업 문서·판정 파일·여정만 바꾼 커밋 뒤에도 결과는 최신으로 남고, 코드를 바꾼 커밋 뒤에는 다시 돌려야 최신이 된다.

결과가 최신이 아니면 검사 노드 `readingNotes.lastRun`에 이유가 남는다.

| 이유 문장 | 뜻 |
|---|---|
| 결과 커밋이 이력에 없음 | git이 없거나 얕은 클론이라 `sha`를 찾지 못함 |
| 결과 커밋이 HEAD의 조상이 아님 | 다른 브랜치에서 낸 결과 |
| 결과 커밋 뒤 문서 경로 밖 변경 커밋 n | 조건 2 |
| 실행 때 문서 경로 밖 변경 n(경로 3개까지) | 조건 3 |
| 결과에 이 검사 파일이 없음 | 결과 JSON에 그 파일이 없음(`lastRun` 읽기 상태 `unknown`) |
| JUnit에 파일(file 속성)이 없어 파일별 결과 없음 | JUnit 대체 읽기에서 파일을 나눌 수 없음 |

## 상황판에 들어가는 값

- 검사 노드 `props.lastRun`: `passed`(`failed === 0`), `tests`, `failed`, `skipped`, `pending`, `flaky`(Playwright만), `runner`, `sha`, `at`, `fresh`, `tags`(러너 태그). 같은 파일이 여러 실행에 있으면 최신 실행을 먼저, 같으면 나중 `at`을 쓴다.
- 검사 개수: 최신 결과가 있는 파일은 실행 수로 바꾸고 `count` 읽기 상태가 `observed`다. 낡은 결과는 개수를 바꾸지 않고 `runCount`에만 싣는다.
- 개요 `signals.tests`: 최신 실행 중 실패가 있거나 `exit`가 0이 아니면 `fail`, 실행이 모두 최신이고 실패 0이면 `ok`, 최신이 아닌 실행이 있으면 `stale`, 실행이 없으면 `none`.
- 등급 A: 단계의 화면·API·함수를 덮는 검사 파일 중 하나 이상이 최신 실행에서 `tests` 1 이상, `failed` 0이다.
- `data.json` `testRuns[]`: `{ runner, source, sha, at, exit, fresh }`. `dirtyPaths`는 싣지 않는다(`data.json`은 서빙된다).

결과 JSON이 없으면 1.x처럼 `tests.report`(JUnit)와 옆 메타(`sha`·`exit`)를 같은 해석기로 읽는다. 메타 `exit`가 0이 아니면 실패다. 둘 다 없으면 어댑터 상태가 partial "검사 리포트 없음(npm run test:report 미실행)"이고 검사 `lastRun` 읽기 상태는 `unknown`이다.

## CI 배선 예

검사 잡과 상황판 이미지·정적 사이트 빌드 잡이 따로 도는 파이프라인의 예다. 검사 잡이 결과 JSON을 아티팩트로 올리고, 빌드 잡이 `livemap build` 전에 받는다.

```yaml
jobs:
  tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: >
          node --test
          --test-reporter=spec --test-reporter-destination=stdout
          --test-reporter=@pghoya2956/livemap/src/reporters/node-results.mjs
          --test-reporter-destination=map/.out/node-results.json
          tests/*.test.mjs
      - run: npx --no playwright test --reporter=list,json
        env: { PLAYWRIGHT_JSON_OUTPUT_NAME: map/.out/playwright.json }
      - if: always()
        run: |
          npx --no livemap test-report --import map/.out/node-results.json
          npx --no livemap test-report --import map/.out/playwright.json
      - if: always()
        uses: actions/upload-artifact@v4
        with: { name: test-results, path: map/.out/test-results.json }

  board:
    needs: [tests]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { name: test-results, path: map/.out }
        continue-on-error: true
      - run: npm run map && npm run map:export
```

- `fetch-depth: 0`이 없으면 얕은 클론이라 결과 커밋을 찾지 못해 검사 신호가 "?"다.
- 빌드 잡이 검사 잡을 기다리지 않는 파이프라인(검사가 제품 경로가 바뀐 push에서만 돌거나 이미지와 동시에 도는 경우)은 가장 최근에 결과 아티팩트를 올린 실행에서 받는다(`gh run list`로 실행을 찾고 `gh run download`, 잡 권한에 `actions: read`). 문서만 바꾼 push의 상황판은 그 결과를 최신으로 싣고, 코드를 바꾼 push는 그 커밋 검사가 끝나기 전이라 검사 신호가 "?"(stale)다.
- 로컬에서는 검사를 돌린 세션이 `npm run test:report`와 브라우저 검사 `--import`로 결과 JSON을 갱신한다. `map:serve`는 코드가 그대로인 동안 그 결과를 최신으로 본다.
