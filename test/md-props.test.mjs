// md 속성 파서 검사: 2단 절(## / ###), `- 키: 값`, 목록 키 분리, md 표, 백틱 제거, 자식이 부모를 덮지 않음.
// 로드맵(1단)과 여정 정본(2단)을 같은 파서로 읽는다. 뜻(키 이름 → 필드)은 부르는 어댑터가 정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSections } from '../src/lib/md-props.mjs';

const ROADMAP = `# 로드맵

## 계정 공백 메우기

새 계정이 비밀번호를 잊어도 스스로 돌아온다.

- id: account-gaps
- 상태: 다음
- 선행: agent-leverage, search
- 장면: —
- 마일스톤: real-use-2

## 마일스톤: 12월 실거래 출시

계약 리조트 한 곳이 실거래를 완주한다.

- id: real-use-2
- 목표일: 2026-12-31
`;

const JOURNEY = `# 다이버 여정

- 사용자 확인: 2026-09-17
- 시작 지점: notify/me

## 하위 유형

| 하위 유형 | 계정 | 시작 지점 |
| --- | --- | --- |
| 방문자 | — | discover/list |
| 가입한 다이버 | \`diver@example.test\` | — |

## 여정: 리조트 찾기

리조트를 둘러보고 상품을 고른다.

### 리조트 목록

- id: discover/list
- 상태: 동작
- 하는 사람: 방문자, 가입한 다이버

규칙은 공개가로 계산한다.

### 상품 상세

- id: discover/product
- 상태: 목업
`;

test('1단 로드맵: 절마다 제목·목표 문장·속성, 목록 키만 쉼표로 나눈다', () => {
  const secs = parseSections(ROADMAP, { listKeys: ['선행', '장면'] });
  assert.equal(secs.length, 2);
  const [item, milestone] = secs;
  assert.equal(item.title, '계정 공백 메우기');
  assert.equal(item.prose, '새 계정이 비밀번호를 잊어도 스스로 돌아온다.');
  assert.equal(item.props.id, 'account-gaps');
  assert.deepEqual(item.props['선행'], ['agent-leverage', 'search']);
  assert.deepEqual(item.props['장면'], []); // 대시 한 칸은 빈 목록
  assert.equal(item.props['마일스톤'], 'real-use-2'); // 목록 키가 아니면 문자열 그대로
  assert.equal(milestone.title, '마일스톤: 12월 실거래 출시');
  assert.equal(milestone.props['목표일'], '2026-12-31');
});

test('2단 여정: 자식 절의 id가 부모를 덮지 않고 부모 문장에 흡수되지 않는다', () => {
  const secs = parseSections(JOURNEY, { listKeys: ['하는 사람'] });
  const journey = secs.find((s) => s.title.startsWith('여정:'));
  assert.equal(journey.props.id, undefined); // 자식 `- id`가 부모로 새지 않는다
  assert.equal(journey.prose, '리조트를 둘러보고 상품을 고른다.');
  assert.equal(journey.children.length, 2);
  const [list, product] = journey.children;
  assert.equal(list.title, '리조트 목록');
  assert.equal(list.props.id, 'discover/list');
  assert.equal(list.props['상태'], '동작');
  assert.deepEqual(list.props['하는 사람'], ['방문자', '가입한 다이버']);
  assert.equal(list.prose, '규칙은 공개가로 계산한다.');
  assert.equal(product.props.id, 'discover/product');
});

test('파일 머리: 첫 제목 앞의 `- 키: 값`은 문서 속성이다', () => {
  const doc = parseSections(JOURNEY, { head: true });
  assert.equal(doc.props['사용자 확인'], '2026-09-17');
  assert.equal(doc.props['시작 지점'], 'notify/me');
  assert.equal(doc.title, '다이버 여정');
  assert.equal(doc.children.length, 2);
});

test('md 표: 머리 칸과 행을 그대로 주고 백틱을 뗀다', () => {
  const secs = parseSections(JOURNEY);
  const sub = secs.find((s) => s.title === '하위 유형');
  assert.equal(sub.tables.length, 1);
  assert.deepEqual(sub.tables[0].header, ['하위 유형', '계정', '시작 지점']);
  assert.deepEqual(sub.tables[0].rows, [
    ['방문자', '—', 'discover/list'],
    ['가입한 다이버', 'diver@example.test', '—'],
  ]);
});

test('코드 펜스 안의 `- 키: 값`과 표는 읽지 않는다', () => {
  const text = `## 절

\`\`\`md
- id: 안에-있는-값
| a | b |
\`\`\`

- id: 진짜값
`;
  const [sec] = parseSections(text);
  assert.equal(sec.props.id, '진짜값');
  assert.equal(sec.tables.length, 0);
});

test('유니코드 공백(NBSP 등)은 키·값에서 일반 공백으로 읽는다', () => {
  const text = '# 다이버\n\n- 사용자 확인: 20260918 18:51\n- 시작 지점: `notify/me`\n';
  const doc = parseSections(text, { head: true });
  assert.equal(doc.props['사용자 확인'], '20260918 18:51');
  assert.equal(doc.props['시작 지점'], 'notify/me');
});
