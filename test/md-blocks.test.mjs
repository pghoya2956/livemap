// md 블록 읽개 검사: 파일 하나를 줄 번호와 함께 제목·목록 항목·표 행·글 줄로 나누는지 본다.
// 작업 문서 읽기 계약(SC-1)은 줄 머리 정규식 대신 이 블록 위에서 결정·계획 항목·잔여 질문을 가른다.
import test from 'node:test';
import assert from 'node:assert/strict';

const md = () => import('../src/lib/md-blocks.mjs');
const pick = (blocks, type) => blocks.filter((b) => b.type === type);

test('SC-1 md 블록: 백틱·물결 코드 펜스 안 줄은 건너뛰고 줄 번호는 원문 그대로', async () => {
  const { readBlocks } = await md();
  const text = [
    '# 스펙', //1
    '```markdown', //2
    '- DEC-1 예시 결정', //3
    '~~~', //4 백틱 펜스 안의 물결은 펜스를 닫지 않는다
    '| DEC-2 | 예시 |', //5
    '```', //6
    '- DEC-3 진짜 결정', //7
    '~~~~text', //8
    '- [ ] PN-01 예시', //9
    '~~~', //10 여는 펜스보다 짧으면 닫지 않는다
    '~~~~', //11
    '  ```', //12 앞 공백 셋까지는 펜스
    '- DEC-4 예시', //13
    '  ```', //14
    '- DEC-5 끝', //15
  ].join('\n');
  const items = pick(readBlocks(text), 'item');
  assert.deepEqual(items.map((b) => [b.line, b.head?.id]), [[7, 'DEC-3'], [15, 'DEC-5']]);
  assert.equal(pick(readBlocks(text), 'row').length, 0);
  // 닫히지 않은 펜스는 파일 끝까지 건너뛴다
  assert.deepEqual(readBlocks('- DEC-1 a\n```\n- DEC-2 b').filter((b) => b.type === 'item').map((b) => b.line), [1]);
});

test('SC-1 md 블록: 제목 수준·글자·절 경로, 블록마다 감싼 절 경로', async () => {
  const { readBlocks } = await md();
  const blocks = readBlocks(['# 제목', '', '## 결정 사항 ##', '- DEC-1 a', '### 세부', '| x | y |', '## 잔여 열린 질문', '없음: 모두 닫음', '#해시태그는 제목 아님'].join('\n'));
  const hs = pick(blocks, 'heading');
  assert.deepEqual(hs.map((h) => [h.line, h.level, h.text]), [[1, 1, '제목'], [3, 2, '결정 사항'], [5, 3, '세부'], [7, 2, '잔여 열린 질문']]);
  assert.deepEqual(hs[2].path.map((p) => p.text), ['제목', '결정 사항', '세부']);
  const item = pick(blocks, 'item')[0];
  assert.deepEqual(item.path.map((p) => [p.level, p.text, p.line]), [[1, '제목', 1], [2, '결정 사항', 3]]);
  assert.deepEqual(pick(blocks, 'row')[0].path.map((p) => p.text), ['제목', '결정 사항', '세부']);
  const texts = pick(blocks, 'text');
  assert.deepEqual(texts.map((t) => [t.line, t.text]), [[8, '없음: 모두 닫음'], [9, '#해시태그는 제목 아님']]);
  assert.deepEqual(texts[0].path.map((p) => p.text), ['제목', '잔여 열린 질문']);
});

test('SC-1 md 블록: 중첩 목록 들여쓰기, 목록 표지, 체크박스 [ ]·[x]·[X]', async () => {
  const { readBlocks } = await md();
  const items = pick(readBlocks(['- [ ] PN-01 a: 설명', '  - [x] P0-02 b', '    * [X] 셋째', '1. 번호 목록', '+ [ ]', '- [ ]붙은 글자', '-없는 공백'].join('\n')), 'item');
  assert.deepEqual(items.map((b) => [b.line, b.indent, b.marker, b.checkbox, b.checked]), [
    [1, 0, '-', ' ', false], [2, 2, '-', 'x', true], [3, 4, '*', 'X', true], [4, 0, '1.', null, null], [5, 0, '+', ' ', false], [6, 0, '-', null, null],
  ]);
  assert.deepEqual(items.map((b) => b.text), ['PN-01 a: 설명', 'P0-02 b', '셋째', '번호 목록', '', '[ ]붙은 글자']);
  assert.equal(items[0].head.id, 'PN-01');
  assert.equal(items[0].head.rest, ' a: 설명');
  assert.equal(items[2].head, null);
});

test('SC-1 md 블록: 표 칸 분리, 이스케이프된 파이프, 머리 행과 구분 행', async () => {
  const { readBlocks, splitCells } = await md();
  const blocks = readBlocks(['| ID | 질문 |', '|----|:---:|', '| OQ-01 | a \\| b | 끝 |', '| OQ-04·OQ-05 | c |', '', '| DEC-1·DEC-2 | 붙은 표 |', '글', '| 머리 없는 표 |'].join('\n'));
  const rows = pick(blocks, 'row');
  assert.deepEqual(rows.map((r) => [r.line, r.header, r.table]), [[1, true, 1], [3, false, 1], [4, false, 1], [6, false, 2], [8, false, 3]]);
  assert.deepEqual(rows[1].cells, ['OQ-01', 'a | b', '끝']);
  assert.deepEqual(rows[2].cells, ['OQ-04·OQ-05', 'c']);
  assert.equal(rows[2].head.id, 'OQ-04');
  assert.equal(rows[2].head.rest, '·OQ-05');
  assert.deepEqual(splitCells('a | `x` | \\|'), ['a', '`x`', '|']);
  assert.deepEqual(splitCells('|  |'), ['']);
  // 표 중간의 대시 칸 행은 구분 행이 아니다
  const dash = pick(readBlocks('| ID | 질문 |\n|---|---|\n| - | - |'), 'row');
  assert.deepEqual(dash.map((r) => [r.line, r.header, r.cells]), [[1, true, ['ID', '질문']], [3, false, ['-', '-']]]);
});

test('SC-1 md 블록: 머리 번호의 굵게·밑줄 벗김과 취소선 struck', async () => {
  const { readBlocks, headId } = await md();
  const items = pick(readBlocks(['- **DEC-7** [확정]: a', '- __DEC-8__ b', '- ~~DEC-9~~ 폐기', '- **DEC-10 [확정]**: c', '- ~~**DEC-11**~~ d', '- DEC-12a 아님', '- 설명 DEC-13'].join('\n')), 'item');
  assert.deepEqual(items.map((b) => b.head && [b.head.id, b.head.bold, b.head.struck]), [
    ['DEC-7', true, false], ['DEC-8', true, false], ['DEC-9', false, true], ['DEC-10', true, false], ['DEC-11', true, true], ['DEC-12a', false, false], null,
  ]);
  assert.equal(items[0].head.rest, ' [확정]: a');
  assert.equal(items[3].head.rest, ' [확정]: c');
  const row = pick(readBlocks('| ~~OQ-01~~ | 답 |\n| **R-OQ-01** | x |\n| OQ-H2b | y |'), 'row');
  assert.deepEqual(row.map((r) => [r.head.id, r.head.struck, r.head.rest]), [['OQ-01', true, ''], ['R-OQ-01', false, ''], ['OQ-H2b', false, '']]);
  assert.equal(headId('— 없음'), null);
  assert.equal(headId(''), null);
});

test('SC-1 md 블록: CRLF 줄 끝을 받고 줄 번호가 같다', async () => {
  const { readBlocks } = await md();
  const lf = readBlocks('# a\n\n- [x] PN-01 b\n| OQ-01 | c |\n```\n- DEC-1\n```\n- DEC-2 d');
  const crlf = readBlocks('# a\r\n\r\n- [x] PN-01 b\r\n| OQ-01 | c |\r\n```\r\n- DEC-1\r\n```\r\n- DEC-2 d\r\n');
  assert.deepEqual(crlf, lf);
  assert.equal(crlf.find((b) => b.type === 'row').cells[1], 'c');
});
