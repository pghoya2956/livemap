// 문구 정리 함수 검사: plain·splitWaiting(SC-11 결정 대기 주체)·subjectPlain·변경 종류. 개요에 식별자가 새지 않게 하는 한 곳이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, splitWaiting, subjectPlain, changeKind } from '../src/derive.mjs';

test('plain: 없음은 빈 문자열, 링크 글자, 강조·백틱 제거, 공백 정리, 코드 포인트 n자 말줄임', () => {
  assert.equal(plain(undefined), '');
  assert.equal(plain(null), '');
  assert.equal(plain('  [문서](docs/a.md) 의 **굵게** `코드`\n  줄  '), '문서 의 굵게 코드 줄');
  assert.equal(plain('가나다라마', 5), '가나다라마');
  assert.equal(plain('가나다라마바', 5), '가나다라…');
  assert.equal(plain('😀😀😀😀', 3), '😀😀…');
});

test('SC-11 splitWaiting: 주체·질문 나누기와 주체로 읽지 않는 경우', () => {
  assert.deepEqual(splitWaiting('사용자: 범위를 고른다'), { who: '사용자', what: '범위를 고른다' });
  assert.deepEqual(splitWaiting('운영팀： 전각 콜론'), { who: '운영팀', what: '전각 콜론' });
  assert.deepEqual(splitWaiting('가'.repeat(20) + ': 스무 자 주체'), { who: '가'.repeat(20), what: '스무 자 주체' });
  assert.deepEqual(splitWaiting('가'.repeat(21) + ': 스물한 자'), { who: null, what: '가'.repeat(21) + ': 스물한 자' });
  assert.deepEqual(splitWaiting('https://example.org 확인'), { who: null, what: 'https://example.org 확인' });
  assert.deepEqual(splitWaiting('10:30 회의'), { who: null, what: '10:30 회의' });
  assert.deepEqual(splitWaiting('알림·결제 중 다음 범위'), { who: null, what: '알림·결제 중 다음 범위' });
  assert.deepEqual(splitWaiting(''), { who: null, what: '' });
  assert.deepEqual(splitWaiting(undefined), { who: null, what: '' });
});

test('subjectPlain: 관례 접두어·[skip ci]·16진수·내부 ID·경로 낱말 제거, 괄호·끝 기호 정리', () => {
  assert.equal(subjectPlain('feat(ui)!: 화면 추가'), '화면 추가');
  assert.equal(subjectPlain('chore: 버전 올림 [skip ci]'), '버전 올림');
  assert.equal(subjectPlain('fix: 되돌림 [ci skip] 0123abc'), '되돌림');
  assert.equal(subjectPlain(`fix: 되돌림 ${'a1'.repeat(20)}`), '되돌림');
  assert.equal(subjectPlain('docs: PN-15·17·18 반영'), '반영');
  assert.equal(subjectPlain('docs: 실행 기록(PN-31 2단계)'), '실행 기록(2단계)');
  assert.equal(subjectPlain('docs: final(OQ-3, 잔여)'), 'final(잔여)');
  assert.equal(subjectPlain('docs: journeys 갈래 PN-56 반영 완료 기록'), 'journeys 갈래 반영 완료 기록');
  assert.equal(subjectPlain('docs: 스펙 OQ 병합 세부 반영'), '스펙 병합 세부 반영');
  assert.equal(subjectPlain('docs: Q14 답 반영'), '답 반영');
  assert.equal(subjectPlain('feat: /api/x 호출 추가'), '호출 추가');
  assert.equal(subjectPlain('fix: a.mjs 와 web/src/App.tsx 고침'), '와 고침');
  assert.equal(subjectPlain('docs: 정리 —'), '정리');
  assert.equal(subjectPlain('docs: 정리 - '), '정리');
});

test('subjectPlain: 2자 미만이면 "{종류} 변경", n자 자르기', () => {
  assert.equal(subjectPlain('deploy: 45cb747'), '운영 변경');
  assert.equal(subjectPlain('docs: PN-12'), '문서 변경');
  assert.equal(subjectPlain('45cb747'), '변경 변경');
  const long = subjectPlain(`feat: ${'가'.repeat(80)}`, 70);
  assert.equal([...long].length, 70);
  assert.ok(long.endsWith('…'));
});

test('변경 종류: 관례 접두어 표 전부, 접두어 없으면 변경', () => {
  const table = { feat: '기능', fix: '수정', docs: '문서', test: '검사', refactor: '정리', perf: '정리', style: '정리', build: '운영', ci: '운영', chore: '운영', deploy: '운영', release: '운영' };
  for (const [prefix, kind] of Object.entries(table)) {
    assert.equal(changeKind(`${prefix}: 제목`), kind, prefix);
    assert.equal(changeKind(`${prefix}(범위)!: 제목`), kind, prefix);
  }
  assert.equal(changeKind('Feat: 대문자'), '기능');
  assert.equal(changeKind('wip: 모르는 접두어'), '변경');
  assert.equal(changeKind('접두어 없는 제목'), '변경');
  assert.equal(changeKind('feature 추가'), '변경');
});
