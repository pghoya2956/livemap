// 미리보기 카드용 가상 제품 자료(캠핑장 예약 서비스 "캠프노트"). 실제 프로젝트 자료가 아니다.
// 모양은 livemap 1.1.0 overview.json(1.0.1 필드 + 「데이터 모델」 추가 필드)에 1.2.0 counts.openQuestions·counts.reading을 더했다.
// 캡처는 같은 출처 파일 대신 data: 그림(src)을 쓴다. 열린 질문은 완료 작업에 닫히지 않은 질문이 있어 부분(partial)이다.
import type { OverviewData, Journey, StepStatus, RoadmapItem, Milestone } from '@pghoya2956/livemap-ui';

export const generatedAt = '2026-09-17T08:30:00.000Z';
const days = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 8, 4 + i)).toISOString().slice(0, 10));
const screen = (accent: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><rect width="640" height="320" fill="#f4f1ea"/><rect width="640" height="40" fill="#ffffff"/><rect x="20" y="14" width="90" height="12" rx="6" fill="${accent}"/><rect x="470" y="14" width="150" height="12" rx="6" fill="#d9d4c7"/><rect x="20" y="64" width="380" height="200" rx="14" fill="${accent}" opacity=".85"/><rect x="420" y="64" width="200" height="60" rx="10" fill="#fff"/><rect x="420" y="134" width="200" height="60" rx="10" fill="#fff"/><rect x="420" y="204" width="200" height="60" rx="10" fill="#fff"/><rect x="20" y="284" width="600" height="14" rx="7" fill="#e6e1d6"/></svg>`);

const step = (id: string, label: string, status: StepStatus, hits = 0, warn = false) => ({ id, label, status, grade: 'B', warn, hits });
type S = ReturnType<typeof step>;
const count = (st: { status: string }[]) => ({ live: st.filter((x) => x.status === 'live').length, mock: st.filter((x) => x.status === 'mock').length, planned: st.filter((x) => x.status === 'planned').length, next: st.filter((x) => x.status === 'next').length });
const RANK: Record<string, number> = { live: 0, mock: 2, planned: 3, next: 4 };
const ref = (id: string, title: string, status: string) => ({ id, title, status });
const journey = (id: string, title: string, actor: string, lane: string, goal: string, steps: S[], series: number[],
  roadmapItem: Journey['roadmapItem'] = null, milestone: Journey['milestone'] = null): Journey => {
  const c = count(steps);
  const status = c.live === steps.length ? 'live' : c.live > 0 ? 'partial' : [...steps].sort((a, b) => RANK[a.status] - RANK[b.status])[0].status;
  return { id, title, actor, lane, status, warnings: steps.filter((s) => s.warn).length, goal, counts: c, roadmapItem, milestone, steps, series,
    commits: series.reduce((a, b) => a + b, 0), week: series.slice(7).reduce((a, b) => a + b, 0) };
};
const reviews = ref('reviews', '후기와 평판', '다음'), change = ref('booking-change', '예약 변경', '진행');
const msTrust = ref('trust', '믿고 고르는 캠핑장', '다음'), msOps = ref('ops-2', '운영 2차', '진행');

export const journeys: Journey[] = [
  journey('find', '캠핑장 찾기와 사이트 고르기', '캠퍼', '캠퍼 여정', '원하는 날짜에 비어 있는 사이트를 바로 찾는다',
    [step('home', '홈', 'live', 6), step('search', '지역·날짜 검색', 'live', 9), step('list', '캠핑장 목록', 'live', 5), step('sitemap', '사이트 배치도', 'live', 11)], [0, 0, 1, 0, 2, 3, 1, 0, 4, 2, 5, 3, 2, 1]),
  journey('book', '예약부터 결제까지', '캠퍼', '캠퍼 여정', '사이트를 잡고 결제까지 한 번에 끝낸다',
    [step('option', '옵션 선택', 'live', 8), step('party', '동반자 입력', 'live', 4), step('pay', '결제', 'live', 12), step('confirm', '예약 확인', 'live', 7), step('change', '예약 변경', 'mock', 3)], [0, 1, 0, 2, 4, 2, 3, 5, 6, 3, 8, 4, 2, 3], change, msOps),
  journey('review', '이용 후기', '캠퍼', '캠퍼 여정', '다녀온 캠핑장을 평가하고 사진을 남긴다',
    [step('write', '후기 작성', 'mock', 3), step('photo', '사진 올리기', 'mock', 2, true), step('reviews', '후기 목록', 'planned', 1)], [0, 0, 0, 0, 0, 0, 1, 0, 2, 1, 0, 1, 0, 0], reviews, msTrust),
  journey('refund', '취소와 환불', '캠퍼', '캠퍼 여정', '규정에 맞게 취소하고 환불 금액을 바로 안다',
    [step('cancel', '취소 요청', 'next'), step('calc', '환불 계산', 'next'), step('done', '환불 완료', 'next')], new Array(14).fill(0), reviews, msTrust),
  journey('ops', '캠핑장 운영 하루', '캠핑장 직원', '캠핑장 운영', '오늘 들어오고 나가는 사이트를 한 화면에서 처리한다',
    [step('today', '오늘 입실', 'live', 7), step('sites', '사이트 현황', 'live', 5), step('settle', '정산', 'live', 4)], [0, 0, 1, 1, 0, 2, 3, 1, 2, 4, 3, 2, 1, 2]),
  journey('notify', '알림', '캠퍼', '공통', '예약 변경과 입실 안내를 놓치지 않는다',
    [step('inbox', '알림 목록', 'mock', 2), step('prefs', '알림 설정', 'mock', 1)], [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 2, 0, 1, 0], change, msOps),
  journey('admin', '입점 관리', '플랫폼 관리자', '관리', '새 캠핑장을 심사하고 등록한다',
    [step('apply', '입점 신청', 'live', 2), step('audit', '심사', 'mock', 1)], [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
];

const bots = [0, 0, 1, 0, 2, 1, 0, 1, 2, 1, 3, 2, 1, 1];
const commitsByDay = days.map((_, i) => journeys.reduce((a, j) => a + j.series[i], 0) + [1, 0, 2, 1, 3, 2, 4, 3, 6, 5, 9, 6, 4, 5][i]);
export const activity: OverviewData['activity'] = {
  sinceDays: 14,
  days: days.map((date, i) => ({ date, commits: commitsByDay[i], runtime: Math.round(commitsByDay[i] * 0.4), bots: bots[i] })),
  total: commitsByDay.reduce((a, b) => a + b, 0), runtime: commitsByDay.reduce((a, n) => a + Math.round(n * 0.4), 0), bots: bots.reduce((a, b) => a + b, 0),
};

const sc = (live = 0, mock = 0, planned = 0, next = 0) => ({ live, mock, planned, next });
const item = (o: Partial<RoadmapItem> & Pick<RoadmapItem, 'id' | 'order' | 'title' | 'status'>): RoadmapItem => ({
  mode: '스펙 주도', milestone: null, goal: '', waitingOn: '', waitingWho: null, waitingWhat: '', waitingSince: null, completedAt: null, sceneCounts: sc(), tasks: [], blockedBy: [], ...o });
export const roadmapItems: RoadmapItem[] = [
  item({ id: 'search', order: 1, title: '검색과 사이트 배치도', status: '완료', mode: '바로 구현', milestone: 'ops-1', completedAt: '2026-09-05T06:10:00.000Z' }),
  item({ id: 'payment', order: 2, title: '결제 연동', status: '완료', milestone: 'ops-1', completedAt: '2026-09-11T09:40:00.000Z' }),
  item({ id: 'ops-today', order: 3, title: '운영 오늘 화면', status: '완료', mode: '바로 구현', milestone: 'ops-1', completedAt: '2026-09-14T02:20:00.000Z' }),
  item({ id: 'booking-change', order: 4, title: '예약 변경', status: '진행', milestone: 'ops-2', goal: '입실 전까지 날짜와 인원을 바꾸고 차액을 자동으로 정산한다.',
    sceneCounts: sc(0, 3), tasks: [{ name: '20260915-booking-change', title: '예약 변경 차액 정산', stage: '실행', status: '진행', pnDone: 12, pnOpen: 9 }] }),
  item({ id: 'notify-center', order: 5, title: '알림 모아 보기', status: '다음', milestone: 'ops-2', sceneCounts: sc(0, 2) }),
  item({ id: 'reviews', order: 6, title: '후기와 평판', status: '다음', milestone: 'trust', waitingOn: '운영팀: 후기 노출 기준(검수 후 공개 또는 즉시 공개) 결정',
    waitingWho: '운영팀', waitingWhat: '후기 노출 기준(검수 후 공개 또는 즉시 공개) 결정', waitingSince: '2026-09-15T01:00:00.000Z', sceneCounts: sc(0, 2, 1, 3), blockedBy: ['waiting'] }),
];
export const milestones: Milestone[] = [
  { id: 'ops-1', order: 0, title: '운영 1차', status: '완료', goal: '', completedOn: '2026-09-14', targetOn: null, waitingWho: null, waitingWhat: '', waitingSince: null,
    items: ['search', 'payment', 'ops-today'], steps: { live: 10, total: 10 }, plans: { done: 0, total: 0 }, blocked: false },
  { id: 'ops-2', order: 1, title: '운영 2차', status: '진행', goal: '예약 뒤 바뀌는 일정과 알림을 캠퍼와 직원이 같은 화면에서 본다.', completedOn: null, targetOn: '2026-09-30',
    waitingWho: null, waitingWhat: '', waitingSince: null, items: ['booking-change', 'notify-center'], steps: { live: 0, total: 3 }, plans: { done: 12, total: 21 }, blocked: false },
  { id: 'trust', order: 2, title: '믿고 고르는 캠핑장', status: '다음', goal: '후기와 환불 규정으로 처음 온 캠퍼도 안심하고 예약한다.', completedOn: null, targetOn: null,
    waitingWho: null, waitingWhat: '', waitingSince: null, items: ['reviews'], steps: { live: 0, total: 6 }, plans: { done: 0, total: 0 }, blocked: true },
];

export const changes: OverviewData['changes'] = [
  { date: '2026-09-17T08:12:00.000Z', kind: '기능', subject: '예약 변경 화면에서 차액을 미리 보여준다', journeys: ['예약부터 결제까지'], journeysMore: 0 },
  { date: '2026-09-17T05:05:00.000Z', kind: '수정', subject: '사이트 배치도에서 마감된 구역을 흐리게 표시', journeys: ['캠핑장 찾기와 사이트 고르기'], journeysMore: 0 },
  { date: '2026-09-16T23:20:00.000Z', kind: '정리', subject: '운영 오늘 화면 입실 카드 간격 정리', journeys: ['캠핑장 운영 하루'], journeysMore: 0 },
  { date: '2026-09-16T14:00:00.000Z', kind: '문서', subject: '후기 노출 기준 두 안 비교 기록', journeys: ['이용 후기', '취소와 환불', '알림'], journeysMore: 1 },
  { date: '2026-09-16T10:30:00.000Z', kind: '기능', subject: '입점 신청서 제출과 서류 업로드', journeys: ['입점 관리'], journeysMore: 0 },
  { date: '2026-09-16T02:10:00.000Z', kind: '운영', subject: '야간 백업 주기 조정', journeys: [], journeysMore: 0 },
];
export const captures: OverviewData['captures'] = [
  { file: 'sitemap.jpg', journey: 'find', step: 'sitemap', src: screen('#2f6f4e') },
  { file: 'pay.jpg', journey: 'book', step: 'pay', src: screen('#3b5b8a') },
  { file: 'today.jpg', journey: 'ops', step: 'today', src: screen('#8a5a2b') },
];
export const links: OverviewData['links'] = [{ a: 'find', b: 'book', n: 9 }, { a: 'book', b: 'ops', n: 6 }, { a: 'book', b: 'notify', n: 3 }, { a: 'find', b: 'review', n: 2 }, { a: 'ops', b: 'admin', n: 2 }];
export const steps = count(journeys.flatMap((j) => j.steps));
export const project = { name: 'CampNote', tagline: '캠핑장 예약·운영', host: 'https://campnote.example' };
export const signals: OverviewData['signals'] = { deploy: 'behind', deployBehind: 3, tests: 'ok', lastRun: null, adapters: 'ok', adapterNotes: [], warnings: 1, orphans: 0, gated: 0, deployBehindAll: 3 };
export const quietSignals: OverviewData['signals'] = { ...signals, deploy: 'ok', deployBehind: 0, warnings: 0, deployBehindAll: 0 };
const stepsTotal = steps.live + steps.mock + steps.planned + steps.next;

/** 마일스톤이 있는 프로젝트 */
export const data: OverviewData = {
  generatedAt, project, signals, headDate: '2026-09-17', line: '', running: [], roadmap: [], roadmapDone: 3, roadmapTotal: roadmapItems.length, waiting: [], tasks: [], areas: [], recent: [], openQuestions: [],
  counts: { stepsLive: steps.live, stepsTotal, screensLive: 17, screensFixed: 0, screens: 24, apis: 31, functions: 22, tests: 96, pnDone: 40, pnTotal: 61, oq: 4, openQuestions: 2, decisions: 6, proposed: 1,
    reading: { plans: 'rule', openQuestions: 'partial', tests: 'observed', grades: 'rule' },
    steps, journeys: journeys.length, journeysLive: journeys.filter((j) => j.status === 'live').length, tasksRunning: 1 },
  journeys, roadmapItems, milestones, currentMilestone: 'ops-2', activity, changes, links, captures,
};
/** 마일스톤 없이 로드맵 항목만 있는 프로젝트 */
export const roadmapOnly: OverviewData = {
  ...data, signals: quietSignals, milestones: [], currentMilestone: null,
  roadmapItems: roadmapItems.map((r) => ({ ...r, milestone: null })),
  journeys: journeys.map((j) => ({ ...j, milestone: null })),
};
