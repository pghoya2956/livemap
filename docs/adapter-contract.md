# 어댑터 계약

어댑터는 저장소의 한 종류 사실을 읽어 그래프에 노드·엣지로 넣는 함수다. 화면은 어댑터를 모르고 파생 뷰만 읽으므로, 스택이 달라지면 어댑터만 바꾸면 된다.

## 개요 조각 g.badge(label, text)

어댑터가 개요 요약 줄에 한 조각을 얹는다. 엔진은 프로젝트의 빚·대장 어휘를 모르므로 값이 아니라 글자를 받는다.

```js
g.badge('빚과 어긋남', `미선언 ${undeclared} · 직접 goto ${baseline}`);
```

- 줄바꿈·연속 공백은 한 칸으로 접고 60자에서 자른다. 빈 글자를 주면 그 어댑터만 `failed`가 된다.
- 요약 줄의 기존 항목(장면·화면·커밋·미배포·경고) 뒤에 어댑터 실행 순서대로 붙는다. `data.json`·`overview.json`의 `badges[]`에도 `{ label, text, adapter }`로 실린다.
- 모르는 값은 0으로 적지 않는다. "측정 안 됨"이나 `?`로 적어 빈 값과 0을 가른다.

## 시그니처

```js
// map/adapters/<name>.mjs   ← 프로젝트 소유 어댑터. 엔진 업그레이드가 건드리지 않는다
export default function name(g, fs, cfg) {
  // ... 노드·엣지 추가
  return null;                 // 정상
  // return '설명';            // partial: 일부만 읽음(예: 파일 없음). 생성은 계속되고 더보기 > 이 상황판의 어댑터 상태에 남는다
  // throw new Error('…');     // failed: 개요 특보 "자료 일부 누락" + check 오류. 그래도 다른 어댑터는 돈다
}
```

- `g` — 그래프. `g.add(kind, id, label, props, src)`, `g.link(fromKind, fromId, edgeKind, toKind, toId)`, `g.get`, `g.of(kind)`, `g.in`, `g.out`, `g.issue(level, label, message, detail?)`(1.1.0부터, 넷째 인자는 1.2.0부터).
- `fs` — 저장소 접근. `read(rel)`, `has(rel)`, `isDir(rel)`, `walk(dir, pred)`, `ls(dir)`, `git(...args)`(실패 시 빈 문자열), `hasGit()`, `resolveRef(name)`(main → origin/main → HEAD), `lastCommit(rel)`, `lineOf(text, needle)`.
- `cfg` — `map/config.json` 전체. 자기 키(`cfg.<name>`)만 읽고, 다른 어댑터의 키는 `?.`로 방어한다.

## 오류·경고 보고(g.issue)

어댑터가 읽은 사실에서 프로젝트 규칙 위반을 찾았으면 `g.issue(level, label, message, detail?)`로 낸다. 반환값 partial·throw는 "어댑터가 제대로 읽었나"를, `g.issue`는 "읽은 내용에 문제가 있나"를 알린다. 세 인자 호출은 1.1.0부터, 넷째 인자는 1.2.0부터 쓸 수 있다.

```js
g.issue('warn', '로드맵', '결정 대기 30일 넘음: 결제 흐름');
g.issue('error', '여정 파일', '필수 키 없음: owner');
g.issue('warn', '작업 문서', '완료 작업에 닫히지 않은 잔여 질문 1', {
  code: 'tasks.questions-open-done',
  subject: { kind: 'task', id: '20260101-sample' },
  anchors: [{ file: 'tasks/20260101-sample/spec/final.md', line: 12, excerpt: '| OQ-02 | 남은 질문 |' }],
  resolutions: ['judge'],
});
```

- `level`은 `'error'` 또는 `'warn'`이다. 그 밖의 값이거나 `label`·`message`가 문자열이 아니면 `throw`하고, 그 어댑터는 failed가 된다. 다른 어댑터는 계속 돈다.
- 엔진이 지금 실행 중인 어댑터 이름을 함께 기록한다(`config.adapters`의 이름). 어댑터가 throw하기 전에 낸 문제도 남는다.
- `graph.json`·`data.json`의 최상위 `issues[]`에 `{level, label, message, adapter}`로 남는다.
- `livemap check`는 기존 검사 뒤에 error를 `✗ {label}: {message}`로, warn을 `△ {label}: {message}`로 출력한다. error는 종료 코드 1에 센다.
- 개요에는 나오지 않고 더보기 > 이 상황판(`#/more/about`)에 목록으로 나온다.

넷째 인자(1.2.0):

- 키는 `code`·`subject`·`anchors`·`resolutions`·`judgmentDraft`만 받는다. 모르는 키가 있거나 형식이 틀리면 `throw`하고 그 어댑터는 failed가 된다.
- `code`는 `<영역>.<이름>`(소문자·숫자·하이픈)이다. 엔진 코드 표(`issue-codes.md`)에 있는 코드는 표의 수준과 `level`이 같아야 한다. 프로젝트 코드는 표 밖 이름을 쓴다.
- `subject`는 `{ kind, id }` 또는 생략(`null`). `anchors`는 `{ file, line?, excerpt? }` 배열이고 `line`은 1 이상 정수이거나 생략(`null`, 파일 단위 근거)이다. `excerpt`는 엔진이 120 코드 포인트에서 자른다(`data.json`은 서빙되므로 긴 원문을 싣지 않는다).
- `resolutions`는 `source`·`judge`·`config`·`code`·`engine` 중에서 고른다. 생략하면 표의 처리 값, 표 밖 코드는 `[]`다.
- `judgmentDraft`는 판정 파일 초안 객체다. `check --json`과 `check --staged` 출력에 그대로 실린다.
- 넷째 인자를 준 문제만 `issues[]` 항목에 `code`·`subject`·`anchors`·`resolutions`(있으면 `judgmentDraft`)가 더해진다. 세 인자 호출의 항목 모양은 1.1.0 그대로이고, check에서는 코드 `adapter.issue`로 나온다.

## 읽기 상태(props.reading)

1.2.0부터 노드 값마다 어떻게 읽었는지를 적는다. 화면은 이 상태로 값 뒤에 "?"와 이유를 붙인다.

- `props.reading`은 `{ 필드: 상태 }`, `props.readingNotes`는 `{ 필드: 이유 문장 }`이다. 이유 문장에는 파일·줄이 들어갈 수 있어 개요(`overview.json`)에는 싣지 않는다.
- 상태 값은 일곱이다: `observed`(구조화된 출력이나 livemap 소유 형식), `rule`(규칙으로 읽었고 같은 범위의 후보 줄이 모두 읽힘), `judged`(판정 파일이 값을 채움), `partial`(안 읽힌 후보 줄이나 뜻 확인이 필요한 행이 있음), `stale`(판정 근거나 검사 결과가 낡음), `unknown`(소스가 없거나 형식 밖), `none`(대상 없음).
- 적지 않은 필드는 `rule`로 본다. 합계는 구성 요소 중 하나라도 `partial`·`stale`·`unknown`이면 `partial`이다.
- 프로젝트 어댑터는 `props.reading`에 직접 적어도 된다. 참조 어댑터는 `src/lib/reading.mjs`의 `setReading(node, field, value, note?)`를 쓴다.
- 참조 어댑터가 상태를 적는 필드: 작업 `plan`·`openQuestions`·`stage`(tasks), 검사 `count`(tests·testreport)·`lastRun`(testreport), 화면 `apis`(연결 단계), 배포 `behind`(deploy). 뜻은 `semantic-schema.md`.

## 화면 리터럴과 연결 단계(apiLiterals)

1.2.0 router 어댑터는 화면에서 API로 가는 호출을 대응표(`router.hookApi`) 대신 코드의 문자열 리터럴로 관측한다.

1. router는 페이지 파일에서 로컬 import를 따라가며(작은따옴표·큰따옴표, `import type` 제외, `export … from` 재수출 포함) 리터럴을 모은다. `router.localDirs` 안 파일은 파일 전체, `router.app` 폴더 안이지만 `localDirs` 밖인 모듈은 가져온 이름의 최상위 선언만(그 선언이 같은 모듈의 다른 최상위 선언을 쓰면 깊이 2까지) 넣는다. 이 확장 닫힘은 리터럴 추출에만 쓰고, 화면 `files`·`source`·`mockVia`·`fixedVia`와 git 변경 연결은 1.1.1 파일 닫힘 그대로다.
2. 따옴표·백틱 바로 뒤가 `/api/`인 문자열을 뽑아 `?`·`#` 뒤와 끝 `/`를 떼고, 조각 전체가 `${…}`면 `:param`, 조각 중간의 `${…}`는 앞 글자까지 남기고 열린 끝으로 둔다.
3. router는 화면 노드 `apiLiterals[]`에 `{ path, open?, file, line, matched }`를 적기만 한다. 어댑터 순서상 router가 bff보다 먼저 돌아 대응할 API 노드가 아직 없기 때문이다.
4. 모든 어댑터가 끝난 뒤 엔진 연결 단계(`src/link.mjs`)가 리터럴을 API 노드에 대응해 `calls` 엣지와 `matched`(맞은 API 노드 id 배열)를 채운다. 경로 조각 수가 같고 조각마다 같거나 한쪽이 `:이름`이면 맞고, 같은 경로의 메서드 노드는 모두 잇는다. 맞는 노드가 없으면 `router.unknown-api`다. 연결 단계는 `adapters[]`에 들지 않고, 실패하면 오류 이슈(`연결 단계: …`)로 남는다.
5. 설정에 `router.hookApi`가 있으면 router가 1.1.1처럼 노드와 엣지도 만들고(합집합), 화면 노드 `hookApiKeys`에 쓴 키를 적는다. 연결 단계가 키마다 `router.hookapi-redundant`(리터럴로도 나옴, 지워도 됨) 또는 `router.hookapi-only`(hookApi로만 나옴)를 한 건 낸다. `router.hookApi`는 2.0.0에서 지울 예정이다.

프로젝트 어댑터가 다른 방식으로 화면 호출을 찾으면 `calls` 엣지를 직접 이어도 된다. `apiLiterals`를 적으면 연결 단계가 같은 규칙으로 대응한다.

## 어디에 두나

엔진은 `config.adapters`의 이름마다 프로젝트 `map/adapters/<name>.mjs`를 먼저 찾고, 없으면 패키지에 딸린 참조 어댑터(`src/adapters/<name>.mjs`)를 쓴다. 프로젝트 파일이 참조 어댑터와 이름이 같으면 `build`·`check`가 "프로젝트 어댑터가 참조 어댑터를 가림: <name>" 한 줄을 알린다. 참조 어댑터의 결함은 엔진 저장소에서 고치고, 프로젝트만의 스택은 다른 이름의 프로젝트 어댑터로 둔다.

같은 `(kind, id)`를 두 번 `add`하면 props가 병합되고 첫 `src`가 남는다. 그래서 router가 만든 `api` 노드에 bff가 method·calls를 덧붙일 수 있다.

## 출처(src)를 반드시 남긴다

`src: { file, line, rule }`. 상세 화면이 "이 값은 어느 파일 몇 번째 줄을 어떤 규칙으로 읽었나"를 보여주는 근거다. 출처 없는 값은 사용자가 믿을 수 없고, 어댑터가 잘못 읽었을 때 어디를 고칠지 알 수 없다. `rule`은 `'router:<Route path>'`처럼 짧게.

## 노드 종류와 엣지

| kind | id | 만드는 어댑터 |
|---|---|---|
| screen | 라우트 경로 | router |
| api | 경로(`/api/x`, `:id` 허용) | router(호출 측), bff(선언 측) |
| function | DB 함수 짧은 이름 | bff, migrations |
| table | `schema.table` | migrations |
| migration | 파일명 | migrations |
| test | 파일 경로 | tests |
| commit | 짧은 sha | git |
| decision | 위키 slug 또는 `DEC-nn`·`PN-nn` | wiki, tasks |
| task | 폴더명 | tasks |
| ledger | `running-i`·`waiting-i` | tasks |
| deploy | `head`·`homelab` | git, deploy |
| testreport | `last` | testreport |
| milestone | 로드맵 항목 id(1.x 이름) | roadmap |
| release | 마일스톤 id(1.x 임시 이름, 1.1.0부터) | roadmap |
| module | 저장소 기준 파일 경로. 외부 패키지·문서 참조는 Graphify 라벨이고 `props.external`이 참(2.1.0) | graphify |
| symbol | `<파일>:<이름>`. 같은 파일에 같은 이름이 둘이면 `@<위치>`를 붙인다. 정의 자리 없는 SQL 라벨은 라벨 그대로이고 `props.external`·`props.sql`이 참(2.1.0) | graphify |
| container | 선언한 부품 id(2.1.0) | architecture 단계(선언 파일 `map/architecture/`) |
| flow | 선언한 흐름 id(2.1.0) | architecture 단계 |

로드맵 항목과 마일스톤의 노드 종류 이름은 1.x 동안 `milestone`·`release`이고, 2.0.0에서 `roadmapItem`·`milestone`으로 바꾼다(어댑터 계약 변경이라 major).

로드맵 화면의 트리(1.3.0)는 이 두 종류의 속성만으로 열을 정한다. 로드맵을 직접 만드는 어댑터는 아래를 지킨다.

| 화면이 읽는 것 | 노드·속성 | 규칙 |
|---|---|---|
| 열 모드 | `release` 노드 수 | 한 건이라도 있으면 열 하나가 마일스톤 하나, 없으면 열 하나가 선행 깊이 한 단계(`semantic-authoring.md` 「로드맵 화면의 열」 문안 1) |
| 열 순서 | `release`의 `props.order` | 마일스톤 절이 나온 차례. 화면은 선행에 맞춰 다시 정렬하지 않는다(문안 2) |
| 항목의 열 | `milestone`의 `props.milestone` | 마일스톤 id. 비었거나 `release`에 없는 id면 맨 오른쪽 "마일스톤 없음" 열(문안 3) |
| 선 | `milestone`의 `props.deps` | 로드맵 항목 id 목록. 없는 id는 선을 그리지 않고 엔진이 `선행 항목 없음` 문장을 낸다 |

역행·순환 문장은 어댑터가 아니라 엔진(`src/derive.mjs`)이 `roadmap[].problems`에 싣고 `check`가 경고로 낸다. 역행 문장 틀은 `마일스톤 순서 역행: {선행 id}({마일스톤}) → {항목 id}({마일스톤})`, 순환은 `선행 순환: {id} → {id} → …`다(코드는 `issue-codes.md` 「1.3.0 새 코드」).

엣지: `shows`(step→screen, 파생이 만든다), `calls`(screen→api, 2.1.0부터 symbol→symbol·module→symbol 도), `invokes`(api→function, 2.1.0부터 api→로그인 노드도), `touches`(function→table), `covers`(test→screen|api|function), `changes`(commit→screen|api|migration), `defines`(task→decision), `contains`(migration→table|function, release→milestone, 2.1.0부터 module→symbol·symbol→symbol·container→module·flow→좌표 노드도), `tracks`(milestone→task). 새 종류가 필요하면 엔진 저장소의 `src/lib/graph.mjs` 목록에 더한다(minor 릴리스). 화면이 그 종류를 그리려면 `src/derive.mjs`와 화면 원본 `ui/`도 손봐야 하므로, 먼저 기존 종류로 표현할 수 없는지 본다.

2.1.0(minor)이 더한 노드 종류는 위 표의 `module`·`symbol`·`container`·`flow` 넷, 엣지는 `imports`(module→module), `renders`(screen→module, 다리), `defined_in`(api→module, 다리), `depends`(container→container), `reads`(module→module, symbol→symbol, function→table|symbol), `inherits`(symbol→symbol) 여섯이다(스펙 DEC-24. `contains`는 2.0.2에 이미 있어 그대로 쓴다). 2.0.2 엣지 모양 `{ from, to, kind }`는 그대로고 Graphify·다리가 만든 엣지만 `props`를 더 가진다: `confidence`(`EXTRACTED`|`INFERRED`), 참일 때만 실리는 `typeOnly`·`deferred`, 원 relation 이 종류 이름과 다를 때의 `via`(`method`·`indexes`·`cites`), 다리가 만든 엣지의 `bridge: true`. `g.link`의 여섯째 인자로 넣고, 같은 (from, kind, to)가 이미 있으면 돌려받은 엣지의 props 를 부르는 쪽이 합친다.

## SQL 라벨 합치기와 다리(2.1.0)

Graphify 는 SQL 객체마다 노드 하나를 주지 않고 (migration 파일, 객체) 쌍마다 노드를 준다. 표본에서 한 테이블이 노드 12개, 커뮤니티 12개로 흩어졌다. graphify 어댑터는 스키마 접두 라벨(`<스키마>.<함수>()`·`<스키마>.<테이블>`)마다 논리 노드 하나로 합치고 Graphify 노드 id 집합을 증거로 남긴다(스펙 DEC-43).

| 라벨 | 논리 노드 | props |
|---|---|---|
| `s.f()`, 정의 자리(source_file 있는 노드) 있음 | livemap `function:f`(migrations·bff 가 만든 노드 자신. 없으면 만들고 `qualified`를 둔다) | `graphifyIds`(정렬), `schema`, `community`, `communityName` |
| `s.t`, 정의 자리 있음 | livemap `table:s.t`(없으면 만든다) | 같음 |
| 정의 자리 없음(남의 스키마·참조만·스키마 낱말 조각) | `symbol:<라벨>` 바깥 상대 | `external`·`sql` 참, `schema`(접두 없으면 null), `graphifyIds`, `community` null |
| 스키마 접두 없는 SQL 심볼(인덱스 이름) | 보통 심볼 `symbol:<파일>:<이름>` | — |

묶음(`community`)은 정의 자리 중 `source_file`이 사전순으로 가장 앞선 노드의 커뮤니티다. migration 파일명이 시각 접두를 가지므로 사전순이 생성 순서이고 그 자리가 객체를 만든 자리다. 같은 파일 안에 둘이면 Graphify id 순이다. 입력 노드 순서를 뒤집어도 같은 배정이 나온다(SC-24).

논리 노드가 livemap 노드 자신이므로 기존 `invokes`(api→function)·`touches`(function→table) 엣지는 끝점을 옮기지 않아도 합친 노드를 가리킨다. 다리 단계(`src/bridge.mjs`)는 이 엣지를 다시 만들지 않고 끝점 노드에 `graphifyIds`가 있는지로 매칭을 센다. 그래서 `summary.dbFunctions`·`dbTables`와 `functions[]`는 2.0.2 값 그대로다. 함수 이름 규칙은 `(^|\.)이름\(\)# 어댑터 계약

어댑터는 저장소의 한 종류 사실을 읽어 그래프에 노드·엣지로 넣는 함수다. 화면은 어댑터를 모르고 파생 뷰만 읽으므로, 스택이 달라지면 어댑터만 바꾸면 된다.

## 개요 조각 g.badge(label, text)

어댑터가 개요 요약 줄에 한 조각을 얹는다. 엔진은 프로젝트의 빚·대장 어휘를 모르므로 값이 아니라 글자를 받는다.

```js
g.badge('빚과 어긋남', `미선언 ${undeclared} · 직접 goto ${baseline}`);
```

- 줄바꿈·연속 공백은 한 칸으로 접고 60자에서 자른다. 빈 글자를 주면 그 어댑터만 `failed`가 된다.
- 요약 줄의 기존 항목(장면·화면·커밋·미배포·경고) 뒤에 어댑터 실행 순서대로 붙는다. `data.json`·`overview.json`의 `badges[]`에도 `{ label, text, adapter }`로 실린다.
- 모르는 값은 0으로 적지 않는다. "측정 안 됨"이나 `?`로 적어 빈 값과 0을 가른다.

## 시그니처

```js
// map/adapters/<name>.mjs   ← 프로젝트 소유 어댑터. 엔진 업그레이드가 건드리지 않는다
export default function name(g, fs, cfg) {
  // ... 노드·엣지 추가
  return null;                 // 정상
  // return '설명';            // partial: 일부만 읽음(예: 파일 없음). 생성은 계속되고 더보기 > 이 상황판의 어댑터 상태에 남는다
  // throw new Error('…');     // failed: 개요 특보 "자료 일부 누락" + check 오류. 그래도 다른 어댑터는 돈다
}
```

- `g` — 그래프. `g.add(kind, id, label, props, src)`, `g.link(fromKind, fromId, edgeKind, toKind, toId)`, `g.get`, `g.of(kind)`, `g.in`, `g.out`, `g.issue(level, label, message, detail?)`(1.1.0부터, 넷째 인자는 1.2.0부터).
- `fs` — 저장소 접근. `read(rel)`, `has(rel)`, `isDir(rel)`, `walk(dir, pred)`, `ls(dir)`, `git(...args)`(실패 시 빈 문자열), `hasGit()`, `resolveRef(name)`(main → origin/main → HEAD), `lastCommit(rel)`, `lineOf(text, needle)`.
- `cfg` — `map/config.json` 전체. 자기 키(`cfg.<name>`)만 읽고, 다른 어댑터의 키는 `?.`로 방어한다.

## 오류·경고 보고(g.issue)

어댑터가 읽은 사실에서 프로젝트 규칙 위반을 찾았으면 `g.issue(level, label, message, detail?)`로 낸다. 반환값 partial·throw는 "어댑터가 제대로 읽었나"를, `g.issue`는 "읽은 내용에 문제가 있나"를 알린다. 세 인자 호출은 1.1.0부터, 넷째 인자는 1.2.0부터 쓸 수 있다.

```js
g.issue('warn', '로드맵', '결정 대기 30일 넘음: 결제 흐름');
g.issue('error', '여정 파일', '필수 키 없음: owner');
g.issue('warn', '작업 문서', '완료 작업에 닫히지 않은 잔여 질문 1', {
  code: 'tasks.questions-open-done',
  subject: { kind: 'task', id: '20260101-sample' },
  anchors: [{ file: 'tasks/20260101-sample/spec/final.md', line: 12, excerpt: '| OQ-02 | 남은 질문 |' }],
  resolutions: ['judge'],
});
```

- `level`은 `'error'` 또는 `'warn'`이다. 그 밖의 값이거나 `label`·`message`가 문자열이 아니면 `throw`하고, 그 어댑터는 failed가 된다. 다른 어댑터는 계속 돈다.
- 엔진이 지금 실행 중인 어댑터 이름을 함께 기록한다(`config.adapters`의 이름). 어댑터가 throw하기 전에 낸 문제도 남는다.
- `graph.json`·`data.json`의 최상위 `issues[]`에 `{level, label, message, adapter}`로 남는다.
- `livemap check`는 기존 검사 뒤에 error를 `✗ {label}: {message}`로, warn을 `△ {label}: {message}`로 출력한다. error는 종료 코드 1에 센다.
- 개요에는 나오지 않고 더보기 > 이 상황판(`#/more/about`)에 목록으로 나온다.

넷째 인자(1.2.0):

- 키는 `code`·`subject`·`anchors`·`resolutions`·`judgmentDraft`만 받는다. 모르는 키가 있거나 형식이 틀리면 `throw`하고 그 어댑터는 failed가 된다.
- `code`는 `<영역>.<이름>`(소문자·숫자·하이픈)이다. 엔진 코드 표(`issue-codes.md`)에 있는 코드는 표의 수준과 `level`이 같아야 한다. 프로젝트 코드는 표 밖 이름을 쓴다.
- `subject`는 `{ kind, id }` 또는 생략(`null`). `anchors`는 `{ file, line?, excerpt? }` 배열이고 `line`은 1 이상 정수이거나 생략(`null`, 파일 단위 근거)이다. `excerpt`는 엔진이 120 코드 포인트에서 자른다(`data.json`은 서빙되므로 긴 원문을 싣지 않는다).
- `resolutions`는 `source`·`judge`·`config`·`code`·`engine` 중에서 고른다. 생략하면 표의 처리 값, 표 밖 코드는 `[]`다.
- `judgmentDraft`는 판정 파일 초안 객체다. `check --json`과 `check --staged` 출력에 그대로 실린다.
- 넷째 인자를 준 문제만 `issues[]` 항목에 `code`·`subject`·`anchors`·`resolutions`(있으면 `judgmentDraft`)가 더해진다. 세 인자 호출의 항목 모양은 1.1.0 그대로이고, check에서는 코드 `adapter.issue`로 나온다.

## 읽기 상태(props.reading)

1.2.0부터 노드 값마다 어떻게 읽었는지를 적는다. 화면은 이 상태로 값 뒤에 "?"와 이유를 붙인다.

- `props.reading`은 `{ 필드: 상태 }`, `props.readingNotes`는 `{ 필드: 이유 문장 }`이다. 이유 문장에는 파일·줄이 들어갈 수 있어 개요(`overview.json`)에는 싣지 않는다.
- 상태 값은 일곱이다: `observed`(구조화된 출력이나 livemap 소유 형식), `rule`(규칙으로 읽었고 같은 범위의 후보 줄이 모두 읽힘), `judged`(판정 파일이 값을 채움), `partial`(안 읽힌 후보 줄이나 뜻 확인이 필요한 행이 있음), `stale`(판정 근거나 검사 결과가 낡음), `unknown`(소스가 없거나 형식 밖), `none`(대상 없음).
- 적지 않은 필드는 `rule`로 본다. 합계는 구성 요소 중 하나라도 `partial`·`stale`·`unknown`이면 `partial`이다.
- 프로젝트 어댑터는 `props.reading`에 직접 적어도 된다. 참조 어댑터는 `src/lib/reading.mjs`의 `setReading(node, field, value, note?)`를 쓴다.
- 참조 어댑터가 상태를 적는 필드: 작업 `plan`·`openQuestions`·`stage`(tasks), 검사 `count`(tests·testreport)·`lastRun`(testreport), 화면 `apis`(연결 단계), 배포 `behind`(deploy). 뜻은 `semantic-schema.md`.

## 화면 리터럴과 연결 단계(apiLiterals)

1.2.0 router 어댑터는 화면에서 API로 가는 호출을 대응표(`router.hookApi`) 대신 코드의 문자열 리터럴로 관측한다.

1. router는 페이지 파일에서 로컬 import를 따라가며(작은따옴표·큰따옴표, `import type` 제외, `export … from` 재수출 포함) 리터럴을 모은다. `router.localDirs` 안 파일은 파일 전체, `router.app` 폴더 안이지만 `localDirs` 밖인 모듈은 가져온 이름의 최상위 선언만(그 선언이 같은 모듈의 다른 최상위 선언을 쓰면 깊이 2까지) 넣는다. 이 확장 닫힘은 리터럴 추출에만 쓰고, 화면 `files`·`source`·`mockVia`·`fixedVia`와 git 변경 연결은 1.1.1 파일 닫힘 그대로다.
2. 따옴표·백틱 바로 뒤가 `/api/`인 문자열을 뽑아 `?`·`#` 뒤와 끝 `/`를 떼고, 조각 전체가 `${…}`면 `:param`, 조각 중간의 `${…}`는 앞 글자까지 남기고 열린 끝으로 둔다.
3. router는 화면 노드 `apiLiterals[]`에 `{ path, open?, file, line, matched }`를 적기만 한다. 어댑터 순서상 router가 bff보다 먼저 돌아 대응할 API 노드가 아직 없기 때문이다.
4. 모든 어댑터가 끝난 뒤 엔진 연결 단계(`src/link.mjs`)가 리터럴을 API 노드에 대응해 `calls` 엣지와 `matched`(맞은 API 노드 id 배열)를 채운다. 경로 조각 수가 같고 조각마다 같거나 한쪽이 `:이름`이면 맞고, 같은 경로의 메서드 노드는 모두 잇는다. 맞는 노드가 없으면 `router.unknown-api`다. 연결 단계는 `adapters[]`에 들지 않고, 실패하면 오류 이슈(`연결 단계: …`)로 남는다.
5. 설정에 `router.hookApi`가 있으면 router가 1.1.1처럼 노드와 엣지도 만들고(합집합), 화면 노드 `hookApiKeys`에 쓴 키를 적는다. 연결 단계가 키마다 `router.hookapi-redundant`(리터럴로도 나옴, 지워도 됨) 또는 `router.hookapi-only`(hookApi로만 나옴)를 한 건 낸다. `router.hookApi`는 2.0.0에서 지울 예정이다.

프로젝트 어댑터가 다른 방식으로 화면 호출을 찾으면 `calls` 엣지를 직접 이어도 된다. `apiLiterals`를 적으면 연결 단계가 같은 규칙으로 대응한다.

## 어디에 두나

엔진은 `config.adapters`의 이름마다 프로젝트 `map/adapters/<name>.mjs`를 먼저 찾고, 없으면 패키지에 딸린 참조 어댑터(`src/adapters/<name>.mjs`)를 쓴다. 프로젝트 파일이 참조 어댑터와 이름이 같으면 `build`·`check`가 "프로젝트 어댑터가 참조 어댑터를 가림: <name>" 한 줄을 알린다. 참조 어댑터의 결함은 엔진 저장소에서 고치고, 프로젝트만의 스택은 다른 이름의 프로젝트 어댑터로 둔다.

같은 `(kind, id)`를 두 번 `add`하면 props가 병합되고 첫 `src`가 남는다. 그래서 router가 만든 `api` 노드에 bff가 method·calls를 덧붙일 수 있다.

## 출처(src)를 반드시 남긴다

`src: { file, line, rule }`. 상세 화면이 "이 값은 어느 파일 몇 번째 줄을 어떤 규칙으로 읽었나"를 보여주는 근거다. 출처 없는 값은 사용자가 믿을 수 없고, 어댑터가 잘못 읽었을 때 어디를 고칠지 알 수 없다. `rule`은 `'router:<Route path>'`처럼 짧게.

## 노드 종류와 엣지

| kind | id | 만드는 어댑터 |
|---|---|---|
| screen | 라우트 경로 | router |
| api | 경로(`/api/x`, `:id` 허용) | router(호출 측), bff(선언 측) |
| function | DB 함수 짧은 이름 | bff, migrations |
| table | `schema.table` | migrations |
| migration | 파일명 | migrations |
| test | 파일 경로 | tests |
| commit | 짧은 sha | git |
| decision | 위키 slug 또는 `DEC-nn`·`PN-nn` | wiki, tasks |
| task | 폴더명 | tasks |
| ledger | `running-i`·`waiting-i` | tasks |
| deploy | `head`·`homelab` | git, deploy |
| testreport | `last` | testreport |
| milestone | 로드맵 항목 id(1.x 이름) | roadmap |
| release | 마일스톤 id(1.x 임시 이름, 1.1.0부터) | roadmap |
| module | 저장소 기준 파일 경로. 외부 패키지·문서 참조는 Graphify 라벨이고 `props.external`이 참(2.1.0) | graphify |
| symbol | `<파일>:<이름>`. 같은 파일에 같은 이름이 둘이면 `@<위치>`를 붙인다. 정의 자리 없는 SQL 라벨은 라벨 그대로이고 `props.external`·`props.sql`이 참(2.1.0) | graphify |
| container | 선언한 부품 id(2.1.0) | architecture 단계(선언 파일 `map/architecture/`) |
| flow | 선언한 흐름 id(2.1.0) | architecture 단계 |

로드맵 항목과 마일스톤의 노드 종류 이름은 1.x 동안 `milestone`·`release`이고, 2.0.0에서 `roadmapItem`·`milestone`으로 바꾼다(어댑터 계약 변경이라 major).

로드맵 화면의 트리(1.3.0)는 이 두 종류의 속성만으로 열을 정한다. 로드맵을 직접 만드는 어댑터는 아래를 지킨다.

| 화면이 읽는 것 | 노드·속성 | 규칙 |
|---|---|---|
| 열 모드 | `release` 노드 수 | 한 건이라도 있으면 열 하나가 마일스톤 하나, 없으면 열 하나가 선행 깊이 한 단계(`semantic-authoring.md` 「로드맵 화면의 열」 문안 1) |
| 열 순서 | `release`의 `props.order` | 마일스톤 절이 나온 차례. 화면은 선행에 맞춰 다시 정렬하지 않는다(문안 2) |
| 항목의 열 | `milestone`의 `props.milestone` | 마일스톤 id. 비었거나 `release`에 없는 id면 맨 오른쪽 "마일스톤 없음" 열(문안 3) |
| 선 | `milestone`의 `props.deps` | 로드맵 항목 id 목록. 없는 id는 선을 그리지 않고 엔진이 `선행 항목 없음` 문장을 낸다 |

역행·순환 문장은 어댑터가 아니라 엔진(`src/derive.mjs`)이 `roadmap[].problems`에 싣고 `check`가 경고로 낸다. 역행 문장 틀은 `마일스톤 순서 역행: {선행 id}({마일스톤}) → {항목 id}({마일스톤})`, 순환은 `선행 순환: {id} → {id} → …`다(코드는 `issue-codes.md` 「1.3.0 새 코드」).

엣지: `shows`(step→screen, 파생이 만든다), `calls`(screen→api, 2.1.0부터 symbol→symbol·module→symbol 도), `invokes`(api→function, 2.1.0부터 api→로그인 노드도), `touches`(function→table), `covers`(test→screen|api|function), `changes`(commit→screen|api|migration), `defines`(task→decision), `contains`(migration→table|function, release→milestone, 2.1.0부터 module→symbol·symbol→symbol·container→module·flow→좌표 노드도), `tracks`(milestone→task). 새 종류가 필요하면 엔진 저장소의 `src/lib/graph.mjs` 목록에 더한다(minor 릴리스). 화면이 그 종류를 그리려면 `src/derive.mjs`와 화면 원본 `ui/`도 손봐야 하므로, 먼저 기존 종류로 표현할 수 없는지 본다.

2.1.0(minor)이 더한 노드 종류는 위 표의 `module`·`symbol`·`container`·`flow` 넷, 엣지는 `imports`(module→module), `renders`(screen→module, 다리), `defined_in`(api→module, 다리), `depends`(container→container), `reads`(module→module, symbol→symbol, function→table|symbol), `inherits`(symbol→symbol) 여섯이다(스펙 DEC-24. `contains`는 2.0.2에 이미 있어 그대로 쓴다). 2.0.2 엣지 모양 `{ from, to, kind }`는 그대로고 Graphify·다리가 만든 엣지만 `props`를 더 가진다: `confidence`(`EXTRACTED`|`INFERRED`), 참일 때만 실리는 `typeOnly`·`deferred`, 원 relation 이 종류 이름과 다를 때의 `via`(`method`·`indexes`·`cites`), 다리가 만든 엣지의 `bridge: true`. `g.link`의 여섯째 인자로 넣고, 같은 (from, kind, to)가 이미 있으면 돌려받은 엣지의 props 를 부르는 쪽이 합친다.

이고(livemap 함수 id 는 스키마 없는 짧은 이름), 테이블은 `schema.table` 그대로 같다. 다리가 새로 만드는 엣지는 `renders`(screen→module)·`defined_in`(api→module)·`invokes`(api→로그인 노드) 셋이고 `props.bridge`가 참이다.

## 순서

`config.adapters` 순서로 돈다. `tests`·`git`은 `screen`·`api`가 있어야 covers·changes를 잇고, `testreport`는 `git`이 만든 `deploy:head`로 검사 결과가 최신인지 판정한다(`test-results.md`). 새 어댑터가 다른 어댑터의 노드에 기대면 그 뒤에 둔다. 모든 어댑터가 끝나면 엔진 연결 단계가 화면 리터럴을 API 노드에 잇는다(위 「화면 리터럴과 연결 단계」). 어댑터 순서를 바꾸지 않아도 되므로 기존 설정의 `adapters` 순서는 그대로 둔다.

## 골격

```js
// map/adapters/openapi.mjs
// OpenAPI 어댑터: openapi.json 의 paths 에서 api 노드를 만든다. 언어와 무관하다.
export default function openapi(g, fs, cfg) {
  const c = cfg.openapi;                       // { "file": "docs/openapi.json" }
  if (!fs.has(c.file)) return `OpenAPI 문서 없음: ${c.file}`;
  const doc = JSON.parse(fs.read(c.file));
  let n = 0;
  for (const [path, ops] of Object.entries(doc.paths || {})) {
    for (const method of Object.keys(ops)) {
      const p = path.replace(/\{(\w+)\}/g, ':$1');
      g.add('api', p, `${method.toUpperCase()} ${p}`, { method: method.toUpperCase(), calls: [], operationId: ops[method].operationId }, { file: c.file, line: null, rule: 'openapi:paths' });
      n += 1;
    }
  }
  return n ? null : 'paths 0건';
}
```

## 단위 검사

엔진 저장소의 `test/fixtures/mini/`는 참조 어댑터가 읽는 최소 저장소이고 `test/adapters.test.mjs`가 기대값을 고정한다. 참조 어댑터를 새로 쓰면 픽스처에 그 스택의 최소 파일을 더하고 기대값을 한 줄 추가한다. 프로젝트 소유 어댑터는 같은 방식의 검사를 프로젝트 안에 둔다(엔진의 `buildGraph(root)`를 import해 작은 픽스처 폴더를 읽힌다). 정규식이 깨졌을 때 빈 표 대신 여기서 먼저 실패해야 한다. 바닥값(`config.floors`)은 두 번째 방어선이다.

```js
test('openapi: paths → api 노드', () => {
  assert.deepEqual(g.of('api').map((a) => a.id).sort(), ['/items', '/items/:id']);
});
```

## 스택별 대안

| 스택 | 우선 | 대안 |
|---|---|---|
| React Router 선언형 | 참조 router | Next.js는 `app/**/page.tsx` 파일 트리 → 경로; Remix는 `routes/` 파일명 |
| Express·Fastify·Hono | OpenAPI 문서(있으면) | 라우터 등록 호출 `app.get('/x'` 정규식 |
| Rails·Django·Spring | `rails routes`/`manage.py show_urls`/Actuator 덤프를 CI에서 파일로 저장 → 파일 어댑터 | 소스 파싱은 tree-sitter |
| Prisma·Django ORM·Alembic | migration 폴더 관례 | 스키마 파일(`schema.prisma`) |
| Jest·pytest·Go test | JUnit XML(거의 모든 러너가 낸다)을 `livemap test-report --import`로 결과 JSON에 넣음 → testreport | 소스에서 라우트 문자열 grep |
| 작업 문서가 tasks/가 아님 | tasks 어댑터의 `dir`·절 이름만 바꿈 | Linear·GitHub Issues는 CI에서 JSON 덤프 → 파일 어댑터 |

원칙은 "스택이 이미 내놓는 산출물을 읽는다"이다. 산출물은 형식이라 언어를 넘어 재사용되고, 소스 정규식은 그 프로젝트에서만 산다.
