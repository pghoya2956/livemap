# 어댑터 계약

어댑터는 저장소의 한 종류 사실을 읽어 그래프에 노드·엣지로 넣는 함수다. 화면은 어댑터를 모르고 파생 뷰만 읽으므로, 스택이 달라지면 어댑터만 바꾸면 된다.

## 시그니처

```js
// map/adapters/<name>.mjs   ← 프로젝트 소유 어댑터. 엔진 업그레이드가 건드리지 않는다
export default function name(g, fs, cfg) {
  // ... 노드·엣지 추가
  return null;                 // 정상
  // return '설명';            // partial: 일부만 읽음(예: 파일 없음). 생성은 계속되고 상단에 주황 점
  // throw new Error('…');     // failed: 빨간 점 + check 오류. 그래도 다른 어댑터는 돈다
}
```

- `g` — 그래프. `g.add(kind, id, label, props, src)`, `g.link(fromKind, fromId, edgeKind, toKind, toId)`, `g.get`, `g.of(kind)`, `g.in`, `g.out`, `g.issue(level, label, message)`(1.1.0부터).
- `fs` — 저장소 접근. `read(rel)`, `has(rel)`, `isDir(rel)`, `walk(dir, pred)`, `ls(dir)`, `git(...args)`(실패 시 빈 문자열), `hasGit()`, `resolveRef(name)`(main → origin/main → HEAD), `lastCommit(rel)`, `lineOf(text, needle)`.
- `cfg` — `map/config.json` 전체. 자기 키(`cfg.<name>`)만 읽고, 다른 어댑터의 키는 `?.`로 방어한다.

## 오류·경고 보고(g.issue)

어댑터가 읽은 사실에서 프로젝트 규칙 위반을 찾았으면 `g.issue(level, label, message)`로 낸다. 반환값 partial·throw는 "어댑터가 제대로 읽었나"를, `g.issue`는 "읽은 내용에 문제가 있나"를 알린다. 1.1.0부터 쓸 수 있다.

```js
g.issue('warn', '로드맵', '결정 대기 30일 넘음: 결제 흐름');
g.issue('error', '여정 파일', '필수 키 없음: owner');
```

- `level`은 `'error'` 또는 `'warn'`이다. 그 밖의 값이거나 `label`·`message`가 문자열이 아니면 `throw`하고, 그 어댑터는 failed가 된다. 다른 어댑터는 계속 돈다.
- 엔진이 지금 실행 중인 어댑터 이름을 함께 기록한다(`config.adapters`의 이름). 어댑터가 throw하기 전에 낸 문제도 남는다.
- `graph.json`·`data.json`의 최상위 `issues[]`에 `{level, label, message, adapter}`로 남는다.
- `livemap check`는 기존 검사 뒤에 error를 `✗ {label}: {message}`로, warn을 `△ {label}: {message}`로 출력한다. error는 종료 코드 1에 센다.
- 개요에는 나오지 않고 더보기의 상황판 설명 화면에 목록으로 나온다.

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
| release | 마일스톤 id(1.x 임시 이름, 1.1.0부터) | roadmap |

엣지: `shows`(step→screen, 파생이 만든다), `calls`(screen→api), `invokes`(api→function), `touches`(function→table), `covers`(test→screen|api|function), `changes`(commit→screen|api|migration), `defines`(task→decision), `contains`(migration→table|function). 새 종류가 필요하면 엔진 저장소의 `src/lib/graph.mjs` 목록에 더한다(minor 릴리스). 화면이 그 종류를 그리려면 `src/derive.mjs`도 손봐야 하므로, 먼저 기존 종류로 표현할 수 없는지 본다.

## 순서

`config.adapters` 순서로 돈다. `tests`·`git`은 `screen`·`api`가 있어야 covers·changes를 잇고, `testreport`는 `git`이 만든 `deploy:head`로 "최신 커밋" 여부를 판정한다. 새 어댑터가 다른 어댑터의 노드에 기대면 그 뒤에 둔다.

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
| Jest·pytest·Go test | JUnit XML(거의 모든 러너가 낸다) → testreport | 소스에서 라우트 문자열 grep |
| 작업 문서가 tasks/가 아님 | tasks 어댑터의 `dir`·절 이름만 바꿈 | Linear·GitHub Issues는 CI에서 JSON 덤프 → 파일 어댑터 |

원칙은 "스택이 이미 내놓는 산출물을 읽는다"이다. 산출물은 형식이라 언어를 넘어 재사용되고, 소스 정규식은 그 프로젝트에서만 산다.
