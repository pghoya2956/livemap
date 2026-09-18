// 캡처 패널이 보일 목록: 사용자가 기능을 고르기 전에는 미리보기 몇 장, 고른 뒤에는 그 기능 캡처만(DEC-24·DEC-38).
// key는 보이는 목록의 신원이다. 바뀌면 패널이 장 번호와 멈춤을 되돌린다(DEC-39). 기능 범위면 기능 id, 전체면 빈 값.

/**
 * 고르기 전 미리보기: 기능 순서로 기능마다 첫 장, 앞 기능이 이미 보인 파일은 건너뛰고 그 기능의 다음 장, previewCount장까지.
 * 1.2.0 엔진의 캡처 선택과 같은 알고리즘이라 개요 첫 화면이 1.2.0과 같다(SC-14, DEC-52).
 */
export function previewCaptures(captures, previewCount) {
  const out = [], files = new Set(), done = new Set();
  for (const c of captures) {
    if (out.length >= previewCount) break;
    if (done.has(c.journey) || files.has(c.file)) continue;
    out.push(c); files.add(c.file); done.add(c.journey);
  }
  return out;
}

/** → { list, scoped, key } */
export function visibleCaptures(captures = [], { selected, userPicked = false, previewCount = 5 } = {}) {
  if (userPicked && selected != null) return { list: captures.filter((c) => c.journey === selected), scoped: true, key: selected };
  return { list: previewCaptures(captures, previewCount), scoped: false, key: '' };
}
