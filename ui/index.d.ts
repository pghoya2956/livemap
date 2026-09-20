// livemap 모니터 화면 컴포넌트 타입. 자료 모양은 livemap 1.1.0 overview.json(OverviewData)이다.
// 1.0.1 필드는 그대로 두고 1.1.0 필드와 1.2.0 counts.openQuestions·counts.reading을 더한 모양이다(스펙 「데이터 모델」). 컴포넌트 props를 바꾸면 같이 고친다.
import type { ReactNode, ReactElement } from 'react';

/** 단계 상태: live 실제 데이터로 동작, mock 화면만 있음, planned 스펙만 있음, next 스펙 전 구상. */
export type StepStatus = 'live' | 'mock' | 'planned' | 'next';
/** 기능 상태: 단계 상태에 partial(일부 단계만 동작)을 더한다. */
export type JourneyStatus = StepStatus | 'partial';
/** 로드맵 항목·마일스톤 상태 */
export type RoadmapStatus = '완료' | '진행' | '다음' | '대기' | '이후';
/** 변경 종류(커밋 제목 관례 접두어로 정한다) */
export type ChangeKind = '기능' | '수정' | '문서' | '검사' | '정리' | '운영' | '변경';
export interface StatusCounts { live: number; mock: number; planned: number; next: number }

export interface JourneyStep { id: string; label: string; status: StepStatus; grade: string; warn: boolean; /** 14일 사람 커밋 중 이 단계에 닿은 수 */ hits: number }
export interface Ref { id: string; title: string; status: string }
export interface Journey {
  id: string; title: string; actor: string; lane: string; status: JourneyStatus; warnings: number;
  goal: string; counts: StatusCounts; steps: JourneyStep[];
  /** 이 기능 단계를 가리키는 비완료 로드맵 항목 중 가장 앞선 것 */
  roadmapItem: Ref | null; milestone: Ref | null;
  /** 14일 사람 커밋: 전체, 마지막 7일, 날짜별 14개 */
  commits: number; week: number; series: number[];
}
export interface TaskRef { name: string; title: string; stage: string; status: string; pnDone: number; pnOpen: number }
export interface RoadmapItem {
  id: string; order: number; title: string; status: RoadmapStatus; mode: string; milestone: string | null; goal: string;
  waitingOn: string; waitingWho: string | null; waitingWhat: string; waitingSince: string | null; completedAt: string | null;
  sceneCounts: StatusCounts; tasks: TaskRef[]; blockedBy: ('waiting' | 'deps' | 'task')[];
}
export interface Milestone {
  id: string; order: number; title: string; status: RoadmapStatus; goal: string;
  /** YYYY-MM-DD */ completedOn: string | null; targetOn: string | null;
  waitingWho: string | null; waitingWhat: string; waitingSince: string | null;
  items: string[]; steps: { live: number; total: number }; plans: { done: number; total: number }; blocked: boolean;
}
export interface Activity { sinceDays: number; days: { date: string; commits: number; runtime: number; bots: number }[]; total: number; runtime: number; bots: number }
export interface Change { /** UTC ISO */ date: string; kind: ChangeKind; subject: string; /** 닿은 기능 제목 최대 3 */ journeys: string[]; journeysMore: number }
/** 캡처. journey·step은 id다. src는 미리보기용 직접 주소(없으면 base + file). */
export interface Capture { file: string; journey: string; step: string; src?: string }
export interface Link { a: string; b: string; n: number }
export interface Project { name: string; tagline?: string; host?: string }
export interface Signals {
  deploy: 'ok' | 'behind' | 'unknown'; deployBehind: number; deployBehindAll: number | null; warnings: number;
  tests: 'ok' | 'stale' | 'fail' | 'none'; lastRun: { failures: number; total: number; at: string; fresh: boolean } | null;
  adapters: 'ok' | 'partial' | 'fail'; adapterNotes: string[]; orphans: number; gated: number;
  /** 선언한 경계를 넘은 호출 수(2.1.0). 구조 절이 없는 프로젝트는 null 이고 그때 개요는 그 줄을 빼고 그린다 */
  boundaryViolations?: number | null;
}
/**
 * 읽기 상태(1.2.0): observed 구조화된 출력에서 읽음, rule 규칙으로 다 읽음, judged 판정 파일이 채움,
 * partial 안 읽힌 줄이나 확인이 필요한 행이 있음, stale 판정 근거나 검사 결과가 낡음, unknown 소스 없음·형식 밖, none 대상 없음.
 * partial·stale·unknown이면 화면은 값 뒤 "?"와 이유 분류를 보인다.
 */
export type ReadingState = 'observed' | 'rule' | 'judged' | 'partial' | 'stale' | 'unknown' | 'none';
/** 개요 수치의 읽기 상태(경로·파일명 없음): 계획 항목 합계, 열린 질문, 검사 개수, 확인 등급 */
export interface CountsReading { plans: ReadingState; openQuestions: ReadingState; tests: ReadingState; grades: ReadingState }
export interface Counts extends Record<string, unknown> {
  screensLive: number; screens: number; apis: number; functions: number; tests: number; decisions: number;
  /** 1.1.1 작업 표 행 수 합(2.0.0 삭제 후보). 화면은 openQuestions가 있으면 그것을 쓴다. */
  oq: number;
  /** 1.2.0 답이 없는 잔여 질문 수(DEC-12) */
  openQuestions?: number;
  /** 1.2.0 읽기 상태. 없으면 1.1.1 생성물이라 "?"를 붙이지 않는다. */
  reading?: CountsReading;
  steps: StatusCounts; journeys: number; journeysLive: number; tasksRunning: number;
}
export interface OverviewData {
  generatedAt: string; project: Project; signals: Signals; counts: Counts;
  journeys: Journey[]; roadmapItems: RoadmapItem[]; milestones: Milestone[]; currentMilestone: string | null;
  activity: Activity; changes: Change[]; links: Link[]; captures: Capture[];
  /** 1.0.1 필드(화면은 쓰지 않지만 생성물에 남는다) */
  headDate?: string; line?: string; running?: unknown[]; roadmap?: unknown[]; roadmapDone?: number; roadmapTotal?: number;
  waiting?: unknown[]; tasks?: unknown; areas?: unknown[]; recent?: unknown[]; openQuestions?: unknown;
}
/** value는 읽기 상태가 부분이면 "48/61?", 낡음·모름이면 "?"이고 extra에 이유 분류(예: "판정 필요")가 온다. */
export interface TickerItem { label: string; value: string | number; extra?: string; /** 이름이 프로젝트 문구(기능 제목)인지 */ project?: boolean }

export interface PanelProps {
  /** 머리줄 왼쪽 15px 선 아이콘. Icons의 값을 쓴다. */
  icon?: ReactNode; title: string; sub?: ReactNode;
  /** 오른쪽 기준 시각 문구, 예: "02:29 기준" */
  at?: string; badge?: ReactNode; children?: ReactNode; className?: string;
  /** 머리줄 "외 {n} →" 링크 */
  more?: { n: number; href: string } | null;
  /** 예산 표식: list(목록 패널), matrix(기능 지도) */
  budget?: 'list' | 'matrix';
}
/** 다크 모니터 패널 틀. 머리줄(아이콘·제목·보조 문구·기준 시각·외 n)과 본문. 본문 여백은 자식에 `pb` 클래스를 준다. */
export declare function Panel(props: PanelProps): ReactElement;

export interface ChipProps { on?: boolean; count?: ReactNode; onClick?: () => void; /** chip 뒤에 붙는 추가 class(2.1.0). 같은 모양의 칩을 골라 잡을 때 쓴다 */ className?: string; children?: ReactNode }
/** 칩. onClick이 있으면 aria-pressed 버튼, on이면 청록 강조. */
export declare function Chip(props: ChipProps): ReactElement;

export interface TagProps {
  /** live·mock·planned·next, 로드맵 상태(완료·진행·다음·대기·이후), 변경 종류(기능·수정·문서·검사·정리·운영·변경) */
  kind: string; children?: ReactNode;
}
/** 짧은 상태 태그. 글자가 있어 색만으로 구분하지 않는다. */
export declare function Tag(props: TagProps): ReactElement;

export interface PillProps { tone?: 'good' | 'warn' | 'plain'; href?: string; className?: string; children?: ReactNode }
/** 상단 바 상태 알약. href가 있으면 새 탭 링크. */
export declare function Pill(props: PillProps): ReactElement;

export interface DotProps { color?: string; pulse?: boolean }
/** 7px 색 점. pulse면 맥박 애니메이션. */
export declare function Dot(props: DotProps): ReactElement;

export interface StepMarkProps { status: StepStatus | 'partial'; size?: number }
/** 단계 상태 모양 표식(기본 12px): 동작 채운 원, 목업 반 채움+실선, 계획 실선 빈 원, 구상 점선 빈 원, partial 초록 반 채움. */
export declare function StepMark(props: StepMarkProps): ReactElement;

export interface GaugeProps { /** 0~100 */ value: number; caption: string }
/** 270도 원호 계기. 가운데 큰 백분율. */
export declare function Gauge(props: GaugeProps): ReactElement;

export interface StatusBarProps { counts: StatusCounts }
/** 상태별 개수를 동작·목업·계획·구상 색 구간으로 이은 6px 막대. */
export declare function StatusBar(props: StatusBarProps): ReactElement;

export interface SparklineProps { series: number[]; color?: string; width?: number; height?: number }
/** 작은 꺾은선과 마지막 값 점. 활동 계열은 청록, 커밋 0이면 --line2. */
export declare function Sparkline(props: SparklineProps): ReactElement;

export interface AreaChartProps { series: number[]; compare?: number[]; /** YYYY-MM-DD */ days: string[]; compareLabel?: string }
/** 청록 영역 차트. compare를 점선으로 겹치고 아래에 첫날·마지막 날 축. */
export declare function AreaChart(props: AreaChartProps): ReactElement;

export interface FeatureMapProps {
  /** 지도에 올릴 기능(최대 12). 13개 이상이면 mapJourneys 결과의 shown을 넘긴다. */
  journeys: Journey[]; links?: Link[]; selected?: string; onSelect?: (id: string) => void; stepCounts?: StatusCounts;
  /** 배지 개수를 셀 전체 기능(기본 journeys) */
  badgeJourneys?: Journey[];
  /** 지도에 올리지 못한 기능 수와 그중 미완성이 있는지(바닥 칩 "완성 기능 n 접힘"·"외 n") */
  folded?: number; foldedIncomplete?: boolean;
  /** 오른쪽 아래 다음 안내(#/roadmap/<id> 링크) */
  next?: Pick<RoadmapItem, 'id' | 'title' | 'waitingOn' | 'waitingWho'> | null;
}
/** 기능 지도. 레인별 구역에 기능 허브와 단계 표식 경로, 말줄임 HTML 라벨, 함께 바뀐 기능 연결선, 레이어 토글. 부모 높이를 채운다. */
export declare function FeatureMap(props: FeatureMapProps): ReactElement;

export interface TopBarProps { project: Project; signals: Pick<Signals, 'deploy' | 'deployBehind' | 'warnings'>; generatedAt: string; /** 선택 내비 순번(0 개요 · 1 기능 · 2 구조 · 3 로드맵 · 4 작업 · 5 더보기, -1이면 선택 없음). 2.1.0 에서 「구조」가 2번 자리에 들어가 뒤가 한 칸씩 밀렸다 */ current?: number }
/** 상단 바: 브랜드, 내비 5, 배포·경고·신선도·제품 주소 알약, 시계. 1279px 이하 두 줄. */
export declare function TopBar(props: TopBarProps): ReactElement;

export interface TickerProps { items: TickerItem[] }
/** 가로로 흐르는 수치 전광판과 정지·재생 버튼. 마우스를 올리면 멈춘다. 복제 사본은 aria-hidden. */
export declare function Ticker(props: TickerProps): ReactElement;

export interface MilestonePanelProps {
  roadmapItems: RoadmapItem[]; milestones: Milestone[]; currentMilestone: string | null; generatedAt: string;
  /** 로드맵이 없을 때 "진행 중인 작업 n →" */
  tasksRunning?: number; at?: string;
}
/** 마일스톤 패널: 현재 마일스톤 머리 카드와 항목·뒤 마일스톤·완료 접은 행. 마일스톤이 없으면 로드맵 패널로 그린다. */
export declare function MilestonePanel(props: MilestonePanelProps): ReactElement;

export interface ProgressPanelProps { steps: StatusCounts; journeysLive: number; journeysTotal: number; /** 현재 마일스톤(계기 범위) */ milestone?: Milestone | null; at?: string }
/** 진척 패널: 현재 마일스톤 단계 → 마일스톤 계획 항목 → 전체 단계 순으로 범위를 정한 계기와 상태별 단계 수. */
export declare function ProgressPanel(props: ProgressPanelProps): ReactElement;

export interface ChangesPanelProps { changes: Change[]; activity: Activity; generatedAt: string; /** localStorage map:lastVisit 값 */ lastVisit?: string | null; at?: string }
/** 최근 변경 패널: 종류 칩과 사람 커밋 행(더보기 > 변화 링크). */
export declare function ChangesPanel(props: ChangesPanelProps): ReactElement;

export interface FeatureTrendPanelProps { journeys: Journey[]; selected?: string; onSelect: (id: string) => void; at?: string }
/** 기능별 변경 패널: 14일 커밋 많은 순, 스파크라인과 동작 단계 수. */
export declare function FeatureTrendPanel(props: FeatureTrendPanelProps): ReactElement;

export interface SignalsPanelProps { roadmapItems: RoadmapItem[]; milestones: Milestone[]; signals: Signals; generatedAt: string; at?: string }
/** 특보 패널: 이상 신호(더보기 링크) 다음 결정 대기(로드맵 링크). 넘치면 결정 대기가 "외 n →" 뒤로 가고, 없으면 "특보 없음". */
export declare function SignalsPanel(props: SignalsPanelProps): ReactElement;

export interface CapturePanelProps {
  captures: Capture[]; /** 캡처 id로 기능 제목·단계 이름을 찾는다 */ journeys?: Journey[]; base?: string; interval?: number;
  /** 1.3.0: 사용자가 고른 기능 id. 고르기 전에는 undefined */
  selected?: string;
  /** 1.3.0: 선택이 사용자 클릭에서 왔는지. false면 미리보기 previewCount장을 돌린다 */
  userPicked?: boolean;
  /** 1.3.0: 고르기 전에 돌릴 장 수. 기본 5 */
  previewCount?: number;
}
/** 화면 캡처 회전 패널과 썸네일. 썸네일을 누르면 멈추고 마우스·초점이 있으면 잠시 멈춘다.
 *  1.3.0: 사용자가 기능을 고르면 그 기능 캡처만 돌고, 없으면 "캡처 없음"을 보인다. 보이는 목록이 바뀌면 1장째·회전 재개로 되돌린다. */
export declare function CapturePanel(props: CapturePanelProps): ReactElement;

export interface FeatureTablePanelProps { journeys: Journey[]; activity: Activity; selected?: string; onSelect: (id: string) => void }
/** 기능 현황: 미완성 기능 행과 완성 기능 접은 행, 선택 기능 상세(영역 차트·상태·로드맵·마일스톤·기능 화면 링크). */
export declare function FeatureTablePanel(props: FeatureTablePanelProps): ReactElement;

export interface OverviewProps { data: OverviewData; captureBase?: string; /** 선택 내비 순번(알 수 없는 해시 경로는 -1) */ current?: number }
/** 첫 화면 전체 조립: 상단 바, 전광판, 3열 격자(마일스톤·진척·최근 변경 / 기능 지도·기능별 변경·특보 / 화면·기능 현황). */
export declare function Overview(props: OverviewProps): ReactElement;

export declare const Icons: { list: ReactElement; gauge: ReactElement; clock: ReactElement; map: ReactElement; trend: ReactElement; alert: ReactElement; screen: ReactElement; table: ReactElement };
export declare const STATUS: Record<JourneyStatus, { word: string; color: string }>;
export declare const STATUS_ORDER: StepStatus[];
/** 전광판 항목. 열린 질문·자동 검사는 counts.reading에 따라 "?"와 이유 분류를 붙인다. */
export declare function tickerItems(data: OverviewData): TickerItem[];
