// livemap 모니터 화면 컴포넌트 타입. 자료 모양은 livemap 생성물에서 계산한 모니터 자료(MonitorData)다.
import type { ReactNode, ReactElement } from 'react';

/** 단계 상태: live 실제 데이터로 동작, mock 화면만 있음, planned 스펙만 있음, next 스펙 전 구상. */
export type StepStatus = 'live' | 'mock' | 'planned' | 'next';
export interface StatusCounts { live: number; mock: number; planned: number; next: number }
export interface Step { label: string; status: StepStatus; hits: number; capture?: string | null }
export interface Journey {
  id: string; title: string; actor: string; lane: string; goal: string; status: StepStatus;
  counts: StatusCounts; steps: Step[]; warnings: number;
  milestone: { title: string; status: string } | null;
  /** 최근 14일 하루 변경 수 */
  series: number[]; commits: number; week: number; prevWeek: number;
}
/** 로드맵 상태는 완료·진행·다음·대기·이후 중 하나 */
export interface RoadmapItem { title: string; status: string; mode?: string; goal: string; waitingOn: string; sceneCounts: StatusCounts }
export interface Change { date: string; tag: '기능' | '수정' | '화면' | '배포' | '문서' | '검사'; subject: string; journeys: string[] }
export interface Activity { days: string[]; total: number[]; runtime: number[]; deploy: number[]; docs: number[]; sum: number; runtimeSum: number }
export interface Capture { src: string; journey: string; step: string; status?: StepStatus; file?: string }
export interface Link { a: string; b: string; n: number }
export interface TaskSummary { title: string; stage: string; done: number; open: number }
export interface Project { name: string; tagline: string; host: string }
export interface Signals { deploy: 'ok' | 'behind' | 'unknown'; deployBehind: number; warnings: number }
export interface MonitorData {
  generatedAt: string; project: Project; signals: Signals; steps: StatusCounts; stepsTotal: number;
  journeysLive: number; journeysTotal: number; roadmap: RoadmapItem[]; tasks: TaskSummary[];
  size: { screens: number; screensLive: number; apis: number; functions: number; tables: number; tests: number; e2e: number; decisions: number; oq: number; commits: number };
  activity: Activity; links: Link[]; journeys: Journey[]; changes: Change[]; captures: Capture[];
}
export interface TickerItem { label: string; value: string | number; delta?: string; trend?: 'up' | 'dn' | 'fl' }

export interface PanelProps {
  /** 머리줄 왼쪽 16px 선 아이콘. Icons의 값을 쓴다. */
  icon?: ReactNode; title: string; sub?: ReactNode;
  /** 오른쪽 기준 시각 문구, 예: "02:29 기준" */
  at?: string; badge?: ReactNode; children?: ReactNode; className?: string;
}
/** 다크 모니터 패널 틀. 머리줄(아이콘·제목·보조 문구·기준 시각)과 본문. 본문 여백은 자식에 `pb` 클래스를 준다. */
export declare function Panel(props: PanelProps): ReactElement;

export interface ChipProps { on?: boolean; count?: ReactNode; onClick?: () => void; children?: ReactNode }
/** 필터 칩. onClick이 있으면 버튼, on이면 청록 강조. */
export declare function Chip(props: ChipProps): ReactElement;

export interface TagProps {
  /** live·mock·planned·next 또는 완료·진행·다음·대기·이후·기능·수정·화면·배포·문서·검사 */
  kind: string; children?: ReactNode;
}
/** 짧은 상태 태그(초록 동작·완료·기능, 주황 목업·진행·수정, 보라 구상·다음, 청록 배포·화면). */
export declare function Tag(props: TagProps): ReactElement;

export interface PillProps { tone?: 'good' | 'warn' | 'plain'; href?: string; children?: ReactNode }
/** 상단 바 상태 알약. href가 있으면 새 탭 링크. */
export declare function Pill(props: PillProps): ReactElement;

export interface DotProps { color?: string; pulse?: boolean }
/** 7px 색 점. pulse면 맥박 애니메이션. */
export declare function Dot(props: DotProps): ReactElement;

export interface GaugeProps { /** 0~100 */ value: number; caption: string }
/** 270도 원호 계기. 가운데 큰 백분율과 설명. */
export declare function Gauge(props: GaugeProps): ReactElement;

export interface StatusBarProps { counts: StatusCounts }
/** 상태별 개수를 동작·목업·계획·구상 색 구간으로 이은 6px 막대. */
export declare function StatusBar(props: StatusBarProps): ReactElement;

export interface SparklineProps { series: number[]; color?: string; width?: number; height?: number }
/** 작은 꺾은선과 마지막 값 점. */
export declare function Sparkline(props: SparklineProps): ReactElement;

export interface AreaChartProps { series: number[]; compare?: number[]; days: string[]; compareLabel?: string }
/** 청록 영역 차트. compare를 점선으로 겹치고 아래에 첫날·마지막 날 축. */
export declare function AreaChart(props: AreaChartProps): ReactElement;

export interface FeatureMapProps {
  journeys: Journey[]; links?: Link[]; selected?: string; onSelect?: (id: string) => void;
  /** 오른쪽 아래 주황 안내, 예: "다음 · 이후 후보 · 결정 대기 ›" */
  nextNote?: string | null; stepCounts?: StatusCounts;
}
/** 기능 지도. 흐름(레인)별 구역에 기능 허브와 단계 점 경로, 함께 바뀐 기능 연결선, 레이어 토글. 부모 높이를 채운다. */
export declare function FeatureMap(props: FeatureMapProps): ReactElement;

export interface TopBarProps { project: Project; signals: Signals; nav?: string[]; current?: number }
/** 상단 바: 자간 넓은 브랜드, 내비, 배포·경고·LIVE·제품 주소 알약, 실시간 시계. */
export declare function TopBar(props: TopBarProps): ReactElement;

export interface TickerProps { items: TickerItem[] }
/** 가로로 흐르는 수치 전광판. 마우스를 올리면 멈춘다. */
export declare function Ticker(props: TickerProps): ReactElement;

export interface RoadmapPanelProps { roadmap: RoadmapItem[]; tasks?: TaskSummary[]; at?: string }
/** 로드맵 패널: 진행 중 항목 강조 카드와 상태 필터 목록. */
export declare function RoadmapPanel(props: RoadmapPanelProps): ReactElement;

export interface ProgressPanelProps { steps: StatusCounts; total: number; journeysLive: number; journeysTotal: number; at?: string }
/** 진척 패널: 동작 단계 비율 계기와 상태별 단계 수. */
export declare function ProgressPanel(props: ProgressPanelProps): ReactElement;

export interface ChangesPanelProps { changes: Change[]; total: number; refIso: string; at?: string }
/** 최근 변경 패널: 종류 필터와 상대 시각 목록. */
export declare function ChangesPanel(props: ChangesPanelProps): ReactElement;

export interface FeatureTrendPanelProps { journeys: Journey[]; selected?: string; onSelect: (id: string) => void; at?: string }
/** 기능별 진척 패널: 변경 많은 순, 14일 스파크라인과 동작 단계 수. */
export declare function FeatureTrendPanel(props: FeatureTrendPanelProps): ReactElement;

export interface SignalsPanelProps { roadmap: RoadmapItem[]; journeys: Journey[]; activity: Activity; changes: Change[]; refIso: string; at?: string }
/** 특보 패널: 결정 대기, 미완성 기능, 변경이 많았던 날, 최근 배포. */
export declare function SignalsPanel(props: SignalsPanelProps): ReactElement;

export interface CapturePanelProps { captures: Capture[]; interval?: number }
/** 화면 캡처 순환 패널과 썸네일 선택. */
export declare function CapturePanel(props: CapturePanelProps): ReactElement;

export interface FeatureTablePanelProps { journeys: Journey[]; activity: Activity; selected?: string; onSelect: (id: string) => void }
/** 기능 현황 표와 선택 기능 상세(영역 차트·상태·단계·로드맵). */
export declare function FeatureTablePanel(props: FeatureTablePanelProps): ReactElement;

export interface OverviewProps { data: MonitorData }
/** 첫 화면 전체 조립: 상단 바, 전광판, 3열 격자(로드맵·진척·최근 변경 / 기능 지도·기능별 진척·특보 / 화면·기능 현황). */
export declare function Overview(props: OverviewProps): ReactElement;

export declare const Icons: { list: ReactElement; gauge: ReactElement; clock: ReactElement; map: ReactElement; trend: ReactElement; alert: ReactElement; screen: ReactElement; table: ReactElement };
export declare const STATUS: Record<StepStatus, { word: string; color: string }>;
export declare const STATUS_ORDER: StepStatus[];
export declare function tickerItems(data: MonitorData): TickerItem[];
