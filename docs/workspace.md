# 여러 저장소 워크스페이스

상위 폴더 하나가 자식 저장소 여럿을 묶는 프로젝트에서, 상위 폴더의 상황판 하나가 상위와 자식들의 작업·결정·최근 변경·저장소 상태를 저장소 표시를 붙여 한 그래프로 합친다(2.2.0). 제품 화면·API·DB·여정은 합치지 않고 각 자식 상황판으로 링크한다. 자식 저장소는 읽기만 하고 파일을 쓰지 않는다.

묶음의 정본은 상위 폴더의 표식 파일 `.agent/repos.yaml`이다. 이 파일은 표식 파일을 관리하는 하네스 스킬이 쓰고, 엔진은 같은 문법으로 읽는다. 상위 `map/config.json`에 `workspace` 키를 적어야 켜진다. 표식 파일만 있고 키가 없으면 지금처럼 한 루트 빌드다.

## 설정

```json
"workspace": {
  "repos": ".agent/repos.yaml",
  "children": {
    "app": { "board": "https://app.example/map/" },
    "svc": { "config": { "git": { "areas": [["src/", "서버"]] } } }
  }
}
```

| 키 | 뜻 |
|---|---|
| `repos` | 표식 파일 경로(상위 루트 기준). 필수. 비었거나 파일이 없으면 `repos.marker-missing` 오류 |
| `children.<path>.board` | 그 자식의 상황판 주소. 없으면 링크를 만들지 않는다. 자식 `project.host`에서 추정하지 않는다(그 주소가 `/map/`을 서빙하는지 엔진이 알 수 없다). `http:`·`https:`로 시작하지 않으면 링크 대신 글자로 보인다 |
| `children.<path>.config` | 자식에 `map/config.json`이 없을 때 쓰는 대체 설정. 자식에 설정이 있으면 쓰지 않는다 |

`<path>`는 표식 파일 `repos:` 항목의 `path` 값 그대로다. `/`가 든 경로(`apps/web`)도 받는다.

`livemap init`은 현재 폴더에 `.agent/repos.yaml`이 있으면 워크스페이스 틀(`templates/config.workspace.json`)을 `map/config.json`으로 쓴다. 틀에는 `workspace`·`tasks`·`wiki`·`git`·`budget`이 있고 `floors`는 없다. 상위에는 화면·API가 없어 기본 틀의 바닥값이 `floor.below` 오류를 내기 때문이다. 여정 틀(`map/semantic/journeys.json`)과 구조 틀(`map/architecture/`)도 만들지 않는다. 제품 축은 자식 상황판에 있다.

## 자식 설정 세 갈래

자식마다 아래 순서로 설정을 고르고, 저장소 절의 `config` 값에 어느 갈래였는지 남긴다.

| 갈래 | 조건 | 쓰는 설정 |
|---|---|---|
| `child` | 자식에 `map/config.json`이 있다 | 그 파일 그대로. 자식 상황판과 같은 계산 경로라 숫자가 맞는다(엔진 판이 같을 때) |
| `override` | 자식 설정이 없고 `children.<path>.config`가 있다 | 자동 설정 위에 대체 설정을 합친 것 |
| `auto` | 둘 다 없다 | 자동 설정 그대로 |

합치는 규칙: 최상위 키는 대체 설정이 이기고, `git`·`tasks`·`wiki`는 안쪽 키 단위로 한 번 더 합친다. git 어댑터는 `branch`·`sinceDays`·`runtimePaths`를 바로 읽어 하나만 빠져도 실패하므로, 바꾸고 싶은 키만 적어도 돌게 한 것이다. 예를 들어 대체 설정이 `git.areas`만 주면 나머지 git 키는 자동 설정 값이 남는다.

자동 설정의 키 전체는 다음과 같다.

```json
{
  "engine": 2,
  "project": { "name": "<path>" },
  "adapters": ["tasks", "wiki", "git"],
  "tasks": { "dir": "tasks", "index": "tasks/index.md" },
  "wiki": { "index": ".agent/wiki/index.md" },
  "git": { "branch": "<표식의 branch, 없으면 main>", "sinceDays": "<상위 git.sinceDays, 없으면 14>", "areas": [], "runtimePaths": [] }
}
```

`adapters`는 자식에 `tasks/`가 있을 때 `tasks`, `.agent/wiki/index.md`가 있을 때 `wiki`를 넣고 `git`은 항상 넣는다. `areas`가 빈 목록이면 모든 커밋이 「기타」 영역이 된다.

자식 설정의 `engine`이 상위 엔진의 major와 다르면 그 자식은 자동 설정으로 대신 읽고 `repos.child-engine-mismatch` 경고를 낸다. 저장소 절의 `config`는 `auto`가 된다.

자식 빌드는 항상 한 루트 빌드(`workspace: false`)다. 자식이 자기 표식 파일이나 `workspace` 키를 가져도 펼치지 않는다. 자식 빌드는 `map/.out/`이나 구조 지도 스킬 사본을 쓰지 않는다. 자식 프로젝트 어댑터(`<자식>/map/adapters/`)는 상위 엔진 프로세스에서 자식 루트로 돈다.

## 무엇을 합치나

자식 그래프에서 `task`·`decision`·`commit`·`ledger` 넷만 가져온다. 이 넷이 상위 폴더가 소유하는 축(작업 장부·위키·스펙)과 같다.

| 항목 | 규칙 |
|---|---|
| id | `<path>:<id>`. 예: `app:20260101-shared`, 커밋 `app:a828831`, 번호 정의 `app:DEC-3`, 장부 `app:running-0`. 상위 노드 id는 그대로 둔다 |
| props | 원래 props에 `repo: <path>`를 더한다. 상위 노드는 `repo`가 없고 뷰에서 `'.'`로 읽는다 |
| props 안의 작업 이름 | 번호 정의 노드의 `definers[]`와 `definedAt[].task`에도 같은 접두를 붙인다. 그래야 `defines` 엣지와 props가 같은 노드를 가리킨다 |
| 경로 값 | `src.file`과 props의 `file`·`planFile`·`specFile`·`judged`는 자식 루트 기준 그대로 둔다. 화면이 `<repo>/`를 붙여 보인다 |
| 엣지 | 두 끝이 모두 가져온 노드인 엣지만 접두를 붙여 옮긴다. 지금은 작업 → 결정 `defines`뿐이다 |
| 합치지 않는 것 | 자식 `deploy` 노드, 자식 이슈, 자식 배지, 제품 축 노드(여정·화면·API·DB·구조). 자식 이슈는 자식 `check`가 맡고 상위에는 저장소 절의 오류·경고 수로만 보인다 |

접두 문자 `:`는 작업 폴더 이름에 나오지 않는다. 화면 주소는 이름을 `encodeURIComponent`로 싸므로 `#/tasks/app%3A20260101-shared`처럼 한 조각이 된다. 두 저장소에 같은 작업 폴더 이름이 있어도 접두 덕에 두 노드로 남는다.

## 저장소 절

`data.json` 최상위 `repos`. 상위가 첫 행이다. `workspace` 키가 없으면 이 절이 없다.

```json
"repos": [
  { "path": ".", "name": "Workspace", "role": null, "branch": "main", "head": "113ccb9", "build": "ok", "commits": 1, "tasks": { "진행": 1, "완료": 1 }, "drift": [] },
  { "path": "app", "name": "app", "role": "앱 저장소", "branch": "main", "head": "21bf1a5", "build": "ok", "config": "child",
    "engine": { "installed": null, "used": "2.2.0" }, "board": "https://app.example/map/", "commits": 1, "tasks": { "진행": 1, "완료": 1 },
    "summary": { "stepsLive": 0, "stepsTotal": 0, "warnings": 1, "deployBehind": null, "errors": 0 }, "drift": [] }
]
```

| 필드 | 뜻 |
|---|---|
| `build` | `ok`, `failed`(자식 설정이 깨졌거나 자식 빌드가 던짐), `missing`(폴더 없음), `skipped`(상위가 워크트리) |
| `config` | `child`·`override`·`auto` 중 하나 |
| `engine.installed` | 자식 `node_modules/@pghoya2956/livemap/package.json`의 판. 파일이 없으면(`npm ci` 전, 다른 머신) `null`이고 화면에 「설치 안 됨」 |
| `engine.used` | 상위 엔진 판. 자식을 실제로 계산한 판이다 |
| `commits`·`tasks` | 자식 설정의 창(`git.sinceDays`)으로 센 커밋 수와 작업 상태별 수 |
| `summary.errors`·`warnings` | 자식 자료에 `check`(`--strict` 없이)를 돌린 오류·경고 수 |
| `summary.deployBehind` | 자식 배포 뒤처짐. 모르면 `null` |
| `drift` | 그 저장소에 걸린 어긋남 항목(`{ rule: 'R1'…'R4', … }`) |

`overview.json`에는 `repos: [{ name, role, build, commits, running, stepsLive, stepsTotal, drift }]`와 `signals.reposDrift`, 최근 변경 행의 `changes[].repo`를 싣고, 상위 제품 축이 비면 `productEmpty: true`와 `work`(진행 작업 `work.tasks`, 장부 진행 행 `work.ledger`, 결정 `work.decisions`, 행마다 `repo`)를 더한다(2.3.0). 개요의 `repo`는 경로가 아닌 저장소 이름이다. 상위는 프로젝트 이름, 자식은 표식의 `path`다. HEAD·상황판 주소·경로는 개요 식별자 예산(`view-budget.md`) 때문에 싣지 않는다.

어댑터 목록(`data.adapters`)에는 자식마다 `repo:<path>` 한 줄이 생긴다. 상태는 `ok` 아니면 `partial`이고 `failed`는 쓰지 않는다(`adapter-contract.md` 「워크스페이스 상태 줄」).

## 저장소 어긋남과 이슈

표식 목록과 디스크를 표식 파일 관리 스킬의 점검 스크립트와 같은 기준으로 대조한다. 경고로만 내고 `--strict`에서도 오류로 올리지 않는다. 엔진은 고치지 않는다. 코드의 뜻과 처리는 `issue-codes.md` 「2.2.0 새 코드」가 정본이다.

| 판정 | 코드 | 할 일 |
|---|---|---|
| R1 목록에만 있음: 자식 폴더가 없거나 `.git`이 없다(`root.url`이 있는데 상위에 `.git`이 없는 경우 포함) | `repos.listed-only` | 이 머신에 자식 저장소를 연결한다(클론하거나 파일만 온 폴더에 git을 잇는다). 쓰지 않는 저장소면 목록에서 뺀다 |
| R2 디스크에만 있음: 상위 바로 아래 점으로 시작하지 않는 폴더가 `.git`을 가졌는데 목록에 없다 | `repos.disk-only` | 목록에 더하거나 상위 폴더 밖으로 옮긴다 |
| R3 상위 색인에 있음: 상위 저장소 색인에 자식 경로 파일이나 gitlink가 있다 | `repos.parent-index` | 상위 색인에서 뺀다(`git rm -r --cached <path>`). 상위 `.gitignore`가 자식 폴더를 막는지 본다 |
| R4 원격 불일치: 목록 `url`과 실제 `origin`이 다르다(상위 포함) | `repos.remote-mismatch` | 목록 `url`이나 그 저장소의 `origin`을 맞춘다 |
| 표식 파일 없음·형식 밖 줄 | `repos.marker-missing`·`repos.marker-unreadable`(오류) | 경로를 고치거나 근거 줄의 줄 번호를 형식에 맞춘다. 상위만 빌드한다 |
| 자식 빌드 실패 | `repos.child-build-failed` | 자식 `map/config.json`(없으면 `children.<path>.config`)을 고친다 |
| 엔진 major 불일치 | `repos.child-engine-mismatch` | 자식 저장소의 엔진을 상위와 같은 major로 맞춘다 |

git은 호출마다 5초 제한을 둔다. git을 돌리지 못했으면(실행 파일 없음, 시간 초과) R3·R4를 건너뛰고, git이 돌았는데 `origin`이 없으면 빈 값이 목록과 달라 R4를 낸다. 상위의 `.git`이 파일(`git worktree add`로 만든 연결된 워크트리)이면 자식 폴더가 없으므로 판정과 자식 빌드를 모두 건너뛰고 `repo:<path>`를 partial 「워크트리라 자식 저장소 없음」으로 남긴다.

자식의 문제는 상위 `check`를 막지 않는다. 자식 게이트는 자식 CI가 맡는다. 자식 빌드가 실패해도 상위 `build`·`check`는 종료 코드 0이고 `adapter.failed`도 나지 않는다.

## 화면

내비는 여섯 그대로다. 저장소 축은 기존 화면 안에 들어간다. 워크스페이스가 아니면 아래 표면은 하나도 보이지 않는다.

| 자리 | 보이는 것 |
|---|---|
| 더보기 「저장소」 탭(`#/more/repos`) | 저장소마다 역할·브랜치·HEAD·빌드·설정 출처·14일 변경·진행 작업·자식 오류·어긋남·엔진 판·상황판 링크. 행에 `data-repo="<path>"` |
| 작업 화면(`#/tasks`) | 저장소 필터 칩(`data-repo-filter="<path>"`, 기본 전체)과 행의 저장소 태그 |
| 변화 탭(`#/more/changes`) | 커밋 행의 저장소 태그 |
| 개요 전광판 | 자식마다 「<이름> 동작 단계 x/y」 또는 「<이름> 14일 변경 n」 |
| 개요 특보 | 어긋남이 있으면 「저장소 어긋남 n」 → `#/more/repos` |
| 개요 최근 변경 | 행 메타에 저장소 이름(「n분 전 · <저장소>」, 2.3.0) |
| 개요 기능 지도 | 상위에 여정이 없고 화면·API·DB 함수 중 하나라도 있으면 「제품 기능은 각 저장소 상황판에 있습니다」와 저장소 탭 링크. 제품 축이 모두 비면 기능 지도 대신 아래 「개요 수치의 뜻」의 저장소·작업 패널이 선다 |
| 개요 진행 중인 작업(2.3.0) | 저장소 칩(`data-repo-filter="<이름>"`, 0건 칩 포함)과 행의 저장소 태그(`data-repo-tag`) |

## 개요 수치의 뜻

작업·결정·커밋·장부를 합쳤으므로 그 넷에서 계산하는 기존 수치는 프로젝트 전체 값이 된다. 전광판 「14일 변경」·「제품 코드 변경」·「확정 결정」·「열린 질문」, 개요 활동 막대, 진행 작업 목록, 장부 목록, 요약 줄의 「다음:」이 그렇다. 개요 활동은 상위 `git.sinceDays` 창으로 거르고, 변화 탭은 저장소마다 자기 설정의 창을 보인다. 저장소별 값은 전광판 저장소 항목과 저장소 탭에서 가른다.

상위에 여정·단계·화면·API·DB 함수가 하나도 없으면(`productEmpty`, 2.3.0부터 여정 수도 본다) 전광판의 제품 축 항목(동작 단계·완성 기능·실데이터 화면·API·DB 함수)을 빼고 저장소 항목으로 대신한다. 측정하지 않은 값을 0/0으로 보이지 않기 위해서다.

같은 조건에서 개요는 비어 있을 제품 패널 자리 여섯을 저장소·작업 패널로 바꾼다(2.3.0). 패널 수는 8 그대로다. 로드맵이나 마일스톤이 있으면 첫 자리는 마일스톤·로드맵 패널로 남고, 저장소 표가 둘째 자리로 내려가며 진행 작업 분포는 빠진다. 여정을 아직 쓰지 않은 단일 저장소 프로젝트도 같은 배치이고, 저장소 표는 프로젝트 한 행과 여정 안내 한 줄, 진행 작업 분포는 단계 막대, 저장소별 변경은 14일 사람 커밋 날짜 추이다.

| 자리 | 제품 축 있음 | 제품 축 빔 | 제품 축 빔, 로드맵 있음 |
|---|---|---|---|
| 왼쪽 1 | 마일스톤·로드맵 | 저장소 표 | 마일스톤·로드맵 |
| 왼쪽 2 | 진척 | 진행 작업 분포 | 저장소 표 |
| 왼쪽 3 | 최근 변경 | 최근 변경 | 최근 변경 |
| 가운데 큰 칸 | 기능 지도 | 진행 중인 작업 | 진행 중인 작업 |
| 가운데 아래 | 기능별 변경 · 특보 | 저장소별 변경 · 특보 | 저장소별 변경 · 특보 |
| 오른쪽 | 화면 캡처 · 기능 현황 | 장부 · 결정 | 장부 · 결정 |

저장소별 변경 막대는 자식 빌드의 14일 커밋(자동 커밋 포함, 저장소 표와 전광판 저장소 항목과 같은 값)이라 머리에 「14일 커밋 · 자동 포함」을 적는다. 최근 변경 머리의 사람 커밋 수와 다를 수 있다. 장부 패널 머리 「진행 n」과 결정 패널 머리 「확정 n · 제안 m」, 목록의 「외 n」은 20행 상한으로 자르기 전 전체 수에서 센다.

작업 목록은 접두를 뗀 폴더 이름 순(날짜 내림차순)으로 정렬하고 같은 이름이면 상위가 먼저다. 위키 결정의 단계 참조 수는 같은 저장소의 같은 파일만 센다.

## 명령과 비용

- `build`·`check`·`serve`는 자식을 차례로 빌드한다. `serve`는 마지막 빌드에서 5초가 지난 데이터 요청마다 다시 빌드하므로 자식 빌드 시간만큼 기다린다.
- `check --staged`(커밋 전 훅)와 `affected`는 자식을 빌드하지 않는다. 훅이 막는 대상은 스테이징된 상위 작업 문서와 구조 선언뿐이다.
- `build` 요약 줄 끝에 ` · 저장소 N · 어긋남 M`이 붙는다. N은 상위를 포함한 저장소 수, M은 R1~R4 항목 수다.

## 한계

- 제품 축(여정·화면·API·DB 함수·구조 지도)은 합치지 않는다. 라우트·API 경로가 자식 설정과 캡처·판정 파일에 묶여 있어 접두를 붙이면 자식 규칙이 깨진다. 상위는 자식 요약 수와 상황판 링크만 싣는다.
- 저장소를 가로지르는 참조는 해석하지 않는다. 상위 작업 문서가 자식 저장소의 결정을 가리키는 식별자 모양이 아직 없다.
- 상위 여정이 접두가 붙은 참조(`app:DEC-3`, `app:20260101-x#DEC-3`)를 적어도 해석하지 않는다. 그런 참조는 경고 없이 빠진다.
- 자식 빌드 결과를 캐시하지 않는다. 자식 빌드가 느려 `serve` 재빌드가 길어지면 다음 판에서 자식 HEAD와 작업 트리 상태를 키로 하는 캐시를 더한다.
- 상위 상황판의 CI·배포는 이 판의 범위 밖이다. 상위 산출에는 자식 작업 제목·결정 요약이 실리므로, 배포할 때는 자식 중 가장 엄한 인증과 같은 인증을 둔다.
- 표식 파일 문법을 넓히지 않는다. 받는 줄은 빈 줄·`#` 주석, `root:`·`repos:` 절, 두 칸 `url`·`branch`, `  - path:` 항목과 네 칸 `url`·`branch`·`role`뿐이다. 문법을 바꾸려면 점검 스크립트와 엔진 읽개를 함께 바꾼다.
