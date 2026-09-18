// 캡처 패널이 보일 목록: 사용자가 기능을 고르기 전에는 미리보기 몇 장, 고른 뒤에는 그 기능 캡처만(DEC-24·DEC-38).
// key는 보이는 목록의 신원이다. 바뀌면 패널이 장 번호와 멈춤을 되돌린다(DEC-39). 기능 범위면 기능 id, 전체면 빈 값.

/** 고르기 전 미리보기: 배열 앞 previewCount장. */
export const previewCaptures = (captures, previewCount) => captures.slice(0, previewCount);

/** → { list, scoped, key } */
export function visibleCaptures(captures = [], { selected, userPicked = false, previewCount = 5 } = {}) {
  if (userPicked && selected != null) return { list: captures.filter((c) => c.journey === selected), scoped: true, key: selected };
  return { list: previewCaptures(captures, previewCount), scoped: false, key: '' };
}
