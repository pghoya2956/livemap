// 미리보기 카드용 가상 제품 자료(캠핑장 예약 서비스 "캠프노트"). 실제 프로젝트 자료가 아니다.
const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.UTC(2026, 8, 4 + i)); return d.toISOString().slice(0, 10); });
const s = (xs: number[]) => xs;
const screen = (title: string, accent: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><rect width="640" height="320" fill="#f4f1ea"/><rect width="640" height="40" fill="#ffffff"/><rect x="20" y="14" width="90" height="12" rx="6" fill="${accent}"/><rect x="470" y="14" width="150" height="12" rx="6" fill="#d9d4c7"/><rect x="20" y="64" width="380" height="200" rx="14" fill="${accent}" opacity=".85"/><rect x="420" y="64" width="200" height="60" rx="10" fill="#fff"/><rect x="420" y="134" width="200" height="60" rx="10" fill="#fff"/><rect x="420" y="204" width="200" height="60" rx="10" fill="#fff"/><rect x="20" y="284" width="600" height="14" rx="7" fill="#e6e1d6"/></svg>`);

const step = (label: string, status: 'live' | 'mock' | 'planned' | 'next', hits = 0) => ({ label, status, hits });
const counts = (st: { status: string }[]) => ({ live: st.filter((x) => x.status === 'live').length, mock: st.filter((x) => x.status === 'mock').length, planned: st.filter((x) => x.status === 'planned').length, next: st.filter((x) => x.status === 'next').length });
const journey = (id: string, title: string, actor: string, lane: string, goal: string, steps: ReturnType<typeof step>[], series: number[], milestone: { title: string; status: string } | null = null) => {
  const c = counts(steps);
  const status = c.live === steps.length ? 'live' : c.live === 0 && c.mock === 0 ? 'next' : 'mock';
  const commits = series.reduce((a, b) => a + b, 0);
  return { id, title, actor, lane, goal, status: status as 'live' | 'mock' | 'next', counts: c, steps, warnings: 0, milestone, series, commits, week: series.slice(7).reduce((a, b) => a + b, 0), prevWeek: series.slice(0, 7).reduce((a, b) => a + b, 0) };
};

export const journeys = [
  journey('find', '캠핑장 찾기와 사이트 고르기', '캠퍼', '캠퍼 여정', '원하는 날짜에 비어 있는 사이트를 바로 찾는다', [step('홈', 'live', 6), step('지역·날짜 검색', 'live', 9), step('캠핑장 목록', 'live', 5), step('사이트 배치도', 'live', 11)], s([0, 0, 1, 0, 2, 3, 1, 0, 4, 2, 5, 3, 2, 1])),
  journey('book', '예약부터 결제까지', '캠퍼', '캠퍼 여정', '사이트를 잡고 결제까지 한 번에 끝낸다', [step('옵션 선택', 'live', 8), step('동반자 입력', 'live', 4), step('결제', 'live', 12), step('예약 확인', 'live', 7), step('예약 변경', 'live', 3)], s([0, 1, 0, 2, 4, 2, 3, 5, 6, 3, 8, 4, 2, 3])),
  journey('review', '이용 후기', '캠퍼', '캠퍼 여정', '다녀온 캠핑장을 평가하고 사진을 남긴다', [step('후기 작성', 'mock', 3), step('사진 올리기', 'mock', 2), step('후기 목록', 'mock', 1)], s([0, 0, 0, 0, 0, 0, 1, 0, 2, 1, 0, 1, 0, 0]), { title: '후기와 평판', status: '다음' }),
  journey('refund', '취소와 환불', '캠퍼', '캠퍼 여정', '규정에 맞게 취소하고 환불 금액을 바로 안다', [step('취소 요청', 'next'), step('환불 계산', 'next'), step('환불 완료', 'next')], s(new Array(14).fill(0)), { title: '후기와 평판', status: '다음' }),
  journey('ops', '캠핑장 운영 하루', '캠핑장 직원', '캠핑장 운영', '오늘 들어오고 나가는 사이트를 한 화면에서 처리한다', [step('오늘 입실', 'live', 7), step('사이트 현황', 'live', 5), step('정산', 'live', 4)], s([0, 0, 1, 1, 0, 2, 3, 1, 2, 4, 3, 2, 1, 2])),
  journey('notify', '알림', '캠퍼', '공통', '예약 변경과 입실 안내를 놓치지 않는다', [step('알림 목록', 'mock', 2), step('알림 설정', 'mock', 1)], s([0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 2, 0, 1, 0]), { title: '후기와 평판', status: '다음' }),
  journey('admin', '입점 관리', '플랫폼 관리자', '관리', '새 캠핑장을 심사하고 등록한다', [step('입점 신청', 'live', 2), step('심사', 'mock', 1)], s([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1])),
];

const total = days.map((_, i) => journeys.reduce((a, j) => a + j.series[i], 0) + [1, 0, 2, 1, 3, 2, 4, 3, 6, 5, 9, 6, 4, 5][i]);
export const activity = { days, total, runtime: total.map((n) => Math.round(n * 0.4)), deploy: total.map((n) => Math.round(n * 0.25)), docs: total.map((n) => Math.round(n * 0.3)), sum: total.reduce((a, b) => a + b, 0), runtimeSum: total.reduce((a, n) => a + Math.round(n * 0.4), 0) };

const sc = (live = 0, mock = 0, planned = 0, next = 0) => ({ live, mock, planned, next });
export const roadmap = [
  { title: '검색과 사이트 배치도', status: '완료', mode: '바로 구현', goal: '', waitingOn: '', sceneCounts: sc(4) },
  { title: '결제 연동', status: '완료', mode: '스펙 주도', goal: '', waitingOn: '', sceneCounts: sc(3) },
  { title: '운영 오늘 화면', status: '완료', mode: '바로 구현', goal: '', waitingOn: '', sceneCounts: sc(3) },
  { title: '예약 변경', status: '진행', mode: '스펙 주도', goal: '입실 전까지 날짜와 인원을 바꾸고 차액을 자동으로 정산한다.', waitingOn: '', sceneCounts: sc(1) },
  { title: '후기와 평판', status: '다음', mode: '스펙 주도', goal: '', waitingOn: '후기 노출 기준(검수 후 공개 또는 즉시 공개) 결정', sceneCounts: sc(0, 5, 0, 3) },
];
export const tasks = [{ title: '예약 변경 차액 정산', stage: '실행', done: 12, open: 9 }];
export const generatedAt = '2026-09-17T08:30:00.000Z';
export const changes = [
  { date: '2026-09-17T08:12:00.000Z', tag: '기능', subject: '예약 변경 화면에서 차액을 미리 보여준다', journeys: ['예약부터 결제까지'] },
  { date: '2026-09-17T07:40:00.000Z', tag: '배포', subject: '웹 이미지 3f2a 자동 갱신', journeys: [] },
  { date: '2026-09-17T05:05:00.000Z', tag: '수정', subject: '사이트 배치도에서 마감된 구역을 흐리게 표시', journeys: ['캠핑장 찾기와 사이트 고르기'] },
  { date: '2026-09-16T23:20:00.000Z', tag: '화면', subject: '운영 오늘 화면 입실 카드 간격 정리', journeys: ['캠핑장 운영 하루'] },
  { date: '2026-09-16T14:00:00.000Z', tag: '문서', subject: '후기 노출 기준 두 안 비교 기록', journeys: ['이용 후기'] },
  { date: '2026-09-16T10:30:00.000Z', tag: '기능', subject: '입점 신청서 제출과 서류 업로드', journeys: ['입점 관리'] },
] as const;
export const captures = [
  { src: screen('사이트 배치도', '#2f6f4e'), journey: '캠핑장 찾기와 사이트 고르기', step: '사이트 배치도' },
  { src: screen('결제', '#3b5b8a'), journey: '예약부터 결제까지', step: '결제' },
  { src: screen('오늘 입실', '#8a5a2b'), journey: '캠핑장 운영 하루', step: '오늘 입실' },
];
export const links = [{ a: 'find', b: 'book', n: 9 }, { a: 'book', b: 'ops', n: 6 }, { a: 'book', b: 'notify', n: 3 }, { a: 'find', b: 'review', n: 2 }, { a: 'ops', b: 'admin', n: 2 }];
const stepsAll = journeys.flatMap((j) => j.steps);
export const steps = counts(stepsAll);
export const project = { name: 'CampNote', tagline: '캠핑장 예약·운영', host: 'https://campnote.example' };
export const signals = { deploy: 'ok' as const, deployBehind: 0, warnings: 0 };
export const data = {
  generatedAt, project, signals, steps, stepsTotal: stepsAll.length,
  journeysLive: journeys.filter((j) => j.status === 'live').length, journeysTotal: journeys.length,
  roadmap, tasks, size: { screens: 24, screensLive: 17, apis: 31, functions: 22, tables: 14, tests: 96, e2e: 12, decisions: 6, oq: 4, commits: activity.sum },
  activity, links, journeys, changes: [...changes], captures,
};
