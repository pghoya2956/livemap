# Changelog

버전마다 `## [X.Y.Z] - YYYY-MM-DD` 절을 둔다. 릴리스 워크플로가 태그 버전의 절이 있는지 확인한다.

## [미배포]

### 고친 것

- 하위 명령에 붙인 `--help`·`-h`가 도움말을 내고 명령을 실행하지 않는다. 그전에는 `--help`를 첫 인자일 때만 도움말로 읽어서 `livemap init --help`가 도움말 대신 `init`을 실행했다. 빈 폴더에서 물으면 `map/` 뼈대와 `.gitignore` 줄을 만들고 종료 코드 0으로 끝났다. 값을 뒤에 받는 플래그의 값 자리(`--root --help` 등)는 그대로 값으로 읽는다.

### 추가

- 팩 내용 계약 검사(`test/pack-contents.test.mjs`): 소비 프로젝트가 쓰는 것(실행기·엔진·화면·예산 설정·템플릿·문서·공개 리포터 경로)이 팩에 있고 저장소 개발 도구(`scripts/`)가 새어 들어가지 않는지 본다. 문서가 소비자용이라고 적은 것과 실제 팩이 어긋나던 자리를 검사로 막는다.

### 고침(문서)

- 1.3.0 절의 클릭 대상 크롤러 항목은 소비 프로젝트용 변경이 아니다. 크롤러(`scripts/route-crawl.mjs`)는 npm 팩에 들어가지 않는 엔진 저장소 개발 도구이고 `scripts/smoke.sh`·`scripts/leak-scan.sh`와 같은 부류다. 팩에 들어가는 것은 `package.json`의 `files`가 정한 일곱(`bin/`·`src/`·`site/`·`budget/`·`templates/`·`docs/`·`CHANGELOG.md`)뿐이다. 소비 프로젝트가 돌리는 화면 검사는 팩에 든 `budget/`이다.

## [2.0.0] - 2026-09-19

여정 정본을 역할별 마크다운 디렉터리에서 읽고, 정본 자체의 어긋남과 정본↔검사 양방향을 검사한다.

### 깨지는 변경

- 설정 `semantic`이 디렉터리를 가리키면 역할별 md를 읽는다. `.json` 한 파일도 그대로 읽으므로 1.x 프로젝트는 설정을 바꾸지 않으면 동작이 같다.
- 화면 주소·캡처·참조는 정본에 두지 않고 프로젝트 대응표(설정 `journeyScreens`, 기본 `map/journey-screens.json`)에서 읽는다.
- md 정본을 읽는 프로젝트에서 `step.no-test`가 오류다. 검사가 없는 단계는 대응표 `noTest`에 이유를 적어 면제한다.

### 추가

- `src/lib/journeys-md.mjs`: README 표에서 배우 사전·상태 어휘, 역할 파일에서 여정·단계·상태·사용자 확인·하위 유형 시작 지점·넘겨받는 일·단계 넘김을 읽는다.
- 정본 검사 코드 다섯: `journey.subtype-unknown`·`journey.handoff-missing-step`·`journey.handoff-unpaired`·`journey.start-unknown`·`journey.doc-changed-after-review`.
- 양방향 코드 둘: `step.no-test`(정본 → 검사), `tests.route-not-in-journey`(검사 → 정본).
- `build`·`check`에 `--semantic <경로>`. 다른 판의 정본으로 산출을 재현할 때 쓴다.

### 고침

- 화면 없이 API로만 도는 단계(알림 발송 등)는 선언한 API가 모두 코드에 있으면 관측으로 본다. 전에는 화면이 없으면 무조건 등급 D라 정본의 `동작` 주장이 오류가 됐다.
- 검사 어댑터가 단계 태그를 풀 때 여정 정본을 같은 읽개로 읽는다. `JSON.parse`만 하던 탓에 md 정본에서 태그 연결이 조용히 사라져 검사→화면 엣지가 줄던 자리다.

## [1.4.0] - 2026-09-19

작업 문서·검사 파일을 읽는 규칙을 넓히고 바뀐 화면의 검사를 고르는 명령을 더한다. 더하기만 하고 지우는 것은 없다.

### 추가

- `livemap affected [--base <ref>]`: 바뀐 파일 → 그 파일을 쓰는 화면 → 그 화면을 지나는 브라우저 검사와 실행 명령. 화면 밖 코드가 섞이면 전체 실행, 문서 경로만 바뀌면 고를 검사 없음.
- 검사 어댑터가 Playwright 단계 태그 `@<여정>/<단계>`를 읽어 검사를 그 단계의 화면에 잇는다. 여정에 없는 태그는 `tests.tag-unknown` 경고이고, 템플릿 태그는 읽기 상태 `partial`이다.
- `src/lib/md-props.mjs`: 제목 2단 절마다 `- 키: 값`·목표 문장·표를 읽는 파서. 로드맵 어댑터가 이것을 쓴다.
- `src/lib/literals.mjs`에 `extractPathLiterals`(임의 접두어).

### 고침

- 검사→화면 연결을 이동 호출(`page.goto`와 닫힘 안에서 goto를 부르는 헬퍼) 기준으로 좁혔다. 글자 어디에나 있는 주소를 세던 규칙은 "이 화면에는 닿지 않는다"는 음성 단언의 주소까지 덮은 것으로 잡았다.
- md 속성 파서가 NBSP·엔 스페이스·전각 공백을 일반 공백으로 맞춘다. 편집기가 `- 사용자 확인:` 뒤에 넣는 문자 때문에 키·값을 놓치던 자리다.

## [1.3.0] - 2026-09-19

로드맵 화면이 항목 목록에서 선행 관계가 보이는 기술 트리로 바뀐다. 열은 자료가 정한다 — 로드맵 파일에 `## 마일스톤:` 절이 있으면 열이 마일스톤이고, 없으면 열이 선행 깊이다. 개요에서 기능을 고르면 화면 캡처 패널이 그 기능의 캡처만 돌린다. 고르기 전 첫 화면은 1.2.0과 같다. 1.2.0 생성물의 필드는 지우거나 이름을 바꾸지 않았고 새 설정 키도 없다. 값이 바뀌는 것은 `overview.json`의 `captures` 항목 수 하나다.

### 추가

로드맵 기술 트리

- 로드맵 화면에 트리 패널이 선다. 노드가 로드맵 항목, 선이 선행, 열 머리가 그 열의 상태별 인원이다. 노드를 누르면 그 항목의 조상·자손 사이 선만 밝아지고 나머지는 흐려진다. 고른 항목의 카드는 트리 아래 상세 슬롯에 선다.
- 열 모드가 둘이다. 마일스톤이 한 건이라도 있으면 열 하나가 마일스톤 하나이고 열 순서는 로드맵 파일의 절 순서다(화면이 재정렬하지 않는다). 마일스톤이 없으면 열 하나가 선행 깊이 한 단계다.
- 어느 마일스톤에도 안 묶인 항목과 없는 마일스톤 id를 가리키는 항목은 맨 오른쪽 "마일스톤 없음" 열에 모인다. 0건이면 그 열을 만들지 않는다.
- 선행이 끝나지 않은 항목에 잠김 표시가 붙고 무엇이 막는지 이름으로 보인다. 카드에도 층 칩과 잠김 칩이 붙어 좁은 화면에서 트리가 감춰져도 정보가 남는다.
- 키보드로 트리를 돈다. Tab으로 첫 노드에 닿고 화살표 왼쪽·오른쪽이 첫 선행·첫 후속, 위·아래가 같은 열 이웃이다. 모션 줄임에서 애니메이션이 없다.
- 폭 720px 미만에서는 트리를 감추고 카드 목록만 보인다. 노드 폭이 150px 바닥에 닿으면 트리 상자에 가로 스크롤이 생긴다.

기능별 캡처 연결

- 개요에서 기능 지도·기능 추세·기능 표 어디를 눌러도 화면 캡처 패널이 그 기능의 캡처만 돌린다. 캡처가 없는 기능을 고르면 빈 상태를 보인다. 범위가 바뀌면 장 번호와 멈춤이 되돌아간다.
- `CapturePanelProps`에 `selected`·`userPicked`·`previewCount` 셋을 더했다. 셋 다 선택이라 기존 호출은 그대로 돈다.

엔진

- 로드맵 항목의 `problems`에 문장 둘을 더한다 — 선행 순환과 마일스톤 순서 역행이다. 둘 다 경고이고 화면은 멈추지 않는다. 코드는 `docs/issue-codes.md`에 있다.
- 예산 검사에 로드맵 화면 절과 캡처 패널 절이 생겼다. 로드맵 절은 개요의 개수 임계값을 물려받지 않고 성질만 잰다.
- 클릭 대상 크롤러가 개요 밖 화면의 대화형 요소도 표와 대조한다. 그전에는 개요에서만 셌다.

### 값이 바뀌는 것

- `overview.json`의 `captures`가 늘어난다. 1.2.0은 기능마다 한 장씩 전체 5장이 상한이었는데, 1.3.0은 기능마다 최대 다섯 장이고 전체 상한이 없다. 여정 9개·단계 35개 규모의 실제 프로젝트에서 5개가 15개가 되고 파일이 666바이트 늘었다. 배열 항목이 느는 것이고 항목의 필드 모양은 그대로다.
- 고르기 전 개요 첫 화면에 보이는 썸네일은 그대로 5장이다. 미리보기가 1.2.0과 같은 알고리즘(기능마다 첫 장)으로 앞 다섯을 고르기 때문이다.

### 알려진 한계

- 열 머리 고정이 가로 스크롤이 없을 때만 걸린다. 가로로 스크롤하는 상자 안에서는 `position: sticky`가 페이지가 아니라 그 상자를 기준으로 붙기 때문이다. 열이 많아 가로 스크롤이 켜지는 자료는 열마다 인원이 적어 머리가 화면 밖으로 나갈 일이 드물다.
- 마일스톤 모드에서 열을 건너뛰는 선행은 가운데 열 노드 뒤를 지난다. 그 모드는 더미 꺾임점을 만들지 않는다.

## [1.2.0] - 2026-09-18

엔진이 못 읽은 곳을 0으로 세지 않고 "?"와 근거 줄이 달린 이슈로 드러내고, 에이전트나 사람이 적은 판정 파일을 원문과 대조해 값으로 받는다. 검사 결과는 러너가 낸 파일별 결과 JSON으로, 화면→API 호출은 화면 코드의 경로 리터럴로 관측한다. 엔진은 계속 LLM·네트워크를 부르지 않는다. README 「버전」이 major로 정한 항목(config 키, 여정 형식, 어댑터 계약, 명령·종료 코드, 생성물 파일 이름, export 배치, 예산 설정 경로)은 더하기만 했다. 새 설정 키는 없다. 1.1.1 생성물의 필드는 지우거나 이름을 바꾸지 않았고, 규칙이 바로잡히며 값이 바뀌는 필드는 아래 「값이 바뀌는 것」에 모았다.

### 추가

check와 이슈 계약

- `livemap check --json`: stdout에 `{ schema, engine, errors, warnings, problems[] }` JSON만 낸다. 문제마다 안정 코드, 대상(`subject`), 근거 줄(`anchors`, 원문 조각 120 코드 포인트까지), 허용 처리(`resolutions`: source·judge·config·code·engine), 판정 초안(`judgmentDraft`)이 붙는다. 텍스트 출력의 1.1.1 줄 문구·순서는 그대로다.
- 새 코드 13개(`tasks.*` 7, `judgment.*` 2, `router.*` 3, `journey.api-not-observed`)와 1.1.1 check 줄에 붙인 코드. 코드 표의 정본은 새 문서 `docs/issue-codes.md`다. 같은 새 코드가 6건 이상이면 텍스트 출력에서 한 줄로 묶는다.
- `livemap check --strict`: `tasks.*`·`judgment.*` 경고를 오류로 센다(옵트인, 배포 게이트에는 두지 않는다).
- `livemap check --staged`와 `livemap init`의 커밋 전 훅: `.githooks/pre-commit`(`npx --no livemap check --staged`)과 `git config core.hooksPath .githooks`. 스테이징한 작업 폴더 문서·장부·판정 파일에 걸린 `tasks.*`·`judgment.*` 문제가 있으면 종료 코드 1로 커밋을 멈추고 근거 줄과 판정 초안을 출력한다. 대상 파일이 없거나 git 저장소가 아니면 0이다. 기존 `core.hooksPath`나 훅 관리자(husky·lefthook·pre-commit), `.git/hooks/pre-commit`이 있으면 덮지 않고 넣을 한 줄을 출력한다.
- 어댑터 계약 `g.issue(level, label, message, detail?)`: 넷째 인자로 코드·대상·근거 줄·처리·판정 초안을 붙인다. 세 인자 호출은 1.1.0 그대로다.

작업 문서 읽기

- md 블록 읽개(`src/lib/md-blocks.mjs`): 제목·목록 항목·표 행을 줄 번호와 함께 나누고 코드 펜스 안 줄은 건너뛴다.
- 식별자 줄 문법: 굵은 결정 줄(`- **DEC-7**`), 임의 접두어 계획 항목(`[A-Z]{1,4}[0-9]?-[0-9]+`), 번호 없는 체크박스, 취소선 정의. 규칙이 못 읽는 줄(표로 적은 결정, 첫 칸이 번호 하나가 아닌 잔여 질문 행, 계획 파일이 불분명한 체크박스)은 `tasks.unread-*` 이슈와 `partial`로 드러낸다.
- 파일 대체 규칙: 계획 파일이 없으면 체크박스를 가진 루트 md 하나(단일 `spec.md` 등), `spec/final.md`가 없으면 작업 폴더 루트 `final.md`.
- 잔여 질문: 제목에 "잔여"·"질문"이 든 절의 표만 세고, 체크한 계획 항목 설명이 같은 번호로 시작하면 닫힌 질문으로 본다. 새 필드 `openQuestions`·`openQuestionIds`, 개요 `counts.openQuestions`.
- 장부 상태: 절 제목 표시어(완료·complete·done, 진행·in progress, 대기·paused, 폐기·cancel 등)로 분류한다. spec-kit 장부 절(`In Progress`·`Paused`·`Completed`)을 읽는다.
- 번호 참조: 같은 번호를 정의한 작업을 결정 노드 `definers`·`definedAt`에 모으고, 여럿이면 `tasks.ambiguous-ref`. 여정 `refs`에 `<작업 폴더>#<번호>` 한정 참조를 받는다.
- 판정 파일 `map/judgments/<작업 폴더>.json`: `planFile`, `lines[]`(definition·ignore), `questions.none`·`questions.items[]`. 근거는 줄 번호 대신 원문 한 줄 안의 20자 이상 조각으로 대조해, 한 줄이면 적용(`judged`), 0줄이면 `judgment.stale`, 여러 줄이면 `judgment.invalid`다. 판정은 체크 여부·장부 상태·단계를 바꾸지 못한다. `data.json` `judgments[]`.

읽기 상태

- 노드 `props.reading`·`props.readingNotes`: `observed`·`rule`·`judged`·`partial`·`stale`·`unknown`·`none`. 작업 `plan`·`openQuestions`·`stage`, 검사 `count`·`lastRun`, 화면 `apis`, 배포 `behind`에 붙는다. `data.json` `readings`(값별·필드별 건수), `overview.json` `counts.reading`(개요 수치의 상태만, 경로 없음).
- 화면: 값 뒤 "?"와 이유 분류(개요), 이유 문장·근거 줄·판정 파일(작업 상세, 더보기 > 이 상황판의 읽기 상태·판정 카드). 작업 화면에서 결정 열을 뺐다. 검사 탭은 낡은 결과의 이유 문장을 보인다(`data.json` `tests[].readingNotes`).

검사 결과

- Node 사용자 리포터 `src/reporters/node-results.mjs`(패키지 공개 경로)와 결과 JSON(`tests.report` 폴더의 `test-results.json`, 필드 이름은 CTRF). `livemap test-report`가 JUnit과 이 리포터를 함께 붙여 돌린다.
- `livemap test-report --import <파일> [--sha <커밋>]`: livemap 리포터 출력, Playwright JSON 리포터 출력, JUnit XML을 결과 JSON에 넣는다. 가릴 수 없으면 종료 코드 2.
- 최신 판정: 결과 커밋이 HEAD의 조상이고, 그 뒤 커밋과 실행 때 변경이 설정의 문서 경로(`tasks.dir`, 위키 인덱스 폴더, `semantic`, `roadmap.file`, `captures.site`, `deploy.manifest`, `map/judgments`) 밖을 건드리지 않으면 최신이다.
- 검사 노드 `lastRun`의 `failed`·`skipped`·`pending`·`flaky`·`runner`·`sha`·`at`·`tags`, `runCount`, `data.json` `testRuns[]`, `testreport:last`의 `signal`·`runs`. 결과 파일 경로와 검사 파일 경로를 글자 그대로 맞춘다.
- 문서 `docs/test-results.md`(형식, 최신 판정, 리포터·import 명령, CI 배선 예).

화면→API 관측

- router가 페이지의 import 닫힘에서 `/api/` 문자열 리터럴을 모아 화면 노드 `apiLiterals[]`에 적고, 모든 어댑터 뒤 연결 단계(`src/link.mjs`)가 API 노드에 대응해 `calls` 엣지와 `matched`를 채운다. 확장 닫힘은 리터럴 추출에만 쓰고 화면 `files`·`source`와 변경 연결은 1.1.1 그대로다.
- 맞는 API가 없으면 `router.unknown-api`, 여정 `apis`에만 있고 화면에서 관측되지 않은 API는 `journey.api-not-observed`. 고아 API는 관측한 화면 호출만 센다.
- `router.hookApi`가 있으면 1.1.1처럼 읽고(합집합) 항목마다 `router.hookapi-redundant`·`router.hookapi-only`를 알린다. 화면 노드 `hookApiKeys`.

기타

- 배포 노드 `behindManifestOnly`(뺀 매니페스트 전용 커밋 수).
- 문서: `docs/adapter-contract.md`(넷째 인자, 읽기 상태, 리터럴과 연결 단계), `docs/semantic-authoring.md`(작업 문서 규칙, 판정 파일, 한정 참조), `docs/semantic-schema.md`(읽기 상태, 새 필드), `docs/issue-codes.md`, `docs/test-results.md`, `docs/migrate.md` 2.0.0 예고.

### 고친 것(1.1.1 결함)

- 설정에 `semantic` 키가 없으면 `build`·`check`가 `path` TypeError로 멈췄다. 이제 여정 입력 없음으로 본다.
- `livemap test-report`를 `node --test` 안에서(검사·CI 래퍼) 부르면 자식 러너가 `NODE_TEST_CONTEXT`를 물려받아 검사 파일을 하나도 돌리지 않고 종료 코드 0을 냈다. 이제 그 변수를 빼고 러너를 띄운다.
- Node 22 JUnit 리포터가 최상위 `<testcase>`를 `<testsuite>` 밖에 써서 1.1.1 testreport가 통과한 실행을 검사 0건으로 읽었다(결과가 늘 최신 아님). 최상위·중첩 `<testcase>`를 모두 센다.
- 배포 뒤처짐(`behind`)이 배포 봇이 매니페스트만 바꾼 커밋까지 세어, 배포 직후에도 1로 보였다. 매니페스트 경로만 바꾼 커밋을 빼고 센다.
- router의 로컬 import 닫힘이 작은따옴표 import만 따라가, 큰따옴표로 import한 페이지의 데이터 출처(live·mock)와 변경 연결이 빠졌다.

### 값이 바뀌는 것

같은 입력을 1.1.1과 1.2.0으로 build·check한 값이다. "실사용 프로젝트 사본"은 화면 29·API 55·작업 24개인 제품 저장소, "스펙 작업 코퍼스"는 작업 폴더 36개뿐인 문서 저장소다. 두 사본 모두 판정 파일이 없고, 원문은 고치지 않았다.

| 값 | 대상 | 1.1.1 | 1.2.0 | 까닭 |
|---|---|---|---|---|
| 조용히 잘못 읽은 작업 문서 줄(후보인데 세지도 알리지도 않은 줄) | 실사용 프로젝트 사본 | 67줄(작업 8/24) | 0 | 굵은 결정·임의 접두어 체크박스·단일 `spec.md`를 규칙으로 읽고, 못 읽는 줄은 이슈로 알림 |
| | 스펙 작업 코퍼스 | 177줄(작업 16/36) | 0 | 같은 까닭과 루트 `final.md` 대체, 잔여 질문 표의 번호 하나가 아닌 행 |
| 개요 열린 질문 | 실사용 프로젝트 사본 | 29(`counts.oq`) | 1?(`counts.openQuestions`, 읽기 상태 partial) | 답한 `## 열린 질문` 표를 세지 않고 잔여 질문 절만 셈. 남은 1은 완료 작업의 닫히지 않은 질문(판정 파일로 0) |
| | 스펙 작업 코퍼스 | 92 | 28?(partial) | 같은 까닭. 체크한 계획 항목 설명이 번호로 시작하면 닫힘 |
| 계획 항목 완료/전체(작업 합) | 실사용 프로젝트 사본 | 149/181 | 189/221 | 계획 파일 없는 작업의 체크박스 40줄(단일 `spec.md` 세 작업 포함)과 임의 접두어 항목을 셈. 네 작업의 0/0이 4/4·6/6·5/5·6/6 |
| | 스펙 작업 코퍼스 | 768/897 | 771/901 | 번호 없는 체크박스와 루트 `final.md` 작업 |
| 결정 수 `dec`(작업 합, 화면에서는 뺌) | 실사용 프로젝트 사본 | 149 | 176 | 굵은 결정 줄 |
| | 스펙 작업 코퍼스 | 206 | 360 | 굵은 결정 줄, 루트 `final.md` |
| 작업 상태 분포 | 실사용 프로젝트 사본 | 완료 20·진행 2·폐기 1·기록 1 | 완료 21·진행 2·폐기 1 | `완료 실행 이력` 절을 표시어로 완료로 읽음 |
| | 스펙 작업 코퍼스 | 기록 36 | 완료 28·진행 7·폐기 1 | spec-kit 장부 절 `In Progress`·`Completed`와 `폐기` 절을 읽음 |
| 화면→API 쌍(`calls` 엣지) | 실사용 프로젝트 사본, hookApi 설정 그대로 | 215 | 257 | 1.1.1 쌍 215개 모두 유지, 리터럴로 42쌍 추가(2단계 hook이 부르는 세션 확인, 같은 경로의 메서드 노드, 대응표에 없던 견적 화면 호출) |
| | 같은 사본, hookApi를 지운 설정 | 0 | 257 | 대응표 없이 리터럴로 관측 |
| 고아 API | 실사용 프로젝트 사본 | 2 | 1 | 관측한 화면 호출로 셈 |
| 배포 뒤처짐(`signals.deployBehindAll`) | 실사용 프로젝트 사본, 매니페스트 전용 커밋 직후 두 시점 | 1 | 0 | 매니페스트만 바꾼 커밋을 뺌(`behindManifestOnly` 1) |
| 검사 신호·등급 A | 엔진 결과 픽스처, 통과한 실행 뒤 build | stale·A 0 | ok·A 1 | JUnit 최상위 testcase 합산과 결과 JSON |
| | 같은 픽스처, 통과 뒤 작업 문서만 바꾼 커밋 | stale·A 0 | ok·A 1 | 최신 판정이 커밋 일치에서 "결과 커밋 뒤 문서 경로 밖 변경 없음"으로 바뀜 |
| | 같은 픽스처, 통과 뒤 코드를 바꾼 커밋 | stale·A 0 | stale·A 0 | 그대로 |
| 검사 개수 읽기 상태 | 실사용 프로젝트 사본 | 없음 | `counts.reading.tests` partial | 제목이 템플릿 문자열인 검사 호출 1파일 |
| check 경고 수(오류 수·종료 코드는 그대로 0) | 실사용 프로젝트 사본 | 2 | 87 | `router.hookapi-redundant` 54(묶음 줄 한 줄), `tasks.ambiguous-ref` 29, 완료 작업 열린 질문 1, 번호 참조 대상 없음 1, 고아 줄 2(API 1·검사 1) |
| | 스펙 작업 코퍼스 | build 실패(`semantic` 키 없음) | 17(오류 0) | `tasks.questions-open-done` 9, `tasks.unread-definition` 6, `tasks.questions-unknown` 1, `tasks.stage-unknown` 1 |
| build 요약 경고(`signals.warnings`) | 실사용 프로젝트 사본 | 0 | 1 | 여정 refs의 잔여 질문 번호가 정의로 풀리지 않음(아래 알려진 한계) |

등급 A의 뜻이 바뀐다. 1.1.1은 JUnit 결과의 커밋이 main HEAD와 같을 때만 A였다. 1.2.0은 결과 커밋이 HEAD의 조상이고 그 뒤 설정의 문서 경로 밖을 바꾼 커밋과 실행 때 변경이 없으면 A다. 그래서 작업 문서·판정 파일·여정만 바꾼 커밋 뒤에도 A가 남고, 코드·CI·설정 파일을 바꾼 커밋 뒤에는 다시 검사를 돌려야 A다. 오래된 결과를 지금 HEAD로 `--import`하면 최신으로 보이므로 러너 바로 뒤에 가져온다.

### 업그레이드하면 check가 실패할 수 있는 항목

새 경고는 종료 코드를 바꾸지 않는다. 다음 경우에만 1.1.1에서 통과하던 `check`가 1이 될 수 있다.

- 판정 파일을 둔 프로젝트: `map/judgments/*.json`의 JSON·필드 형식 위반, 없는 작업 폴더·`planFile`·근거 파일, 20자 미만이거나 여러 줄에 걸린 근거 조각, 번호가 없는 근거 줄은 `judgment.invalid`(error)다. 판정 파일이 없는 프로젝트는 해당 없다.
- 프로젝트 어댑터가 `g.issue`에 넷째 인자를 넘기던 경우: 1.1.1은 무시했지만 1.2.0은 형식을 검사해, 모르는 키·틀린 코드 모양·코드 표와 다른 수준이면 `throw`하고 그 어댑터가 failed(오류)가 된다.
- 여정 `refs`의 한정 참조(`<폴더>#<번호>`): 그 폴더가 번호를 정의하지 않았으면 "참조 미해결" 오류다. 1.1.1에는 이 모양이 없어 새로 쓴 참조에만 해당한다.
- `check --strict`를 CI에 배선하면 `tasks.*`·`judgment.*` 경고가 오류가 된다(옵트인).
- `livemap init`을 다시 돌려 커밋 전 훅을 설치하면 `check` 자체는 그대로지만, 스테이징한 작업 문서에 걸린 `tasks.*`·`judgment.*` 문제가 있는 커밋이 멈춘다.

### 알려진 한계

- 검사 어댑터(`tests`)가 검사 파일의 로컬 import를 따라갈 때 작은따옴표 import만 읽는다(router는 두 따옴표 모두 읽음).
- 화면 import 닫힘 밖 모듈의 경로 리터럴(예: 공용 요청 클라이언트의 세션 확인)은 어느 화면에도 붙지 않고 수도 남기지 않는다.
- 닫힘이 파일 단위라 공유 컴포넌트가 가진 호출은 그 컴포넌트를 쓰는 모든 화면에 붙는다. 변수로 조립한 경로는 잡히지 않고 그 API는 고아 경고로 드러난다.
- 라우트 페이지가 아닌 틀(레이아웃) 컴포넌트의 호출은 화면 호출로 세지 않아, 그 API가 고아로 남을 수 있다.
- `execution/`에 헤더만 있는 실행 기록 파일이 있어도 작업 단계가 "실행"이다(1.1.1 단계 규칙 그대로). 계획 단계에서 실행 기록 틀을 만드는 워크플로는 실행 전에도 "실행"으로 보인다.
- 잔여 질문 번호(`OQ-28`)는 정의로 보지 않아 여정 `refs`의 대상으로 풀리지 않고 "번호 참조 대상 없음" 경고가 된다.
- 템플릿 문자열 검사 제목 판정은 한 줄 단위라, `test(` 다음 줄에서 제목이 시작하는 호출은 `partial`로 잡지 못한다.
- 설정 루트가 git 저장소의 하위 폴더이면 배포 `behind`는 그 폴더를 건드린 커밋만 세고 `behindManifestOnly`에 폴더 밖 커밋이 섞인다.

## [1.1.1] - 2026-09-17

작업 어댑터가 계획 항목·결정·열린 질문을 파일 하나에서만 센다. 생성물의 키와 형식은 그대로고 값만 바뀐다.

- 계획 항목(`pnDone`·`pnOpen`)은 계획 문서(`task_plan.md`, 없으면 `plan.md`)에서만 센다. 1.1.0은 `spec/final.md`의 계획 초안 체크박스를 더해, 실행 중 체크하지 않는 그 목록만큼 분모가 부풀었다(실제 프로젝트 하나에서 작업 48/61이 48/108로 보임). 로드맵 카드·작업 화면·개요 합계가 같이 바로잡힌다. 계획 문서가 없고 스펙에만 체크박스가 있는 작업은 계획 항목이 0이 된다.
- 결정(`dec`)·열린 질문(`oq`)은 `spec/final.md`에서만 센다. 계획 문서에 옮겨 적은 줄은 세지 않는다.
- 같은 계획 항목 번호가 스펙과 계획 문서에 모두 있으면 계획 문서의 줄을 정의로 삼는다. 기능 단계 `refs`의 `PN-nn`이 계획 문서의 완료 여부를 따른다(1.1.0은 체크되지 않는 스펙 줄을 읽어 늘 미완이었다).

## [1.1.0] - 2026-09-17

상황판 화면을 React 다크 모니터형으로 다시 만들고, 로드맵 항목을 묶는 마일스톤과 날짜·결정 대기 자료를 더했다. README 「버전」이 major로 정한 항목(config 키, 여정 형식, 어댑터 계약, 명령·종료 코드, 생성물 파일 이름, export 배치, 예산 설정 경로)은 바꾸거나 지우지 않고, 로드맵 형식·어댑터 계약·생성물은 추가만 했다.

화면

- 화면 원본을 `ui/`(React)로 옮기고 `scripts/build-ui.mjs`(esbuild)가 `site/index.html`·`map.css`·`map.js`로 번들한다. 파일 이름·위치와 export 배치는 같다. 번들은 커밋하고 CI·릴리스가 다시 빌드해 차이가 없는지 본다. React는 번들 안에 있고 런타임 의존성은 계속 0이다. 번들 끝에 React MIT 고지를 남긴다. `map.js`는 약 33KB에서 약 250KB(gzip 약 77KB)가 된다.
- 개요: 상단 바(내비 5·배포·경고·신선도 알약·제품 호스트), 전광판, 8패널(마일스톤, 진척, 최근 변경, 기능 지도, 기능별 변경, 특보, 화면 캡처, 기능 현황). 다크 한 벌이고 글자 대비 4.5:1 이상, 상태는 모양으로도 구분한다. 목록은 들어가는 행만 그리고 나머지는 "외 n →" 링크다.
- 해시 라우터와 하위 화면(기능 목록·스토리보드·단계 상세, 로드맵, 작업, 더보기 6탭)을 React로 옮겼다. 정보와 배치는 1.0.1과 같고, 로드맵은 마일스톤별로 접고, 작업은 진행·대기가 기본 필터다. 경로(`#/overview`·`#/journeys/…`·`#/roadmap/…`·`#/tasks/…`·`#/more/…`)는 같고 `#/roadmap/<id>`가 마일스톤 id도 받는다.
- 화면 어휘: 여정 → 기능, 장면 → 단계, `planned` → 계획, `next` → 구상. 파일 키·값과 프로젝트 문구는 그대로다.
- 하위 화면의 여정·로드맵 파일 경로 문구를 고정 문자열 대신 설정 값(`data.json.sources`)으로 보인다.
- 기능이 13개 이상이면 완성 기능을 기능 지도에서 접는다(지도 12개 이하 유지, 기능 화면에는 전부).
- 전광판 정지 버튼, 모션 줄임, 기능 지도 키보드 선택, 1279px 이하 두 줄 상단 바.
- 마지막 방문 뒤 커밋 표시가 시각을 문자열로 비교해 `Z`와 `+09:00`이 섞이면 틀리던 것을 `Date.parse` 비교로 고쳤다.

로드맵과 마일스톤

- 로드맵 파일에 `## 마일스톤: <제목>` 절(`id`·`상태`·`완료일`·`목표일`·`결정 대기`)과 항목 키 `마일스톤`을 더했다. 항목 순서·자동 id는 항목 절만 세어 1.0.1과 같다. 마일스톤 절은 1.1.0 이상에서만 쓴다. 1.0.x는 이 절을 로드맵 항목으로 읽으므로 엔진을 먼저 올린다(`docs/semantic-authoring.md`).
- 로드맵 어댑터가 로드맵 파일 git 이력에서 항목 완료일(`completedAt`)과 결정 대기 시작일(`waitingSince`)을 계산한다. 이름 바꾸기를 따라가고, 미커밋 변경·git 없음은 null, 얕은 클론은 null과 partial이다.
- 결정 대기 `<주체>: <질문>`을 주체와 질문으로 나눈다(콜론 뒤 공백 필요).
- 로드맵 항목 막힘(`blockedBy`), 마일스톤 진척·막힘, 현재 마일스톤을 파생한다.

생성물(필드·노드 추가만)

- `overview.json`: 첫 화면 자료 전부(`roadmapItems`, `milestones`, `currentMilestone`, `activity`, `changes`, `links`, `captures`, `journeys[]`의 `goal`·`counts`·`roadmapItem`·`milestone`·`commits`·`week`·`series`, 단계 `hits`, `counts`·`signals` 추가 키). 커밋 제목은 사람 커밋만, 관례 접두어·내부 ID·식별자를 지워 싣고 `[bot]` 작성자 커밋은 자동 수로 따로 센다. 크기는 기능·커밋 수에 따라 커진다(엔진 픽스처 3,697B, 실제 프로젝트 하나에서 25,637B).
- `data.json`: `roadmap[]`의 `milestone`·`completedAt`·`waitingSince`·`waitingWho`·`waitingWhat`·`blockedBy`, `milestones[]`, `issues[]`, `sources`, `tasks[].roadmapItems`. 기존 경로·값과 `commits` 순서는 그대로다.
- `graph.json`: 노드 종류 `release`(마일스톤, 1.x 임시 이름), `release → milestone` `contains` 엣지, 로드맵 항목 노드 속성, 최상위 `issues[]`.
- `overviewSlice(d, opts)`가 선택 인자 `opts.sinceDays`(기본 14)를 받는다.
- 1.0.1이 만들던 필드 중 새 화면이 쓰지 않는 것(`line`, `running`, `waiting`, `tasks`, `openQuestions`, `areas`, `recent`, `roadmap[]`)도 남긴다. 정리는 2.0.0 후보다.

어댑터 계약

- `g.issue(level, label, message)`: 프로젝트 어댑터가 `'error'`·`'warn'`을 낸다. 실행 중 어댑터 이름과 함께 `issues[]`에 남고, `check`가 `✗`·`△` 줄로 출력하며(error는 종료 코드 1), 더보기 > 이 상황판에 목록으로 나온다.

check

- 마일스톤 규칙 오류 5종·경고 7종(마일스톤 절이 있을 때만, 진행 항목에 마일스톤 키 없음 포함), 진행 항목의 선행 미완 경고, 배우 사전에 없는 배우 경고, `g.issue` 줄. 새 경고는 종료 코드를 바꾸지 않는다.

예산 검사와 CI

- 예산 검사 선택자를 새 화면에 맞췄다(`body` 배경, `#root` 식별자, 기능 지도 → 기능 화면 → 단계 → 상세 3번 클릭, 내비 링크 모두 보임). 숨은 스크롤 0, 모션 줄임 애니메이션 0, 상태 모양 검사를 더했다. 임계값·설정 키·경로·스크린샷 경로는 같고, 스크린샷은 모션 줄임에서 서체를 기다린 뒤 찍는다.
- 스모크가 하위 화면 전 경로 콘솔 오류, 설정 경로를 바꾼 픽스처의 화면 문구, 클릭 경로 크롤(`scripts/route-crawl.mjs`: 개요 클릭 대상과 라우트 패턴별 모든 개체를 `serve`·`serve --static` 두 방식으로 방문)을 본다.

문서

- `docs/view-budget.md`(첫 화면 질문, 새 규칙, 패널 바꾸는 절차), `docs/hosting-and-csp.md`(React 클라이언트 렌더와 CSSOM, 배포 뒤 검증, 게이트 뒤 확인 방법), `docs/semantic-authoring.md`(화면 어휘, 배우 사전, 로드맵·마일스톤 작성), `docs/semantic-schema.md`, `docs/adapter-contract.md`, `docs/migrate.md`(전환 전후 측정).

## [1.0.1] - 2026-09-17

- 문서: `npx`로 옵션을 넘길 때 `--`가 필요하다는 안내, 로컬 엔진을 `--install-links`로 끼워 보는 방법을 README에 더했다.
- 이 판부터 태그 push로 GitHub Actions 신뢰 배포(provenance 포함)로 공개한다.

## [1.0.0] - 2026-09-17

첫 공개 판. 한 프로젝트 저장소 안에 있던 상황판 엔진을 패키지로 옮겼다.

- 명령 `livemap build | check | serve | export | init | test-report | --version`. npm bin 심링크로 불러도 실행된다.
- 기본 루트는 명령을 부른 폴더(`process.cwd()`), 설정은 `map/config.json`, 캡처는 `captures.site`(기본 `map/captures`).
- `config.json`의 `engine`(major)이 엔진과 다르면 exit 2. 키가 없으면 1로 본다.
- `export <dir>`: 화면·서체·캡처·생성물을 `/map/` 주소 배치 그대로 한 폴더에 모은다. `serve --static <dir>`이 같은 배치를 준다.
- 서체(Pretendard Variable, SIL OFL)를 `site/fonts/`에 번들하고 CSS는 상대 경로로 부른다.
- 화면 예산 검사 설정 `budget/playwright.config.mjs`는 프로젝트 루트 기준으로 산출물을 쓴다. `@playwright/test`는 선택적 peer다.
- 프로젝트 어댑터가 같은 이름의 참조 어댑터를 가리면 한 줄로 알린다.
