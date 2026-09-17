#!/usr/bin/env bash
# tarball 스모크: 팩을 저장소 밖 임시 폴더(공백·한글 포함)의 픽스처 프로젝트에 설치하고 모든 명령을 node_modules/.bin/livemap으로 부른다.
# 필요: Playwright chromium 브라우저(npx playwright install chromium). PLAYWRIGHT_VERSION으로 설치 버전을 바꾼다.
# 화면 단계(예산, 하위 화면 콘솔 0, SC-9 경로 변경, 클릭 경로)는 실패해도 다음 단계를 계속 돌리고, 끝에 실패한 단계를 모아 exit 1이다.
# 하위 화면 방문과 클릭 경로 크롤은 저장소의 scripts/route-crawl.mjs·scripts/click-targets.json을 쓴다(팩에는 없다).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=$PWD
PW=${PLAYWRIGHT_VERSION:-$(node -p 'require("./package.json").devDependencies["@playwright/test"]')}
T=$(mktemp -d "${TMPDIR:-/tmp}/livemap 스모크 검증.XXXXXX")
PIDS=()
cleanup() { for p in ${PIDS[@]+"${PIDS[@]}"}; do kill "$p" 2>/dev/null || true; done; rm -rf "$T"; }
trap cleanup EXIT
step() { echo "== $*"; }
FAILED=()
# 실패해도 계속하는 단계. if 조건 문맥이라 안쪽 명령이 실패해도 set -e로 멈추지 않는다.
soft() { local name=$1; shift; step "$name"; if "$@"; then :; else echo "실패: $name"; FAILED+=("$name"); fi; }
# 프로젝트 폴더에서 livemap serve를 뒤에 띄운다: bg_serve <프로젝트> <포트> [--static <폴더>]
bg_serve() { local dir=$1 port=$2; shift 2; (cd "$dir" && exec node_modules/.bin/livemap serve --port "$port" "$@" >"$T/serve-$port.log" 2>&1) & PIDS+=($!); }
CRAWL="$REPO/scripts/route-crawl.mjs"; TARGETS="$REPO/scripts/click-targets.json"

npm pack --pack-destination "$T" >/dev/null 2>&1
TGZ=$(ls "$T"/pghoya2956-livemap-*.tgz)
mkdir "$T/p" && cp -R "$REPO/test/fixtures/mini/." "$T/p/" && cd "$T/p"
npm i --no-save --no-audit --no-fund "$TGZ" "@playwright/test@$PW" >/dev/null
L=node_modules/.bin/livemap

step "playwright 한 벌"
n=$(npm ls @playwright/test --all --parseable | grep -c 'node_modules/@playwright/test$'); [ "$n" = 1 ]

step "check: exit 1과 픽스처의 의도된 오류"
set +e; "$L" check > "$T/check.txt"; code=$?; set -e
[ "$code" = 1 ] || { cat "$T/check.txt"; echo "check exit $code"; exit 1; }
grep -qF '라우트 없음: /nope' "$T/check.txt"

step "--version"
[ "$("$L" --version)" = "$(node -p "require('$REPO/package.json').version")" ]

step "build · export"
"$L" build
"$L" export "$T/site"

CFG=node_modules/@pghoya2956/livemap/budget/playwright.config.mjs
budget_serve() { npx --no playwright test --config "$CFG" && test -f map/.out/overview-1440.png; }
soft "예산: serve" budget_serve
budget_static() { LIVEMAP_BUDGET_STATIC="$T/site" npx --no playwright test --config "$CFG"; }
soft "예산: serve --static" budget_static

# 하위 화면 방문기: 클릭 대상 표의 라우트 패턴 중 개요 밖 패턴의 모든 개체 주소를 연다.
#   console: 방문마다 콘솔 오류·CSP 위반 0, 화면 루트(data-screen) 있음
#   sc9 <여정 파일> <로드맵 파일>: 더해 프로젝트 문구([data-text="project"]) 밖 글자에 "여정"·"장면" 0, 화면에 설정한 두 경로가 보이고 기본 경로는 없음
cat > "$T/subscreens.mjs" <<'JS'
import { readFileSync } from 'node:fs';
const [crawl, targetsPath, url, mode, semantic, roadmap] = process.argv.slice(2);
const { launchBrowser, openCrawlContext, fetchJson, buildRouteIndex, visitHash } = await import(crawl);
const base = url.endsWith('/') ? url : `${url}/`;
const served = await fetchJson(`${base}data/overview.json`), data = await fetchJson(`${base}data/data.json`);
const targets = JSON.parse(readFileSync(targetsPath, 'utf8'));
const ctx = buildRouteIndex(targets, [{ name: 'data.json', data }, { name: 'overview.json', data: served }]);
const hashes = ctx.routes.filter((r) => r.screen !== 'overview')
  .flatMap((r) => ctx.entities.get(r.pattern).tuples.map((t) => r.pattern.replace(/<([^>]+)>/g, (_, n) => t[n])));
const browser = await launchBrowser(base);
const problems = []; let all = '';
try {
  const { page, log } = await openCrawlContext(browser, { generatedAt: served.generatedAt });
  await page.goto(base); await page.waitForSelector('.panel', { timeout: 15000 });
  for (const h of hashes) {
    const v = await visitHash(page, log, ctx, h);
    if (v.errors.length || v.csp.length) problems.push(`${h} 콘솔 ${JSON.stringify([...v.errors, ...v.csp]).slice(0, 200)}`);
    if (!v.screenAttr) problems.push(`${h} data-screen 없음`);
    if (mode !== 'sc9') continue;
    const t = await page.evaluate(() => { const c = document.getElementById('root').cloneNode(true); c.querySelectorAll('[data-text="project"]').forEach((e) => e.remove()); return { engine: c.textContent, full: document.getElementById('root').textContent }; });
    const words = t.engine.match(/여정|장면/g);
    if (words) problems.push(`${h} 엔진 문자열 ${[...new Set(words)].join('·')}`);
    all += `\n${t.full}`;
  }
  if (mode === 'sc9') {
    for (const p of [semantic, roadmap]) if (!all.includes(p)) problems.push(`설정 경로가 화면에 없음: ${p}`);
    for (const p of ['map/semantic/journeys.json', 'tasks/roadmap.md']) if (all.includes(p)) problems.push(`기본 경로가 화면에 있음: ${p}`);
  }
} finally { await browser.close(); }
console.log(`${mode}: 방문 ${hashes.length}, 문제 ${problems.length}`);
for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
process.exit(problems.length ? 1 : 0);
JS

bg_serve "$T/p" 4185
subscreens_console() { node "$T/subscreens.mjs" "$CRAWL" "$TARGETS" http://127.0.0.1:4185/map/ console; }
soft "하위 화면 콘솔 0" subscreens_console

# SC-9: semantic·roadmap.file을 기본값과 다른 경로로 옮긴 복사본
cp -R "$T/p" "$T/p9" && cd "$T/p9"
mkdir -p map/features docs/plan && mv map/semantic/journeys.json map/features/journeys.json && mv tasks/roadmap.md docs/plan/roadmap.md
node -e 'const f="map/config.json",c=JSON.parse(require("fs").readFileSync(f,"utf8"));c.semantic="map/features/journeys.json";c.roadmap.file="docs/plan/roadmap.md";require("fs").writeFileSync(f,JSON.stringify(c,null,2))'
"$L" build >/dev/null
bg_serve "$T/p9" 4186
sc9() { node "$T/subscreens.mjs" "$CRAWL" "$TARGETS" http://127.0.0.1:4186/map/ sc9 map/features/journeys.json docs/plan/roadmap.md; }
soft "SC-9 경로 변경" sc9

# 클릭 경로(SC-14): 마일스톤 절을 더한 복사본에서 모든 라우트 패턴에 개체가 있게 한다. git 없는 폴더라 활동 0·캡처 없음 상태도 함께 본다.
cp -R "$T/p" "$T/pc" && cd "$T/pc"
node -e '
const fs = require("fs"), f = "tasks/roadmap.md";
let s = fs.readFileSync(f, "utf8");
s = s.replace("# 로드맵\n", "# 로드맵\n\n## 마일스톤: 스모크 묶음\n\n스모크 크롤이 마일스톤 경로를 방문하게 한다.\n\n- id: smoke-ms\n- 상태: 진행\n");
s = s.replace("- id: first\n", "- id: first\n- 마일스톤: smoke-ms\n");
fs.writeFileSync(f, s);'
"$L" build >/dev/null
"$L" export "$T/pc-site" >/dev/null
bg_serve "$T/pc" 4187
bg_serve "$T/pc" 4188 --static "$T/pc-site"
crawl_serve() { node "$CRAWL" --url http://127.0.0.1:4187/map/ --targets "$TARGETS"; }
crawl_static() { node "$CRAWL" --url http://127.0.0.1:4188/map/ --targets "$TARGETS"; }
soft "클릭 경로: serve" crawl_serve
soft "클릭 경로: serve --static" crawl_static

step "init 두 번(두 번째 무변경)"
mkdir "$T/e" && cd "$T/e" && npm init -y >/dev/null && npm i --no-save --no-audit --no-fund "$TGZ" >/dev/null
snap() { find . -path ./node_modules -prune -o -type f -print | sort | while IFS= read -r f; do shasum "$f"; done; }
node_modules/.bin/livemap init; snap > "$T/init1.txt"
node_modules/.bin/livemap init; snap > "$T/init2.txt"
diff "$T/init1.txt" "$T/init2.txt"
if [ ${#FAILED[@]} -gt 0 ]; then printf 'smoke: 실패 단계 %s\n' "${FAILED[@]}"; exit 1; fi
echo "smoke: ok"
