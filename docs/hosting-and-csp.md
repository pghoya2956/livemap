# 호스팅과 CSP

## 로컬

`npm run map:serve`(`livemap serve`) → `http://127.0.0.1:4180/map/`. 요청마다 재빌드(5초 캐시)라 병합 전 작업 중 상태가 그대로 보인다. loopback에만 바인드한다. 배포와 같은 CSP를 걸어 인라인 의존을 로컬에서 먼저 잡는다.

## 배포 폴더 만들기: export

`livemap export <dir>`이 화면 파일·서체·프로젝트 캡처·생성물을 브라우저 주소 배치 그대로 한 폴더에 모은다. 먼저 `livemap build`로 생성물을 만든다. 주소→파일 배치는 `serve`와 같은 함수가 정하므로, 로컬에서 본 배치가 그대로 배포된다.

| 브라우저 주소 | export 폴더 안 | 가져오는 곳 |
|---|---|---|
| `/map/`·`/map/map.css`·`/map/map.js` | `index.html`·`map.css`·`map.js` | 패키지 `site/` |
| 서체(`/map/` 아래 fonts 폴더) | fonts 폴더의 `PretendardVariable.woff2`·`LICENSE.txt` | 패키지 `site` 폴더의 fonts |
| `/map/captures/<id>.jpg` | `captures/<id>.jpg` | 프로젝트 `config.captures.site`의 `*.jpg` |
| `/map/data/*.json` | `data/data.json`·`data/overview.json`·`data/graph.json` | `--out`(기본 `map/.out`)의 build 산출 |

- 생성물 셋 중 하나라도 없으면 exit 2. 빈 상황판이 이미지에 실리지 않는다.
- 쓰기 전에 대상 폴더를 비운다. 비우는 대상은 없는 폴더, 빈 폴더, 이전 export 표시 파일(`.livemap-export`)이 있는 폴더뿐이다. 그 밖의 폴더는 지우지 않고 exit 2.
- `livemap serve --static <dir>`이 export 폴더를 재빌드 없이 같은 배치·같은 CSP로 준다. 배포 서버에 넣기 전 확인용이다.

## 정적 서빙 붙이기

원칙은 "이미 있는 정적 서버에 `/map/` 경로 하나". 새 인프라 객체가 없고 제품 배포 주기로 갱신되며 상황판이 자기 뒤처짐을 표시한다. 인증 없는 공개 표면을 만들지 않는다(비공개 저장소의 계획·커밋 메시지가 보인다).

서빙 계약은 export 폴더 하나다.

- `/map/*` → export 폴더. `/map/data/*`에만 `cache-control: no-store`, 나머지는 `no-cache`.
- `/map` → `/map/` 302. SPA 폴백 없이 없는 파일은 404. 경로 탈출(`..`)·숨김 파일 거부.

Node 예(앱 서버에 넣는 형태). 이미지에는 CI가 만든 export 폴더만 넣는다(`COPY map/.out/site/ ./map/site/`).

```js
const mapDir = resolve(fileURLToPath(new URL('../map/site/', import.meta.url)));
async function serveMap(res, sub) {
  let decoded; try { decoded = decodeURIComponent(sub); } catch { fail(404, 'not_found'); }
  if (decoded === '' || decoded === '/') decoded = '/index.html';
  if (decoded.includes('\0') || decoded.split('/').some(p => p.startsWith('.'))) fail(404, 'not_found');
  const target = resolve(mapDir, '.' + decoded);
  const type = staticTypes.get(extname(target));
  if (!target.startsWith(mapDir + sep) || !type) fail(404, 'not_found');
  const info = await stat(target).catch(() => null);
  if (!info || !info.isFile()) fail(404, 'not_found');
  res.writeHead(200, { 'content-type': type, 'cache-control': decoded.startsWith('/data/') ? 'no-store' : 'no-cache' });
  res.end(await readFile(target));
}
// handle(): if (url.pathname === '/map') 302 → '/map/';  if (url.pathname.startsWith('/map/')) serveMap(res, url.pathname.slice(4))
```

`staticTypes`에는 `.html`·`.css`·`.js`·`.json`·`.jpg`·`.woff2`가 있어야 한다. GitHub Pages·Cloudflare Pages는 공개 표면이라 기본으로 권하지 않는다.

## CSP

`default-src 'self'; style-src 'self'; script-src 'self'`가 걸린 서버가 흔하다. 이 정책은 다음을 막는다.

- `<style>`·`<script>` 인라인 블록
- `style="…"` 속성(요소 인라인 스타일도 style-src 위반이다)
- Google Fonts 등 외부 스타일·폰트
- `data:` 이미지

엔진 화면은 그래서 `index.html`(마크업만) + `map.css` + `map.js`이고, 동적 폭은 `data-w` 속성을 붙인 뒤 JS에서 `el.style.width = …`로 적용한다(CSSOM 조작은 허용된다). 화면을 고칠 때 이 셋을 지키면 어느 CSP에서도 뜬다. 로컬 serve와 예산 검사가 같은 CSP를 걸어 회귀를 잡는다.

## CI

CI·문서는 엔진을 npm 스크립트로 부른다. 워크플로 `run:`에는 `node_modules/.bin`이 PATH에 없고, `npx livemap`은 CI에서 `--yes`를 가정해 로컬 설치가 없으면 레지스트리의 다른 패키지를 받을 수 있다. 직접 부를 때는 `npx --no livemap …`을 쓴다.

```yaml
  map:
    name: 상황판 검사 (정합·화면 예산)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }          # 14일 로그·배포 sha 대비에 이력이 필요하다
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm, cache-dependency-path: package-lock.json }
      - run: npm ci --no-audit --no-fund
      - run: npx playwright install --with-deps chromium
      - run: npm run map:check
      - run: npm run map:budget
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: map-overview, path: map/.out/overview-1440.png, if-no-files-found: ignore }
```

이미지·사이트 빌드 잡에서는 빌드 직전에 생성물과 export 폴더를 만든다. 이때 매니페스트 태그는 아직 이전 배포를 가리키므로, 지금 커밋이 곧 배포본임을 알려준다.

```yaml
      - run: npm ci --no-audit --no-fund
      - run: npm run map
        env: { MAP_ASSUME_DEPLOYED_SHA: ${{ github.sha }} }
      - run: npm run map:export
```

Dockerfile에는 `COPY map/.out/site/ ./map/site/` 한 줄. 생성기·어댑터·검사는 이미지에 넣지 않는다.

## 배포 뒤 검증

상태 코드 200은 렌더를 증명하지 않는다. Chromium으로 열어 `.panel` 개수, 사이드바 배경색, 콘솔 오류 0을 본다. 포트포워드 뒤에서 프로덕션 호스트 헤더가 필요하면 `page.route('**/*', …)`로 요청을 로컬 포트로 바꿔 태운다(Chromium은 `extraHTTPHeaders`의 Host를 거부한다).
