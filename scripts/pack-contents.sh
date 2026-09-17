#!/usr/bin/env bash
# 팩 내용 검사: 필수 경로(번들 산출물 포함)가 있고 검사·워크플로·화면 원본(ui/·.design-sync/) 파일이 없다.
set -uo pipefail
cd "$(dirname "$0")/.."
files=$(npm pack --dry-run --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].files.map(f=>f.path).sort().join("\n")))')
fail=0
for p in bin/livemap.mjs src/cli.mjs site/index.html site/map.js site/map.css site/fonts/PretendardVariable.woff2 site/fonts/LICENSE.txt \
         budget/playwright.config.mjs templates/config.json docs/migrate.md CHANGELOG.md LICENSE README.md package.json; do
  grep -qx "$p" <<<"$files" || { echo "없음: $p"; fail=1; }
done
bad=$(grep -E '^(test/|\.github/|scripts/|ui/|\.design-sync/)|\.test\.mjs$' <<<"$files" || true)
[ -z "$bad" ] || { echo "실리면 안 됨:"; echo "$bad"; fail=1; }
[ $fail -eq 0 ] && echo "pack contents: ok ($(wc -l <<<"$files" | tr -d ' ') files)"
exit $fail
