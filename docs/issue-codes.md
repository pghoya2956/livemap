# 이슈 코드

`livemap check`가 내는 문제마다 안정 코드, 대상, 근거 줄, 허용 처리가 붙는다. 이 문서가 코드의 뜻과 허용 처리의 정본이다. 코드 이름은 1.x 동안 바꾸거나 지우지 않고 더하기만 한다. 언제 원문을 고치고 언제 판정하는지는 이 코드를 받는 에이전트 절차가 정한다. 엔진은 원문과 판정 파일을 고치지 않는다.

## 출력

`livemap check`의 텍스트 출력은 1.1.1 줄 문구를 그대로 둔다. 새 코드(아래 첫 표) 중 같은 코드가 6건 이상이면 `△ tasks.ambiguous-ref 32건(단계 17): livemap check --json`처럼 한 줄로 묶는다. 괄호 안 수는 서로 다른 대상 수다. 기존 check 줄과 코드 표에 없는 코드는 묶지 않는다.

`livemap check --json`은 stdout에 JSON 하나만 낸다. 빌드 중 어댑터가 찍은 줄과 "프로젝트 어댑터가 참조 어댑터를 가림" 알림은 stderr로 간다. 종료 코드는 텍스트 출력과 같다(오류가 있으면 1).

```json
{
  "schema": 1,
  "engine": "1.2.0",
  "errors": 0,
  "warnings": 1,
  "problems": [
    {
      "level": "warn",
      "code": "tasks.questions-open-done",
      "msg": "작업 문서: 완료 작업에 닫히지 않은 잔여 질문 1",
      "subject": { "kind": "task", "id": "20260101-sample" },
      "anchors": [{ "file": "tasks/20260101-sample/spec/final.md", "line": 12, "excerpt": "| OQ-02 | 남은 질문 |" }],
      "resolutions": ["judge"],
      "judgmentDraft": { "task": "20260101-sample", "questions": { "items": [{ "id": "OQ-02", "state": null, "at": null }] } }
    }
  ]
}
```

- `problems`는 수준(error 먼저), 코드, 첫 근거 줄의 파일, 줄 순으로 정렬한다. 나머지가 같으면 check 순서를 지킨다.
- `msg`는 텍스트 출력의 기호 뒤 문구와 같다.
- `subject`는 `{ kind, id }`이고 대상이 하나로 정해지지 않는 문제(고아 목록 등)는 `null`이다. `kind`는 그래프 노드 종류 이름(`task`, `step`, `journey`, `milestone`은 로드맵 항목, `release`는 마일스톤)이나 `adapter`·`config`다.
- `anchors`는 `{ file, line, excerpt? }` 배열이다. `line`이 `null`이면 파일 단위 근거다. `excerpt`는 120 코드 포인트까지 자른다.
- `resolutions` 값: `source`(원문을 규칙대로 고침), `judge`(판정 파일), `config`(설정), `code`(프로젝트 코드), `engine`(엔진 결함 보고).
- `judgmentDraft`는 판정으로 처리할 수 있는 문제에만 있다(아래 「판정 초안」).

`livemap check --strict`는 `tasks.*`·`judgment.*` 경고를 오류로 센다. 텍스트 줄 기호가 `✗`로 바뀌고 JSON의 `level`이 `error`가 된다. 과거 작업 채우기가 끝났는지 한 번 확인할 때 쓰고, 배포를 막는 CI 잡에는 배선하지 않는다.

## 판정 초안(judgmentDraft)

처리에 `judge`가 있는 작업 문서 문제는 `judgmentDraft`를 싣는다. 판정 파일(`semantic-authoring.md` 「판정 파일」)의 모양에서 원문을 읽어야 정할 값(`at`, `as`, `state`, `planFile`)을 `null`로 둔 초안이다.

| 코드 | 초안 |
|---|---|
| `tasks.unread-definition`(표 첫 칸 결정) | `{ task, lines: [{ at: null, as: null, id }] }` |
| `tasks.unread-definition`(잔여 질문 행) | `{ task, questions: { items: [{ id, state: null, at: null }] } }`. `id`는 칸 원문의 번호 모양 그대로(`OQ-04·OQ-05` 행은 둘, `R-OQ-01`·`OQ-H2b`는 하나) |
| `tasks.unread-checklist`(계획 파일 불분명) | `{ task, planFile: null }` |
| `tasks.questions-unknown`(잔여 질문 절 없음) | `{ task, questions: { none: { at: null } } }` |
| `tasks.questions-open-done`(닫히지 않은 질문) | `{ task, questions: { items: [{ id, state: null, at: null }] } }` |
| `judgment.stale`(근거 조각 사라짐) | 낡은 판정 항목(`at: null`)과 `candidates: [{ file, line, excerpt }]`(같은 파일에서 그 번호를 가진 줄) |

`judgment.invalid`에는 초안이 없다. 파일 모양 문제는 파일 전체를, 근거 조각 문제는 그 항목만 적용하지 않으며 위반마다 한 건이다. 대상은 `{ kind: 'judgment', id: <작업 폴더> }`이고 첫 근거는 판정 파일(줄 `null`), 나머지는 근거 파일이다. `judgment.stale`이 난 판정이 맡던 규칙 문제(같은 줄의 후보, 같은 번호의 `tasks.questions-open-done`)는 다시 내지 않는다.

## 커밋 전 훅(check --staged)

`livemap check --staged`는 스테이징된 파일 중 작업 설정 `dir` 바로 아래 `<8자리 날짜>-` 작업 폴더 안 파일, 장부 파일(작업 설정 `index`), `map/judgments/*.json`만 대상으로 본다. 목록은 `git diff --cached --name-only --relative --no-renames`에서 얻는다.

- 오류로 세는 문제는 코드가 `tasks.`·`judgment.`로 시작하고 대상이 작업·장부·판정 파일이면서, 대상이 스테이징된 작업 폴더·판정 파일이거나 근거 줄이 스테이징된 대상 파일에 있는 것이다. 나머지 문제는 보이지 않는다.
- `tasks.ambiguous-ref`는 대상이 여정 단계이고 고칠 곳이 여정 파일이라 세지 않는다. 코드만 바꾼 커밋과 과거 작업의 남은 문제는 막지 않는다.
- 대상 파일이 없거나 git 저장소가 아니면 빌드하지 않고 종료 코드 0이다.
- 출력은 문제마다 `✗ <코드> <문구>`, `처리:`, `근거:`(파일:줄과 원문 조각), `판정 초안(judgmentDraft):` 한 줄 JSON이고, 끝 줄이 `map check --staged: 오류 n (…)`와 처리 안내다. 통과는 `map check --staged: 통과 (대상 파일 n)`, 대상 없음은 `map check --staged: 대상 없음`, git 저장소가 아니면 `map check --staged: git 저장소 아님, 건너뜀`이다. `--json`을 함께 주면 `check --json`과 같은 모양으로 낸다.
- 오류가 있으면 종료 코드 1이라 커밋이 멈춘다. 멈춘 출력을 받은 에이전트 세션이 원문을 식별자 줄 규칙대로 고치거나 판정 파일을 써서 스테이징하고 다시 커밋한다. `--no-verify`로 넘기지 않는다.

`livemap init`이 `.githooks/pre-commit`(`npx --no livemap check --staged`)을 만들고 `git config core.hooksPath .githooks`를 둔다. 이미 다른 `core.hooksPath`, 훅 관리자(`.husky`, lefthook 설정, `.pre-commit-config.yaml`), `.git/hooks/pre-commit`, 내용이 다른 `.githooks/pre-commit`이 있으면 덮지 않고 그 설정에 넣을 한 줄을 출력한다. `core.hooksPath`는 git 설정이라 클론마다 한 번 `livemap init`을 돌린다.

## 어댑터가 코드를 붙이는 법

```js
g.issue('warn', '작업 문서', '완료 작업에 닫히지 않은 잔여 질문 1', {
  code: 'tasks.questions-open-done',
  subject: { kind: 'task', id: '20260101-sample' },
  anchors: [{ file: 'tasks/20260101-sample/spec/final.md', line: 12, excerpt: '| OQ-02 | 남은 질문 |' }],
  resolutions: ['judge'],
});
```

- 세 인자 호출(1.1.0 계약)은 그대로 받고 check에서 코드 `adapter.issue`가 된다.
- 넷째 인자는 객체이고 키는 `code`·`subject`·`anchors`·`resolutions`·`judgmentDraft`만 쓴다. 모르는 키가 있으면 `throw`한다. `code`는 `<영역>.<이름>`(소문자·숫자·하이픈) 모양이어야 한다. 아래 표에 있는 코드는 표의 수준과 `level`이 같아야 한다. 형식이 틀리면 `throw`하고 그 어댑터는 failed가 된다.
- `subject`·`anchors`·`resolutions`를 빼면 `null`·`[]`·표의 처리 값이 들어간다. 표에 없는 프로젝트 코드는 처리 기본값이 `[]`다.
- 넷째 인자를 준 문제만 `graph.json`·`data.json` `issues[]`에 `code`·`subject`·`anchors`·`resolutions`(있으면 `judgmentDraft`)가 더해진다.

## 2.1.0 새 코드

구조 지도(Graphify 어댑터·다리·선언 대조)의 코드다. 1.2.0 새 코드처럼 6건 이상을 한 줄로 묶지 않는다. 대상이 `설정`인 코드의 `subject`는 설정 키(`{ kind: 'config', id: 'architecture.graph' }`)이거나, 다리가 짝을 못 찾은 노드(`{ kind: 'table', id }`)다.

| 코드 | 수준 | 대상 | 처리 | 뜻 |
|---|---|---|---|---|
| `architecture.graph-schema` | error | 설정 | engine·config | `graph.json` 최상위 키 여섯(`directed`·`multigraph`·`graph`·`nodes`·`links`·`hyperedges`)이나 반드시 있는 노드 필드 여섯(`id`·`label`·`community`·`community_name`·`file_type`·`source_file`)·링크 필드 여덟(`source`·`target`·`relation`·`confidence`·`confidence_score`·`source_file`·`source_location`·`weight`)이 없다. 반쯤 읽은 그래프로 노드를 싣지 않는다 |

## 1.2.0 새 코드

| 코드 | 수준 | 대상 | 처리 | 뜻 |
|---|---|---|---|---|
| `tasks.unread-definition` | warn | 작업 | source·judge | 스펙 final 표 첫 칸의 DEC 번호, 잔여 질문 절에서 첫 칸이 번호 하나가 아닌 행 |
| `tasks.unread-checklist` | warn | 작업 | source·judge | 계획 파일이 없는 작업에 체크박스를 가진 루트 md가 둘 이상 |
| `tasks.stage-unknown` | warn | 작업 | source | 진행·대기 작업에 파이프라인 문서가 없음 |
| `tasks.questions-unknown` | warn | 작업 | source·judge | 스펙 final에 잔여 질문 절이 없음 |
| `tasks.questions-open-done` | warn | 작업 | judge | 완료 작업의 잔여 질문 행이 계획 항목으로 닫히지 않음 |
| `tasks.index-section-unknown` | warn | 장부 | source | 표시어가 없는 절에 작업 링크 행이 있음 |
| `tasks.ambiguous-ref` | warn | 단계 | source | 여정 refs 번호를 정의한 작업이 둘 이상 |
| `judgment.invalid` | error | 판정 파일 | judge | JSON·스키마 위반, 없는 파일·폴더, 조각을 가진 줄이 여럿, 번호 없는 근거 줄 |
| `judgment.stale` | warn | 판정 파일 | judge | 근거 조각을 가진 줄이 원문에 없음 |
| `router.unknown-api` | warn | 화면 | code·config | 리터럴 경로에 맞는 API 노드가 없음 |
| `router.hookapi-redundant` | warn | 설정 | config | hookApi 항목이 리터럴로도 연결됨(지워도 됨), 설정 키 하나에 한 건 |
| `router.hookapi-only` | warn | 설정 | code·config | hookApi로만 연결되는 항목, 설정 키 하나에 한 건 |
| `journey.api-not-observed` | warn | 단계 | source·code | 여정 `apis`에 있으나 어느 화면에서도 관측되지 않음 |

## 1.3.0 새 코드

로드맵 선행의 흐름을 보는 경고 두 건이다. 문장은 `data.json`의 `roadmap[].problems`에 실리고 로드맵 화면 카드의 경고 줄로 보인다. `check`는 둘 다 경고(`△`)로 내므로 CI를 막지 않는다. 판정 규칙은 로드맵 화면 트리(`ui/lib/tree.js`)와 같다. 1.2.0 새 코드처럼 6건 이상을 한 줄로 묶지 않는다.

| 코드 | 수준 | 대상 | 처리 | 뜻 |
|---|---|---|---|---|
| `roadmap.dep-cycle` | warn | 로드맵 항목 | source | 선행이 돌고 돌아 자기에게 되돌아온다. 순환에 든 항목마다 `선행 순환: {id} → {id} → …`(자기에서 시작해 선행 → 후속 방향으로 돌아오는 가장 짧은 경로). 순환 항목을 선행으로 가진 뒤쪽 항목에는 싣지 않는다 |
| `roadmap.milestone-backward` | warn | 로드맵 항목 | source | 마일스톤 절이 있을 때 선행이 항목보다 오른쪽 열(마일스톤 절 순서, 미배정·없는 id는 맨 오른쪽)에 있다. 엣지마다 항목 쪽에 `마일스톤 순서 역행: {선행 id}({마일스톤}) → {항목 id}({마일스톤})`. `{마일스톤}`은 마일스톤 id이고 미배정이면 `마일스톤 없음`이다. 고치는 방법은 둘이다 — 파일에서 마일스톤 절 순서를 바꾸거나, 그 항목의 선행을 고친다 |

## 1.1.1 check 줄의 코드

문구는 1.1.1과 같다. 괄호 안 문구는 줄의 앞부분이다.

| 코드 | 수준 | 대상 | 처리 | 뜻 |
|---|---|---|---|---|
| `adapter.failed` | error | 어댑터 | code·engine | 어댑터가 throw함("어댑터 실패 …") |
| `adapter.issue` | 어댑터가 정함 | 어댑터 | — | 어댑터가 코드 없이 `g.issue` 세 인자로 낸 문제 |
| `floor.below` | error | 설정 | code·config·engine | 노드 수가 `floors` 바닥값 미만("바닥값 미달 …") |
| `journey.duplicate-id` | error | 여정 | source | 여정 id 중복 |
| `journey.no-steps` | error | 여정 | source | 여정에 장면 없음 |
| `journey.actor-unknown` | warn | 여정 | source | 여정·장면 배우가 배우 사전에 없음 |
| `journey.subtype-unknown` | warn | 단계 | source | 단계의 `하는 사람`이 역할 파일 `## 하위 유형` 표에 없음(2.0.0, md 정본) |
| `semantic.empty` | error | 설정 | config·source | 설정 `semantic`이 있는데 여정이 0건(읽기가 조용히 비었을 때 막는다) |
| `step.no-test` | error | 단계 | source | 동작·목업 단계에 지나는 검사가 없음. 대응표 `noTest`에 이유를 적으면 면제(2.0.0) |
| `tests.route-not-in-journey` | warn | 검사 | source | 검사가 지나는데 어느 단계에도 없는 화면(2.0.0) |
| `journey.handoff-missing-step` | error | 단계 | source | 단계의 `**넘김**`이 가리키는 단계 ID가 없음(2.0.0) |
| `journey.handoff-unpaired` | warn | 단계 | source | 받는 역할 파일의 `## 넘겨받는 일`에 그 단계가 없음(2.0.0) |
| `journey.start-unknown` | error | 여정 문서 | source | 파일 머리·하위 유형 표의 `시작 지점`이 단계 ID가 아님(2.0.0) |
| `journey.doc-changed-after-review` | warn | 여정 문서 | source | 역할 파일이 `사용자 확인` 날짜 뒤에 바뀜(2.0.0) |
| `tests.tag-unknown` | warn | 검사 | source | 브라우저 검사의 단계 태그가 여정에 없는 단계를 가리킴 |
| `step.duplicate-id` | error | 여정 | source | 한 여정 안에서 장면 id 중복 |
| `step.intent-empty` | warn | 단계 | source | 장면 intent 비어 있음 |
| `step.route-missing` | error | 단계 | source·code | 장면이 가리키는 라우트 없음 |
| `step.ref-unresolved` | error | 단계 | source | 장면 refs 번호를 정의한 작업 없음(참조 미해결) |
| `step.screen-not-live` | error | 단계 | source·code | 장면은 동작인데 화면이 실데이터가 아님 |
| `step.screen-live-early` | warn | 단계 | source | 장면은 planned·next인데 화면은 동작 |
| `step.no-evidence` | error | 단계 | source·code | 동작 주장에 관측 근거 없음 |
| `step.review-stale` | warn | 단계 | source | 장면 확인일 뒤 화면 변경(확인 필요) |
| `step.warning` | 문구에 따름 | 단계 | source | 위 규칙에 맞지 않는 장면 경고 문구(대체 코드) |
| `step.unknown-status` | error | 단계 | source | 장면 상태 어휘가 아님 |
| `step.planned-has-screen` | warn | 단계 | source | planned 장면에 화면이 있음 |
| `step.capture-missing` | warn | 단계 | source | 장면 캡처 파일 없음 |
| `roadmap.duplicate-id` | error | 로드맵 항목 | source | 로드맵 id 중복 |
| `roadmap.scene-missing` | error | 로드맵 항목 | source | 항목이 가리키는 장면 없음 |
| `roadmap.task-missing` | error | 로드맵 항목 | source | 항목이 가리키는 작업 폴더 없음 |
| `roadmap.dep-missing` | error | 로드맵 항목 | source | 선행 항목 없음 |
| `roadmap.unknown-status` | error | 로드맵 항목 | source | 항목 상태 어휘가 아님 |
| `roadmap.milestone-missing` | error | 로드맵 항목 | source | 항목이 가리키는 마일스톤 없음 |
| `roadmap.problem` | error | 로드맵 항목 | source | 위 규칙에 맞지 않는 로드맵 오류 문구(대체 코드) |
| `roadmap.running-no-task` | warn | 로드맵 항목 | source | 진행인데 작업 폴더가 없음 |
| `roadmap.running-no-milestone` | warn | 로드맵 항목 | source | 진행인데 마일스톤 없음 |
| `roadmap.running-open-deps` | warn | 로드맵 항목 | source | 진행인데 선행 미완 |
| `milestone.no-id` | error | 마일스톤 | source | 마일스톤 id 없음 |
| `milestone.duplicate-id` | error | 마일스톤 | source | 마일스톤 id 중복 |
| `milestone.unknown-status` | error | 마일스톤 | source | 마일스톤 상태 어휘가 아님 |
| `milestone.bad-date` | error | 마일스톤 | source | 완료일·목표일 날짜 형식 |
| `milestone.problem` | error | 마일스톤 | source | 위 규칙에 맞지 않는 마일스톤 오류 문구(대체 코드) |
| `milestone.done-open-items` | warn | 마일스톤 | source | 완료인데 미완료 항목 |
| `milestone.all-items-done` | warn | 마일스톤 | source | 항목이 모두 완료인데 상태가 완료 아님 |
| `milestone.running-items` | warn | 마일스톤 | source | 다음·대기·이후인데 진행 항목이 있음 |
| `milestone.no-items` | warn | 마일스톤 | source | 묶인 항목 없음 |
| `milestone.completed-on-mismatch` | warn | 마일스톤 | source | 완료일과 상태가 맞지 않음 |
| `milestone.warning` | warn | 마일스톤 | source | 위 규칙에 맞지 않는 마일스톤 경고 문구(대체 코드) |
| `milestone.multiple-running` | warn | 마일스톤 | source | 진행 마일스톤이 둘 이상 |
| `orphan.screens` | warn | 화면 | source | 여정에 없는 화면 |
| `orphan.apis` | warn | API | code·source | 어느 화면도 부르지 않는 API |
| `orphan.tests` | warn | 검사 | code | 라우트·API에 붙지 않는 검사 |
| `deploy.behind-unknown` | warn | 배포 | config | 배포 sha가 main 이력에 없어 뒤처짐을 계산하지 못함 |
