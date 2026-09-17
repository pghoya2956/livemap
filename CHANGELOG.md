# Changelog

버전마다 `## [X.Y.Z] - YYYY-MM-DD` 절을 둔다. 릴리스 워크플로가 태그 버전의 절이 있는지 확인한다.

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
