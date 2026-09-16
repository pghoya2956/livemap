#!/usr/bin/env bash
# 공개 누출 검사: 작업 트리·이력(커밋 머리 줄 제외)·커밋 메시지·팩 내용 네 범위에서 개인 문자열을 찾는다.
# 패턴은 scripts/leak-patterns.txt 한 줄(대소문자 무시), 그 파일 자신은 범위에서 뺀다. 이력 검사에는 전체 이력(fetch-depth 0)이 필요하다.
set -uo pipefail
cd "$(dirname "$0")/.."
X=scripts/leak-patterns.txt
PAT=$(tr -d '\n' < "$X")
K=$(mktemp -d); trap 'rm -rf "$K"' EXIT
tree=$(git grep -niE "$PAT" -- . ":(exclude)$X" | tee "$K/tree.txt" | wc -l | tr -d ' ')
hist=$(git log -p --all --format= -- . ":(exclude)$X" | grep -iE "$PAT" | tee "$K/hist.txt" | wc -l | tr -d ' ')
msgs=$(git log --all --format=%B | grep -iE "$PAT" | tee "$K/msgs.txt" | wc -l | tr -d ' ')
npm pack --pack-destination "$K" >/dev/null 2>&1
mkdir "$K/x" && tar -xzf "$K"/*.tgz -C "$K/x"
pack=$(grep -rniE "$PAT" "$K/x/package" | tee "$K/pack.txt" | wc -l | tr -d ' ')
echo "leak scan: tree=$tree history=$hist messages=$msgs pack=$pack"
if [ "$tree$hist$msgs$pack" != "0000" ]; then
  for f in tree hist msgs pack; do [ -s "$K/$f.txt" ] && { echo "--- $f"; cut -c1-200 "$K/$f.txt" | head -20; }; done
  exit 1
fi
