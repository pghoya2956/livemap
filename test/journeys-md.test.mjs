// 여정 md 읽개 검사: 역할 파일의 여정·단계·상태·사용자 확인과 프로젝트 대응표(화면·캡처·참조) 합치기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJourneysDir, readRoleFile, normalizeDate } from '../src/lib/journeys-md.mjs';

const README = `# 여정

## 역할

| 역할 | 파일 | 누구인가 | 시작 지점 |
| --- | --- | --- | --- |
| 다이버 | [diver.md](diver.md) | 리조트를 둘러보는 사람 | \`notify/me\` |
| 리조트 | [resort.md](resort.md) | 오너와 직원 | \`ops-day/today\` |

## 상태 어휘

| 상태 | 뜻 |
| --- | --- |
| 동작 | 실제 계정으로 끝까지 동작한다 |
| 목업 | 화면은 있지만 고정 데이터다 |
| 미착수 | 설계 근거만 있다 |
| 다음 | 다음 스펙에서 다룬다 |
`;

const DIVER = `# 다이버 여정

- 사용자 확인: 20260917 11:00
- 시작 지점: \`notify/me\`

## 하위 유형

| 하위 유형 | 누구인가 | 시작 지점 |
| --- | --- | --- |
| 방문자 | 로그인하지 않은 사람 | \`discover/list\` |
| 가입한 다이버 | 로그인한 계정 | — |

## 여정: 리조트 찾기와 상품 보기

어느 리조트에서 무엇을 할 수 있는지 안다.

### 홈

- id: discover/home
- 상태: 동작
- 하는 사람: 방문자, 가입한 다이버
- 목적: 첫인상으로 판단하고 검색을 시작한다.

**규칙**

- 가격 안내는 계정 상태로 정한다.

### 리조트 목록

- id: discover/list
- 상태: 목업
- 하는 사람: 방문자
- 목적: 조건에 맞는 리조트를 고른다.

## 여정: 내 계정과 알림

내 자격과 알림을 본다.

### 내 정보

- id: notify/me
- 상태: 동작
- 하는 사람: 가입한 다이버
- 목적: 내 자격을 본다.
`;

const RESORT = `# 리조트 여정

- 사용자 확인: 2026-09-18
- 시작 지점: \`ops-day/today\`

## 넘겨받는 일

- \`booking/inbox\` 강사가 보낸 예약 요청을 확인한다.

## 여정: 리조트 운영 하루

오늘 올 팀을 준비한다.

### 오늘

- id: ops-day/today
- 상태: 동작
- 하는 사람: 오너, 직원
- 목적: 오늘 올 팀을 본다.
`;

const MAP = {
  lanes: { diver: '다이버·강사 여정', resort: '리조트 운영' },
  steps: {
    'discover/home': { screens: ['/'], capture: 'home', refs: ['DEC-1'] },
    'discover/list': { screens: ['/resorts'], capture: 'resorts' },
    'notify/me': { screens: ['/me'], note: '역할 버튼이 여기서 갈린다' },
    'ops-day/today': { screens: ['/ops/:resort'], refs: ['20260916-ops-today#PN-3'] },
  },
};

function dir() {
  const root = mkdtempSync(join(tmpdir(), 'livemap-journeys-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs/README.md'), README);
  writeFileSync(join(root, 'docs/diver.md'), DIVER);
  writeFileSync(join(root, 'docs/resort.md'), RESORT);
  return root;
}

// 엔진 fs 유틸의 최소 모양
const fsOf = (root) => ({
  ls: (p) => readdirSync(join(root, p)),
  read: (p) => readFileSync(join(root, p), 'utf8'),
  has: (p) => { try { readFileSync(join(root, p)); return true; } catch { return false; } },
});

test('역할 파일의 여정·단계·상태를 읽고 대응표의 화면·캡처·참조를 합친다', () => {
  const root = dir();
  try {
    const sem = readJourneysDir(fsOf(root), 'docs', { map: MAP });
    assert.deepEqual(sem.journeys.map((j) => j.id), ['discover', 'notify', 'ops-day']);
    const discover = sem.journeys[0];
    assert.equal(discover.title, '리조트 찾기와 상품 보기');
    assert.equal(discover.actor, 'diver');
    assert.equal(discover.lane, '다이버·강사 여정');
    assert.deepEqual(discover.steps.map((s) => [s.id, s.status]), [['home', 'live'], ['list', 'mock']]);
    assert.deepEqual(discover.steps[0].screens, ['/']);
    assert.equal(discover.steps[0].capture, 'home');
    assert.deepEqual(discover.steps[0].refs, ['DEC-1']);
    assert.equal(discover.steps[0].intent, '첫인상으로 판단하고 검색을 시작한다.');
    assert.deepEqual(discover.steps[0].subtypes, ['방문자', '가입한 다이버']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('배우 사전과 상태 어휘는 README 표에서 온다', () => {
  const root = dir();
  try {
    const sem = readJourneysDir(fsOf(root), 'docs', { map: MAP });
    assert.deepEqual(sem.actors, { diver: '다이버', resort: '리조트' });
    assert.equal(sem.statusLegend.live, '실제 계정으로 끝까지 동작한다');
    assert.equal(sem.statusLegend.next, '다음 스펙에서 다룬다');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('사용자 확인 날짜는 파일 머리에서 오고 단계마다 실린다', () => {
  const root = dir();
  try {
    const sem = readJourneysDir(fsOf(root), 'docs', { map: MAP });
    const byId = Object.fromEntries(sem.journeys.flatMap((j) => j.steps.map((s) => [`${j.id}/${s.id}`, s])));
    assert.equal(byId['discover/home'].reviewedAt, '2026-09-17');
    assert.equal(byId['ops-day/today'].reviewedAt, '2026-09-18');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('역할 파일에서 하위 유형 시작 지점과 넘겨받는 일을 읽는다', () => {
  const diver = readRoleFile(DIVER, 'diver');
  assert.equal(diver.startStep, 'notify/me');
  assert.deepEqual(diver.subtypes, [{ name: '방문자', start: 'discover/list' }, { name: '가입한 다이버', start: 'notify/me' }]);
  const resort = readRoleFile(RESORT, 'resort');
  assert.deepEqual(resort.handoffs, ['booking/inbox']);
});

test('사용자 확인 날짜 표기를 한 가지로 맞춘다', () => {
  assert.equal(normalizeDate('20260917 11:00'), '2026-09-17');
  assert.equal(normalizeDate('2026-09-17'), '2026-09-17');
  assert.equal(normalizeDate(' 2026.09.18 '), '2026-09-18');
  assert.equal(normalizeDate('미정'), '미정');
});
