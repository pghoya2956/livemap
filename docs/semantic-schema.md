# 프로젝트 상황판의 시맨틱 레이어

상황판은 두 종류의 사실을 하나의 그래프로 잇는다. 사람이 뜻을 붙이는 노드(여정·단계·결정)와 코드에서 긁어내는 노드(화면·API·함수·테이블·검사·커밋)다. 손으로 유지하는 것은 여정 파일 하나이고, 나머지는 생성기가 저장소를 스캔해 만든다. 둘이 어긋나면(단계가 가리키는 라우트가 코드에 없음) 화면에 경고로 드러난다.

## 노드

| 종류 | 출처 | 키 | 뜻 |
|---|---|---|---|
| journey | 손(journeys.json) | id | 한 배우가 한 목표를 이루는 흐름. 스토리 맵의 backbone 한 칸 |
| step | 손 | journey/step | 여정 안의 한 장면. intent(사용자가 원하는 것)·status·capture |
| screen | 생성(라우터) | route path | 화면 하나. 페이지 파일, 데이터 출처(live/mock/mixed), 호출 API, 검사, 마지막 변경 |
| api | 생성(BFF) | method+path | 서버 진입점. 호출하는 DB 함수·Auth |
| function | 생성(migration) | name | DB 함수. 읽고 쓰는 테이블, BFF 사용 여부 |
| table | 생성(migration) | schema.name | 저장 구조 |
| test | 생성(tests/) | file | 검사 파일. 다루는 라우트·API |
| commit | 생성(git) | sha | 최근 변경. 건드린 파일 → 영향받는 화면·여정 |
| decision | 생성(위키 index) | file | 결정 페이지와 상태(current/proposed/superseded) |
| plan | 생성(task 문서) | file | PN 체크 진척과 열린 질문 수 |
| ledger | 생성(tasks/index.md) | 행 | 지금 실행 중·대기 중인 작업 |
| milestone | 생성(tasks/roadmap.md) | id | 로드맵 항목. 순서·상태·진행 방식·장면·작업·선행·결정 대기·완료 기준 |

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
- step → decision | plan (refs): `refs: ["DEC-57", "PN-15", "trust-boundary"]` 문자열 매칭

## 상태 규칙

- screen.source: 페이지(및 로컬 import 닫힘)가 `mock/`을 쓰면 mock, `lib/queries`를 쓰면 live, 둘 다면 mixed.
- screen.fixedVia: 닫힘이 `fixedPattern`(코드에 고정된 표시값)을 읽는 파일. source는 바꾸지 않고 "하드코딩 표시"로 따로 센다.
- step.status는 손으로 적되 screens의 source와 대조해 어긋나면 경고(live 단계인데 mock 화면 등).
- journey.status는 단계에서 유도: 전부 live면 live, 하나라도 live면 partial, 아니면 단계 다수 상태.

## 다른 프로젝트에 옮길 때 바꾸는 것

스캐너(라우터·서버·migration·검사 형식)만 어댑터로 갈아끼운다. journeys.json 형식·화면·상태 규칙은 그대로 둔다. 어댑터가 없는 종류는 비워도 화면이 깨지지 않는다.
