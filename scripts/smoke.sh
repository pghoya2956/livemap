#!/usr/bin/env bash
# tarball 스모크: 팩을 저장소 밖 임시 폴더(공백·한글 포함)의 픽스처 프로젝트에 설치하고 모든 명령을 node_modules/.bin/livemap으로 부른다.
# 필요: Playwright chromium 브라우저(npx playwright install chromium). PLAYWRIGHT_VERSION으로 설치 버전을 바꾼다.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=$PWD
PW=${PLAYWRIGHT_VERSION:-$(node -p 'require("./package.json").devDependencies["@playwright/test"]')}
T=$(mktemp -d "${TMPDIR:-/tmp}/livemap 스모크 검증.XXXXXX"); trap 'rm -rf "$T"' EXIT
step() { echo "== $*"; }

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
step "예산: serve"
npx --no playwright test --config "$CFG"
test -f map/.out/overview-1440.png
step "예산: serve --static"
LIVEMAP_BUDGET_STATIC="$T/site" npx --no playwright test --config "$CFG"

step "init 두 번(두 번째 무변경)"
mkdir "$T/e" && cd "$T/e" && npm init -y >/dev/null && npm i --no-save --no-audit --no-fund "$TGZ" >/dev/null
snap() { find . -path ./node_modules -prune -o -type f -print | sort | while IFS= read -r f; do shasum "$f"; done; }
node_modules/.bin/livemap init; snap > "$T/init1.txt"
node_modules/.bin/livemap init; snap > "$T/init2.txt"
diff "$T/init1.txt" "$T/init2.txt"
echo "smoke: ok"
