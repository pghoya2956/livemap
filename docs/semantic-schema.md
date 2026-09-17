# 프로젝트 상황판의 시맨틱 레이어

상황판은 두 종류의 사실을 하나의 그래프로 잇는다. 사람이 뜻을 붙이는 노드(여정·단계·결정·로드맵 항목·마일스톤)와 코드에서 긁어내는 노드(화면·API·함수·테이블·검사·커밋)다. 둘이 어긋나면(단계가 가리키는 라우트가 코드에 없음) 화면에 경고로 드러난다.

사람이 적는 곳은 넷이다: 여정 파일(`semantic`), 로드맵(`roadmap.file`, 마일스톤 포함), 작업 장부(`tasks.index`), 작업 폴더 문서(`tasks.dir`의 스펙·계획). 나머지는 생성기가 저장소를 스캔해 만든다. 작성 방법은 `semantic-authoring.md`에 있다.

화면은 journey를 "기능", step을 "단계"로 부른다. 노드 종류·파일 키는 그대로다.

## 노드

| 종류 | 출처 | 키 | 뜻 |
|---|---|---|---|
| journey | 손(journeys.json) | id | 한 배우가 한 목표를 이루는 흐름. 스토리 맵의 backbone 한 칸 |
| step | 손 | journey/step | 여정 안의 한 장면. intent(사용자가 원하는 것)·status·capture |
| screen | 생성(라우터) | route path | 화면 하나. 페이지 파일, 데이터 출처(live/mock/mixed), 호출 API, 검사, 마지막 변경 |
| api | 생성(BFF) | method+path | 서버 진입점. 호출하는 DB 함수·Auth |
| function | 생성(migration) | name | DB 함수. 읽고 쓰는 테이블, BFF 사용 여부 |
| table | 생성(migration) | schema.name | 저장 구조 |
| migration | 생성(migration) | file | migration 파일 하나. 만드는 테이블·함수, grant·RLS 수, 마지막 변경 |
| test | 생성(tests/) | file | 검사 파일. 다루는 라우트·API |
| testreport | 생성(JUnit 리포트) | last | 마지막 검사 실행의 건수·실패·건너뜀과 그 커밋이 최신인지 |
| commit | 생성(git) | sha | 최근 변경. 건드린 파일 → 영향받는 화면·여정 |
| decision | 생성(위키 index, 작업 문서) | file 또는 번호 | 위키 결정 페이지와 상태(current/proposed/superseded). 작업 문서의 `- DEC-nn`(스펙 결정)과 `- [ ] PN-nn`(계획 항목, 완료 여부)도 이 종류로 둔다 |
| task | 생성(작업 폴더 `tasks.dir`) | 폴더 이름 | 작업 하나. 제목·단계(스펙 초안~검증)·상태·결정 수·계획 항목 완료/미완·열린 질문 수. 계획 항목은 계획 문서(`task_plan.md`, 없으면 `plan.md`)에서만, 결정·열린 질문은 `spec/final.md`에서만 센다 |
| ledger | 생성(tasks/index.md) | 행 | 지금 실행 중·대기 중인 작업 |
| deploy | 생성(git·배포 매니페스트) | head, 배포 대상 | 브랜치 머리 커밋, 매니페스트 이미지 태그의 sha와 뒤처진 커밋 수 |
| milestone | 손(로드맵 `## 제목` 절) | id | 로드맵 항목. 순서·상태·진행 방식·장면·작업·선행·결정 대기·완료 기준·마일스톤, git 이력에서 계산한 완료일(`completedAt`)·결정 대기 시작일(`waitingSince`) |
| release | 손(로드맵 `## 마일스톤: 제목` 절, 1.1.0부터) | id | 마일스톤. 순서·상태·목표·완료일·목표일·결정 대기와 그 시작일. 1.x 동안의 임시 이름이고 2.0.0에서 로드맵 항목은 `roadmapItem`, 마일스톤은 `milestone`으로 바꾼다 |

## 엣지

- journey → step (순서)
- step → screen (shows): `screens: [route]`
- step → api (uses): 명시(`apis`) 또는 screen을 거쳐 유도
- screen → api (calls): 페이지와 그 로컬 import 닫힘에서 query hook 스캔
- api → function (invokes): BFF 핸들러 블록의 `rpc/<name>`
- function → table (touches): 함수 본문에서 알려진 테이블 이름 스캔
- test → screen | api (covers): 검사 파일의 `goto('/…')`·`'/api/…'` 문자열
- commit → screen | api | function (touches): 파일 경로 → 노드(페이지 파일·닫힘·server.mjs·migration)
- milestone → task (tracks): 로드맵 항목의 `작업`. 장면·선행은 derive에서 해석하고 없으면 check 오류
- release → milestone (contains): 로드맵 항목의 `마일스톤` 키. 없는 마일스톤 id면 엣지 없이 check 오류
- task → decision (defines): 작업 문서의 `- DEC-nn`·`- [ ] PN-nn` 줄
- step → decision (refs): `refs: ["DEC-57", "PN-15", "trust-boundary"]`. derive가 문자열로 해석한다: `DEC-nn`·`PN-nn`은 그 번호를 정의한 작업(defines)으로, 나머지는 위키 결정 slug로 찾는다

## 상태 규칙

- screen.source: 페이지(및 로컬 import 닫힘)가 `mock/`을 쓰면 mock, `lib/queries`를 쓰면 live, 둘 다면 mixed.
- screen.fixedVia: 닫힘이 `fixedPattern`(코드에 고정된 표시값)을 읽는 파일. source는 바꾸지 않고 "하드코딩 표시"로 따로 센다.
- step.status는 손으로 적되 screens의 source와 대조해 어긋나면 경고(live 단계인데 mock 화면 등).
- journey.status는 단계에서 유도: 전부 live면 live, 하나라도 live면 partial, 아니면 단계 다수 상태.
- 로드맵 항목 막힘(`blockedBy`): `waiting`(완료 아님 + 결정 대기), `deps`(진행·다음인데 선행 미완), `task`(추적 작업 중 대기). 마일스톤은 자신의 결정 대기가 있거나 소속 비완료 항목 중 막힌 것이 있으면 `blocked`.
- 현재 마일스톤: 파일 순서로 상태가 진행인 첫 마일스톤, 없으면 다음인 첫 마일스톤, 없으면 없음.

## 문제 기록(issues)

어댑터가 `g.issue(level, label, message)`로 낸 오류·경고는 노드가 아니라 `graph.json`·`data.json` 최상위 `issues[]`에 `{level, label, message, adapter}`로 남는다(1.1.0부터, `adapter-contract.md`).

## 다른 프로젝트에 옮길 때 바꾸는 것

스캐너(라우터·서버·migration·검사 형식)만 어댑터로 갈아끼운다. journeys.json 형식·화면·상태 규칙은 그대로 둔다. 어댑터가 없는 종류는 비워도 화면이 깨지지 않는다.
