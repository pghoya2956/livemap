# 구조 지도 작성 안내

구조 지도(2.1.0)는 "제품이 무엇으로 되어 있나"를 사람이 선언하고 엔진이 코드 사실과 대조하는 층이다. 사실은 [Graphify](https://pypi.org/project/graphifyy/)가 코드에서 뽑고(파일·심볼·import·호출), 뜻(부품·경계·층 규칙·기능 흐름)은 `map/architecture/` 의 md 파일에 사람이 적는다. 엔진은 두 층을 맞춰 `data.json` 의 `architecture` 절, `map/.out/architecture.md`(에이전트용 한 장), `map/.out/architecture.json`(함수 수준), `check` 의 `architecture.*` 이슈를 낸다. 코드는 [issue-codes.md](issue-codes.md) 「2.1.0 새 코드」.

## 켜는 법

1. **Graphify 그래프를 만든다.** 프로젝트 루트에서 한 줄이다. `[sql]` 추가분이 필수다. 기본 `graphifyy`는 SQL 파일을 통째로 건너뛰어 DB 함수·테이블 노드가 0이 된다.

   ```sh
   uvx --from "graphifyy[sql]" graphify update .
   ```

   결과는 `graphify-out/graph.json` 이다. 문서·배포 스크립트까지 읽히지 않게 저장소 루트에 `.graphifyignore` 허용 목록을 둔다(코드 폴더만 남긴다). 예:

   ```
   /*
   !/web/
   /web/*
   !/web/src/
   !/app/
   !/supabase/
   /supabase/*
   !/supabase/migrations/
   ```

2. **설정.** `map/config.json` 에 `architecture` 절을 두고, `adapters` 배열이 있는 프로젝트는 `migrations` 뒤(또는 끝)에 `"graphify"` 를 더한다. 배열이 없으면 기본 목록에 이미 들어 있다.

   ```json
   "architecture": {
     "dir": "map/architecture",
     "graph": "graphify-out/graph.json",
     "skillFile": ".claude/skills/<슬러그>-architecture/SKILL.md"
   }
   ```

   | 키 | 뜻 | 기본 |
   |---|---|---|
   | `dir` | 선언 폴더. 없거나 비면 architecture 단계가 `partial` 이고 대조하지 않는다(끄는 수단) | 없음 |
   | `graph` | Graphify 그래프 파일. 없으면 `architecture.graph-missing` 경고, 빌드 종료 코드 0 | `graphify-out/graph.json` |
   | `skillFile` | 산출물 사본을 쓸 경로. 없으면 사본을 쓰지 않는다. 스킬 이름은 폴더 이름이다 | 없음 |
   | `zones` | 묶음(community) 구역 규칙 `[[정규식, 구역]]`. 묶음 이름에 맞춘다. 규칙이 없으면 파일이 가장 많은 부품 | `[]` |
   | `deferred` | 동적 import 의 층 위반 취급. `count`(세되 문구에 `[동적 import]`) 또는 `ignore` | `count` |
   | `outLimit` | `architecture.md` 상한(바이트). 넘으면 `architecture.out-too-long` | `8000` |
   | `sequenceDiagrams` | 산출물에 넣는 기능별 sequenceDiagram 수. `"fit"`(상한 안에서 채움) 또는 정수 | `"fit"` |

3. **선언 파일을 쓴다.** `livemap init` 이 `map/architecture/README.md` 와 `web.md` 틀을 만든다(없는 파일만).

## 선언 파일

```
map/architecture/
  README.md   시스템 그림(Mermaid flowchart 부분집합)과 부품 표
  web.md      부품 하나. 머리 속성, `## 층:` 절, `## 흐름:` 절
  bff.md
  db.md
  login.md    바깥 상대(스키마 키만)
```

### README.md: 그림과 부품 표

그림은 사람이 Mermaid 로 쓰고 엔진은 정해진 부분집합만 읽는다. 사람이 쓴 그림이 그대로 화면 배치가 되고, 전체 Mermaid 파서를 넣으면 런타임 의존성 0 이 깨지기 때문이다.

| 읽는 것 | 뜻 | 못 읽으면 |
|---|---|---|
| `flowchart LR`·`TD` 한 줄 | 그림 시작 | `architecture.diagram-unreadable` |
| `subgraph <id>["<이름>"]` … `end` | 경계(중첩 가능) | 경계 없이 부품만 읽는다 |
| `<id>["<이름>"]` | 부품 | 부품 표에만 있으면 경계 밖에 선다 |
| `<a> --> <b>`(양끝에 `["이름"]` 선언 가능) | 부품 사이 연결 | 선 없이 상자만 그린다 |
| 그 밖의 Mermaid 문법(라벨 화살표·점선·`classDef`·`style` 등) | 무시 | 경고 없음 |

부품 표는 `| 부품 | 파일 | 이름 | 종류 |` 네 칸이다. `파일`은 부품 파일 링크(`[web.md](web.md)`) 또는 `—`, `종류`는 `우리 코드` 또는 `바깥 상대`. 그림에 있는데 표에 없는 부품은 `architecture.container-undeclared`, 표의 id 가 겹치면 `architecture.duplicate-id` 다.

### 부품 파일: 머리 속성

```markdown
# 웹 화면

사용자가 브라우저에서 보는 화면 전부. 자료는 BFF 에서만 받는다.

- id: web
- 폴더: web/src
```

- `id` 는 부품 표의 id 와 같아야 한다.
- `폴더` 는 저장소 기준 경로이고 쉼표로 여럿을 적을 수 있다. 파일 하나(`app/server.mjs`)도 된다. 파일은 이 폴더로 부품에 배정되고, 폴더가 겹치면 **가장 깊은 선언이 이긴다**(같은 깊이는 `architecture.duplicate-id` 오류). 저장소에 없는 폴더는 `architecture.container-unanchored`. 어느 부품 폴더에도 들지 않는 파일은 `architecture.module-unassigned` 다.
- 바깥 상대는 폴더 대신 `- 스키마: auth` 처럼 SQL 스키마를 적는다(스키마 단위). 정의 자리가 없는 남의 스키마 객체(`auth.users`)가 그 부품에 묶이고, 선언 없는 스키마는 `architecture.external-undeclared` 다. 로그인 제공자 호출(`auth:` 접두)은 선언을 요구하지 않는다.

### `## 층:` 절과 허용 목록

```markdown
## 층: 자료 받기

BFF 호출과 형 변환. 화면 조각을 가져오지 않는다.

- id: lib
- 폴더: web/src/lib
- 가져올 수 있는 층: —
```

규칙은 Mermaid 로 쓸 수 없다. 그래서 층마다 사람이 읽는 문장 하나와 엔진이 재는 한 줄 `- 가져올 수 있는 층:` 을 나란히 둔다. 허용 목록 문법이다: 적은 층만 가져올 수 있고 `—` 는 어느 층도 가져올 수 없다는 뜻, 줄이 없으면 규칙이 없다(판정하지 않는다). 금지 목록은 새 층을 조용히 허용하고 층 번호는 나란한 층을 적을 수 없어 쓰지 않는다.

- 판정은 같은 부품 안에서 층이 둘 다 정해진 파일 사이의 `import` 만 본다. 부품 폴더 안이지만 층 폴더 밖인 파일(진입 파일 등)은 층 없음이고 경고가 아니다.
- 타입만 가져오는 import(`import type`)는 런타임 의존이 아니라 위반에서 뺀다. 동적 import 는 위반으로 세되 문구에 `[동적 import]` 를 붙인다(설정 `deferred: "ignore"` 면 뺀다).
- 위반은 `architecture.layer-violation`(파일 좌표), 파일이 0건인 층은 `architecture.lane-empty`. 층 id 는 부품 사이에서 겹칠 수 없고 종류 층 이름 `screen`·`api`·`function`·`table`·`auth` 도 쓸 수 없다.

### `## 흐름:` 절과 좌표

```markdown
## 흐름: 예약금 결제 확정

사용자가 결제하면 예약이 확정되고 정산 대기로 넘어간다.

- id: deposit-confirm
- 단계: booking/pay
- 지나는 곳: 화면 /pay/:id → 함수 web/src/pages/Pay.tsx:Pay → API POST /api/bookings/:id/pay → DB 함수 confirm_booking → 테이블 bookings
```

- `단계` 는 여정 정본의 `<여정 id>/<장면 id>` 다. 그 장면의 화면·API 에서 파일·DB 함수·테이블·로그인을 펼쳐 기능의 노드 집합과 수를 만든다.
- `지나는 곳` 은 종류 낱말 여섯(`화면`·`파일`·`함수`·`API`·`DB 함수`·`테이블`) 뒤에 좌표를 적고 `→`(또는 `->`)로 잇는다. 함수 좌표는 `함수 <파일>:<이름>` 이고 `()` 는 붙이지 않아도 된다. API 는 `METHOD 경로` 또는 경로만.
- 단계나 좌표에 맞는 노드가 없으면 `architecture.flow-step-missing` 오류. 이어진 두 좌표 사이에 엣지가 없거나 추정(`INFERRED`, 변수를 넘기는 호출) 엣지뿐이면 `architecture.flow-broken` 경고이고 판정 파일로 채울 수 있다. 같은 종류 좌표(함수 → 함수)는 직접 엣지만 보고, 종류가 다르면 파일·화면·API 자리 묶음 사이 엣지를 본다.

## 산출물

`livemap build` 가 쓴다.

| 파일 | 내용 |
|---|---|
| `map/.out/architecture.md` | 절 여덟: 머리 한 줄, 부품 표, 시스템 그림(flowchart), 규칙(지켜짐·어긋남·선언만), 기능 표, 기능별 sequenceDiagram(함수 층까지), 어긋남과 끊김, 어디를 고치나. 상한 8,000바이트 |
| `map/.out/architecture.json` | 함수 수준: `symbols[]` 와 심볼 사이 `calls`·`reads` 엣지. 화면이 수준 토글을 함수로 바꿀 때 받아온다 |
| `skillFile` 사본 | 같은 본문 앞에 frontmatter 두 줄(`name` 은 폴더 이름, `description` 한 줄). 커밋되므로 낡을 수 있고 `architecture.skill-stale` 이 본다 |

sequenceDiagram 을 넣는 기능은 현재 마일스톤(진행, 없으면 다음) 소속을 첫째, 지나는 노드 수를 둘째로 고른다. 동작 상태는 쓰지 않는다. 상태로 고르면 새로 만드는 기능이 산출물에서 빠져 에이전트가 가장 필요할 때 못 읽는다. `livemap export` 는 두 파일을 `/map/data/` 아래에 함께 담고, `check --staged` 는 `map/architecture/` 아래 파일·`skillFile`·`map/config.json` 이 스테이징됐을 때만 `architecture.*` 를 오류로 센다(코드 파일만 바꾼 커밋은 막지 않고 훅 안에서 Graphify 를 돌리지 않는다).

## data.json 의 architecture 절(자료 계약)

화면과 산출물이 읽는 절이다. 1.0.1·2.0.2 필드는 바꾸지 않고 추가만 한다. `graphify` 어댑터가 돌지 않은 프로젝트에는 절이 없고 `summary` 의 다섯(`containers`·`modules`·`communities`·`flows`·`boundaryViolations`)은 0이다.

| 키 | 담는 것 |
|---|---|
| `status`·`error`·`graphMissing`·`deferred` | 단계 상태(`ok`·`partial`), 까닭, 그래프 없음, 동적 import 취급 |
| `declaration` | 선언 폴더·그림의 방향과 경계·읽기 문제 수 |
| `containers[]` | 부품: `id`·`name`·`kind`(`ours`·`external`)·`boundary`·`dirs`·`schemas`·`counts`(screens·files·symbols·mocks)·`deps`·`flows`·`externals`·`src` |
| `lanes[]` | 층: `id`·`name`·`container`·`kind`(`code`, 종류 층 `screen`·`api`·`function`·`table`·`auth`)·`visible`·`allow`(선언 층의 허용 목록)·`nodes`(그 층의 노드 수)·**`members`**. **`members` 는 그 층에 선 노드 목록**이고 항목은 `{ id, kind, label, community, part }` 만이다(`part` 는 부품 id. 파일 경로 같은 큰 값은 없다). 화면이 층 배치의 상자를 이것으로 그린다. `nodes` 는 수 그대로다(타입을 바꾸면 읽는 쪽이 조용히 깨진다) |
| `laneLinks[]` | 층 사이 선 `{ from, to, n }`(imports·calls·invokes·touches) |
| `communities[]`·`communityLinks[]` | 묶음(`id`·`name`·`zone`·`nodes`(파일 수)·`lanes`·`visible`·`inherited`)과 묶음 사이 선 `{ from, to, n, kinds }` |
| `modules[]` | 파일: `id`(경로)·`container`·`lane`·`symbols`·`community`·`communityName`·`deps`·`violations`. **`violations` 는 최상위 `violations` 와 같은 모양의 객체 `{ code, to, at: { file, line } }`** 배열이다(그 파일이 출발점인 위반만. 화면이 층 배치의 점선과 노드 초점 영향 패널을 이것으로 그린다) |
| `bridges` | 다리 통계(`made`·`moved`·`byKind`·`matched`·`unmatched`) |
| `flows[]` | 기능: `id`·`name`·`container`·`step`·`status`·`nodes`(길 위 노드 `kind:id`)·**`edges`**·`counts`·`broken`·`path`·`story`. **`edges` 는 길 위 노드 사이의 실측 엣지 `{ from, to, kind }`** 이고 `from`·`to` 는 `nodes` 와 같은 `kind:id` 공간, `kind` 는 그래프 엣지 종류 그대로(calls·invokes·touches·renders·defined_in·imports·reads 등)다. 선언 좌표 사슬 `path` 와 겹쳐도 된다. 화면이 기능 길의 선을 이것으로 그린다 |
| `violations[]` | 층 위반 `{ code, from, to, fromLane, toLane, at: { file, line }, deferred? }`. `at.line` 은 Graphify 링크의 `source_location`(`"L24"`)에서 온 import 줄이고, 한 파일 짝에 링크가 여럿이면 가장 앞선 줄이다. 못 구하면 `null` 이고 그때 화면은 줄 없이 파일만 보인다 |
| `graphify` | Graphify 통계(노드·엣지·relation·묶음·추정·typeOnly·deferred·unknownRelations·생성 시각) |

함수 수준(심볼과 심볼 사이 엣지)은 이 절에 없고 `map/.out/architecture.json` 에 있다.

## 자주 겪는 일

- **위반이 나오는데 구조가 맞다**: 허용 목록이 실제 import 보다 좁은 것이다. 배럴(`index.ts`)이 다른 층을 재수출하면 그 층을 허용 목록에 더한다.
- **미배정 파일이 한 폴더에 몰린다**(예: `tests/`): 그 폴더를 부품으로 선언하거나, 그대로 두고 화면에서 접는다. 선언하면 묶음 구역도 채워진다.
- **묶음 구역이 null**: 그 묶음의 파일이 어느 부품에도 없다. `zones` 규칙은 묶음 이름(파일 이름 또는 심볼 이름)에만 맞으므로 부품 선언이 더 넓게 덮는다.
- **`bridge-unmatched`**: livemap 이 migration 에서 읽은 테이블인데 Graphify 가 정의 자리를 내지 않았다. 선언으로는 못 고치고 Graphify 쪽 문제다. `check` 에서는 경고(`--strict` 는 오류)이고, 선언을 스테이징한 커밋의 `check --staged` 는 세지 않는다(2.1.1). `table-unreached`·`graph-missing` 도 같다.
