#!/usr/bin/env bash
# 릴리스 가드: 태그 = v + package.json 버전, 태그 커밋이 origin/main의 조상, CHANGELOG.md에 그 버전 절이 있다.
# 사용: TAG=v1.0.1 scripts/release-guard.sh   (CI에서는 TAG=${GITHUB_REF_NAME}). 기준 가지는 BASE_REF(기본 origin/main)
set -uo pipefail
cd "$(dirname "$0")/.."
TAG=${TAG:?TAG 환경 변수가 필요하다(예: v1.0.1)}
VERSION=$(node -p 'require("./package.json").version')
fail=0
[ "$TAG" = "v$VERSION" ] || { echo "태그 $TAG ≠ v$VERSION(package.json)"; fail=1; }
commit=$(git rev-parse --verify --quiet "$TAG^{commit}" || git rev-parse HEAD)
BASE_REF=${BASE_REF:-origin/main}
git merge-base --is-ancestor "$commit" "$BASE_REF" 2>/dev/null || { echo "태그 커밋 ${commit:0:7}이 $BASE_REF 조상이 아님"; fail=1; }
grep -qE "^## \[$(printf '%s' "$VERSION" | sed 's/\./\\./g')\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$" CHANGELOG.md || { echo "CHANGELOG.md에 ## [$VERSION] - YYYY-MM-DD 절 없음"; fail=1; }
[ $fail -eq 0 ] && echo "release guard: ok ($TAG, ${commit:0:7})"
exit $fail
