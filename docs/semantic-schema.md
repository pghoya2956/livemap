# 프로젝트 상황판의 시맨틱 레이어

상황판은 두 종류의 사실을 하나의 그래프로 잇는다. 사람이 뜻을 붙이는 노드(여정·단계·결정·로드맵 항목·마일스톤)와 코드에서 긁어내는 노드(화면·API·함수·테이블·검사·커밋)다. 둘이 어긋나면(단계가 가리키는 라우트가 코드에 없음) 화면에 경고로 드러난다.

사람이 적는 곳은 넷이다: 여정 파일(`semantic`), 로드맵(`roadmap.file`, 마일스톤 포함), 작업 장부(`tasks.index`), 작업 폴더 문서(`tasks.dir`의 스펙·계획). 나머지는 생성기가 저장소를 스캔해 만든다. 작성 방법은 `semantic-authoring.md`에 있다.

화면은 journey를 "기능", step을 "단계"로 부른다. 노드 종류·파일 키는 그대로다.

## 노드

| 종류 | 출처 | 키 | 뜻 |
|---|---|---|---|
| journey | 손(여정 정본: 역할별 md 디렉터리 또는 journeys.json) | id | 한 배우가 한 목표를 이루는 흐름. 스토리 맵의 backbone 한 칸 |
| step | 손 | journey/step | 여정 안의 한 장면. intent(사용자가 원하는 것)·status·capture |
| screen | 생성(라우터) | route path | 화면 하나. 페이지 파일, 데이터 출처(live/mock/mixed), 호출 API, 검사, 마지막 변경 |
| api | 생성(BFF) | method+path | 서버 진입점. 호출하는 DB 함수·Auth |
| function | 생성(migration) | name | DB 함수. 읽고 쓰는 테이블, BFF 사용 여부 |
| table | 생성(migration) | schema.name | 저장 구조 |
| migration | 생성(migration) | file | migration 파일 하나. 만드는 테이블·함수, grant·RLS 수, 마지막 변경 |
| test | 생성(tests/, 결과 JSON) | file | 검사 파일. 다루는 라우트·API, 마지막 실행(`lastRun`) |
| testreport | 생성(결과 JSON, 없으면 JUnit 리포트) | last | 마지막 검사 실행의 건수·실패·건너뜀, 결과가 최신인지와 검사 신호(`test-results.md`) |
| commit | 생성(git) | sha | 최근 변경. 건드린 파일 → 영향받는 화면·여정 |
| decision | 생성(위키 index, 작업 문서, 판정 파일) | file 또는 번호 | 위키 결정 페이지와 상태(current/proposed/superseded). 작업 문서의 결정 번호와 계획 항목 번호(완료 여부)도 이 종류로 두고, 정의한 작업을 `definers`에 싣는다 |
| task | 생성(작업 폴더 `tasks.dir`, 판정 파일) | 폴더 이름 | 작업 하나. 제목·단계(스펙 초안~검증)·상태·결정 수·계획 항목 완료/미완·열린 질문 수와 각 값의 읽기 상태. 계획 항목은 계획 파일(대체 규칙 포함)에서만, 결정·잔여 질문은 스펙 final에서만 센다(`semantic-authoring.md` 「작업 문서」) |
| ledger | 생성(tasks/index.md) | 행 | 지금 실행 중·대기 중인 작업 |
| deploy | 생성(git·배포 매니페스트) | head, 배포 대상 | 브랜치 머리 커밋, 매니페스트 이미지 태그의 sha와 뒤처진 커밋 수 |
| milestone | 손(로드맵 `## 제목` 절) | id | 로드맵 항목. 순서·상태·진행 방식·장면·작업·선행·결정 대기·완료 기준·마일스톤, git 이력에서 계산한 완료일(`completedAt`)·결정 대기 시작일(`waitingSince`) |
| release | 손(로드맵 `## 마일스톤: 제목` 절, 1.1.0부터) | id | 마일스톤. 순서·상태·목표·완료일·목표일·결정 대기와 그 시작일. 1.x 동안의 임시 이름이고 2.0.0에서 로드맵 항목은 `roadmapItem`, 마일스톤은 `milestone`으로 바꾼다 |

## 엣지

- journey → step (순서)
- step → screen (shows): `screens: [route]`(md 정본은 대응표 `journeyScreens`의 `screens`)
- step → api (uses): 명시(`apis`) 또는 screen을 거쳐 유도
- screen → api (calls): 페이지와 그 import 닫힘의 `/api/` 문자열 리터럴을 모든 어댑터 뒤 연결 단계가 API 노드에 대응(1.2.0). 설정에 `router.hookApi`가 있으면 hook 이름 대응표로 이은 엣지도 더한다(2.0.0에서 폐기)
- api → function (invokes): BFF 핸들러 블록의 `rpc/<name>`
- function → table (touches): 함수 본문에서 알려진 테이블 이름 스캔
- test → screen | api (covers): 검사 파일의 `goto('/…')`·`'/api/…'` 문자열
- commit → screen | api | function (touches): 파일 경로 → 노드(페이지 파일·닫힘·server.mjs·migration)
- milestone → task (tracks): 로드맵 항목의 `작업`. 장면·선행은 derive에서 해석하고 없으면 check 오류
- release → milestone (contains): 로드맵 항목의 `마일스톤` 키. 없는 마일스톤 id면 엣지 없이 check 오류
- task → decision (defines): 작업 문서의 결정 목록 줄·계획 파일 체크박스의 머리 번호, 판정 파일 `lines` definition
- step → decision (refs): `refs: ["DEC-57", "20260914-booking#PN-15", "trust-boundary"]`. derive가 문자열로 해석한다: 번호는 그 번호를 정의한 작업(defines)으로(정의 작업이 여럿이면 `tasks.ambiguous-ref`), `<폴더>#<번호>`는 그 작업의 정의로, 나머지는 위키 결정 slug로 찾는다

## 상태 규칙

- screen.source: 페이지(및 로컬 import 닫힘)가 `mock/`을 쓰면 mock, `lib/queries`를 쓰면 live, 둘 다면 mixed.
- screen.fixedVia: 닫힘이 `fixedPattern`(코드에 고정된 표시값)을 읽는 파일. source는 바꾸지 않고 "하드코딩 표시"로 따로 센다.
- step.status는 손으로 적되 screens의 source와 대조해 어긋나면 경고(live 단계인데 mock 화면 등).
- journey.status는 단계에서 유도: 전부 live면 live, 하나라도 live면 partial, 아니면 단계 다수 상태.
- 로드맵 항목 막힘(`blockedBy`): `waiting`(완료 아님 + 결정 대기), `deps`(진행·다음인데 선행 미완), `task`(추적 작업 중 대기). 마일스톤은 자신의 결정 대기가 있거나 소속 비완료 항목 중 막힌 것이 있으면 `blocked`.
- 현재 마일스톤: 파일 순서로 상태가 진행인 첫 마일스톤, 없으면 다음인 첫 마일스톤, 없으면 없음.

## 문제 기록(issues)

어댑터가 `g.issue(level, label, message, detail?)`로 낸 오류·경고는 노드가 아니라 `graph.json`·`data.json` 최상위 `issues[]`에 `{level, label, message, adapter}`로 남는다(1.1.0부터, `adapter-contract.md`). 넷째 인자를 준 문제는 `code`·`subject`·`anchors`·`resolutions`(있으면 `judgmentDraft`)를 더 싣는다(1.2.0, 코드 표는 `issue-codes.md`).

## 읽기 상태

1.2.0부터 값마다 어떻게 읽었는지를 함께 싣는다. 노드 `props.reading`은 `{ 필드: 상태 }`, `props.readingNotes`는 `{ 필드: 이유 문장 }`이다.

| 상태 | 뜻 | 화면 |
|---|---|---|
| `observed` | 생산자의 구조화된 출력(결과 JSON)이나 livemap 소유 형식에서 읽음 | 값 |
| `rule` | 규칙으로 읽었고 같은 범위의 후보 줄이 모두 읽힘. 적지 않은 필드의 기본값 | 값 |
| `judged` | 판정 파일이 값을 채우거나 고쳤고 근거 조각이 확인됨 | 값, 작업 상세와 더보기에 "판정" |
| `partial` | 규칙으로 읽었지만 안 읽힌 후보 줄이나 뜻 확인이 필요한 행이 있음 | 값 뒤 "?"(예: `48/61?`) |
| `stale` | 판정 근거 조각이 원문에서 사라졌거나 검사 결과 뒤 코드가 바뀜 | "?" |
| `unknown` | 소스가 없거나 형식 밖 | "?" |
| `none` | 대상이 없음(체크박스 없는 조사 작업 등) | 빈 칸 |

| 필드 | 상태 규칙 |
|---|---|
| 작업 `plan` | 계획 파일이나 대체 규칙으로 읽으면 `rule`, 판정 `planFile`이면 `judged`, 계획 파일이 없고 체크박스를 가진 루트 md가 둘 이상이면 `unknown`, 체크박스가 없으면 `none` |
| 작업 `openQuestions` | 잔여 질문 절을 읽으면 `rule`. 첫 칸이 번호 하나가 아닌 행이 있거나 완료 작업에 닫히지 않은 행이 있으면 `partial`. 스펙 final에 절이 없으면 `unknown`, `spec/initial.md`만 있으면 검토 전이라 `unknown`(이슈 없음). 스펙이 없거나 폐기 작업이면 `none`. 판정이 덮으면 `judged` |
| 작업 `stage` | 파이프라인 문서로 정하면 `rule`, 없으면 `unknown` |
| 검사 `count` | 최신 결과가 있으면 `observed`, 제목이 `${`를 가진 템플릿 문자열인 호출이 있으면 `partial`, 나머지 `rule` |
| 검사 `lastRun` | 최신 결과면 `observed`, 결과가 낡았으면 `stale`, 결과가 없거나 결과에 그 파일이 없으면 `unknown` |
| 화면 `apis` | 모든 리터럴이 API 노드에 맞고 hookApi로만 붙은 항목이 없으면 `rule`, 아니면 `partial` |
| 배포 `behind` | 계산하면 `rule`, 매니페스트 sha가 이력에 없거나 git 이력을 못 읽으면 `unknown` |

합계는 구성 요소 중 하나라도 `partial`·`stale`·`unknown`이면 `partial`이다. `none`은 합계에서 빼고, 나머지가 섞이면 `judged`, `rule`, `observed` 순으로 약한 근거를 쓴다. 개요의 "?" 옆에는 이유 분류 문구만 쓰고, 파일·줄이 든 이유 문장은 작업 상세와 더보기에 글자로 보인다.

## 1.2.0에서 더한 생성물 필드

필드를 더하기만 했고 1.1.1 필드의 이름·위치는 그대로다.

| 생성물 | 필드 | 뜻 |
|---|---|---|
| `graph.json` 노드 `task` | `reading`, `readingNotes` | 작업 `plan`·`openQuestions`·`stage`(대체 규칙이면 `spec`) 읽기 상태와 이유 |
| | `readLines` | 엔진이 센 줄 `{ 파일: [줄 번호] }` |
| | `openQuestions`, `openQuestionIds` | 열린 잔여 질문 수(못 읽으면 `null`)와 번호 |
| | `planFile`, `specFile` | 읽은 계획 파일과 스펙 final(대체 규칙·판정 포함), 없으면 `null` |
| | `judged`, `judgment` | 판정 파일 경로와 `{ by, note, applied, stale, invalid }`, 판정 파일이 없으면 둘 다 `null` |
| `graph.json` 노드 `decision` | `definers`, `definedAt` | 그 번호를 정의한 작업 이름 목록, 정의 줄 `{ task, file, line }` 목록 |
| | `struck` | 취소선 정의만 있는 번호면 `true` |
| `graph.json` 노드 `test` | `lastRun`의 `failed`·`skipped`·`pending`·`flaky`(Playwright만)·`runner`·`sha`·`at`·`tags` | 결과 JSON의 파일별 값. 1.1.1 `passed`·`tests`·`fresh`는 그대로이고 `passed`는 `failed === 0`이다. `tags`는 파일에 붙은 러너 태그다 |
| | `runCount`, `reading`, `readingNotes` | 결과의 실행 수, `count`·`lastRun` 읽기 상태와 낡은 이유 |
| `graph.json` 노드 `screen` | `apiLiterals[]` | `{ path, open?, file, line, matched }`. 관측한 `/api/` 리터럴과 연결 단계가 맞춘 API 노드 id |
| | `hookApiKeys` | 설정에 `router.hookApi`가 있을 때 그 화면이 쓴 대응표 키 |
| | `reading`, `readingNotes` | `apis` 읽기 상태와 맞지 않는 리터럴·hookApi로만 붙은 API(3개까지) |
| `graph.json` 노드 `deploy` | `behindManifestOnly`, `reading`, `readingNotes` | 뒤처짐에서 뺀 매니페스트 전용 커밋 수, `behind` 읽기 상태 |
| `graph.json` 노드 `testreport:last` | `signal`, `runs` | 검사 신호(`ok`·`fail`·`stale`·`none`)와 실행 목록 |
| `graph.json`·`data.json` `issues[]` | `code`, `subject`, `anchors`, `resolutions`, `judgmentDraft` | 넷째 인자를 준 문제에만(`adapter-contract.md`, `issue-codes.md`) |
| `data.json` `tasks[]` | `reading`, `readingNotes`, `openQuestions`, `openQuestionIds`, `planFile`, `specFile`, `judged`, `judgment` | 노드와 같다. `readLines`는 싣지 않는다 |
| `data.json` `tests[]` | `reading`, `readingNotes` | 노드와 같다 |
| `data.json` `screens[]` | `reading` | 노드와 같다(이유 문장은 노드에만) |
| `data.json` | `testRuns[]` | `{ runner, source, sha, at, exit, fresh }`. 결과 JSON의 `dirtyPaths`는 싣지 않는다 |
| `data.json` | `readings` | `{ values: { 상태: 건수 }, fields: { '<노드 종류>.<필드>': { 상태: 건수 } } }` |
| `data.json` | `judgments[]` | `{ task, file, by, note, applied, stale, invalid }` |
| `overview.json` | `counts.openQuestions` | 열린 잔여 질문 합계. 1.1.1 `counts.oq`와 최상위 `openQuestions`는 그대로 남는다 |
| `overview.json` | `counts.reading` | `{ plans, openQuestions, tests, grades }` 개요 수치의 읽기 상태(경로·파일명 없음). `grades`는 검사 `lastRun`과 화면 `apis`의 합계다 |
| `overview.json` | `tasks[].openQuestions`, `tasks[].reading` | 작업별 열린 질문 수와 읽기 상태(식별자 없음) |

## 다른 프로젝트에 옮길 때 바꾸는 것

스캐너(라우터·서버·migration·검사 형식)만 어댑터로 갈아끼운다. journeys.json 형식·화면·상태 규칙은 그대로 둔다. 어댑터가 없는 종류는 비워도 화면이 깨지지 않는다.
