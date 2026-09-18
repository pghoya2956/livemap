// 첫 화면 패널: 상단 바, 전광판, 마일스톤, 진척, 최근 변경, 기능별 변경, 특보, 화면 캡처, 기능 현황.
// 목록 패널은 스크롤 없이 들어가는 행만 그리고 나머지는 머리줄 "외 n →"로 보낸다.
// 이동 요소는 href 있는 a, 제자리 요소는 button이다. 동작 없는 행은 누를 수 있게 보이지 않는다.
import React from 'react';
import { Panel, Chip, Tag, Pill, Dot, Icons, StepMark, Proj } from './primitives.jsx';
import { Gauge, Sparkline, AreaChart } from './charts.jsx';
import { STATUS, STATUS_ORDER, clock, longDate, hostOf, ago, sum, mdKo, freshness, waitDays, ROADMAP_TAG, roadmapWord, journeyWord, journeyColor, journeyMark } from '../lib/format.js';
import { useFitRows } from '../lib/fit.js';
import { isNewer } from '../lib/visit.js';
import { visibleCaptures } from '../lib/capture.js';

const roadmapHref = (id) => `#/roadmap/${encodeURIComponent(id)}`;

/** 상단 바. 알약 순서: 배포, 경고, 신선도, 제품 호스트. */
export function TopBar({ project, signals, generatedAt, current = 0 }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const host = hostOf(project.host);
  const fresh = freshness(generatedAt, now.getTime());
  const nav = [['개요', '#/overview'], ['기능', '#/journeys'], ['로드맵', '#/roadmap'], ['작업', '#/tasks'], ['더보기', '#/more']];
  return (
    <header className="top">
      <div className="brand">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15.5" fill="#0C1319" stroke="#1E2A35" /><circle cx="17" cy="17" r="9" fill="none" stroke="#2FD3E6" strokeWidth="1.5" strokeDasharray="40 17" /><circle cx="17" cy="17" r="3.2" fill="#2FD3E6" /></svg>
        <div className="bt"><b><Proj>{String(project.name || '').toUpperCase()}</Proj> MONITOR</b><small>{project.tagline ? <><Proj>{project.tagline}</Proj> · </> : null}제품 상황판</small></div>
      </div>
      <nav className="nav" aria-label="화면">
        {nav.map(([n, href], i) => <a key={n} className={i === current ? 'on' : ''} href={href} aria-current={i === current ? 'page' : undefined}>{n}</a>)}
      </nav>
      <div className="right">
        {signals.deploy === 'ok' && <Pill tone="good" className="deploy"><Dot />배포 최신</Pill>}
        {signals.deploy === 'behind' && <Pill tone="warn" className="deploy">미배포 {signals.deployBehind}</Pill>}
        <Pill tone={signals.warnings ? 'warn' : 'plain'}>경고 {signals.warnings}</Pill>
        <Pill>{fresh.live && <Dot color="var(--red)" pulse />}{fresh.label}</Pill>
        {host && <Pill href={host.href}>{host.hostname} ↗</Pill>}
      </div>
      <div className="clock"><b className="num">{clock(now)}</b><small>{longDate(now)}</small></div>
    </header>
  );
}

/** 흐르는 전광판. 정지·재생 버튼, 복제 사본은 보조기기에서 숨긴다. 항목 project가 참이면 이름이 프로젝트 문구다. */
export function Ticker({ items }) {
  const [paused, setPaused] = React.useState(false);
  const row = (hidden) => items.map((it, i) => (
    <span className="tk" key={i} aria-hidden={hidden || undefined}>{it.project ? <Proj>{it.label}</Proj> : it.label} <span className="num">{it.value}</span>{it.extra && <span className="num fl"> {it.extra}</span>}</span>
  ));
  return (
    <div className={`ticker ${paused ? 'paused' : ''}`} aria-label="주요 수치">
      <div className="track">{row(false)}{row(true)}</div>
      <button className="pause" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? '재생' : '정지'}</button>
    </div>
  );
}

/** 항목 행 오른쪽 글자: 결정 대기 → 연결 단계 → 추적 작업. */
const itemRight = (r, ref) => {
  if (r.waitingOn) return <><Proj>{r.waitingWho ? `${r.waitingWho} ` : ''}</Proj>결정 대기{r.waitingSince ? ` ${waitDays(r.waitingSince, ref)}일째` : ''}</>;
  const n = sum(STATUS_ORDER.map((k) => r.sceneCounts?.[k] || 0));
  if (n) return `연결 단계 ${n}`;
  const t = r.tasks?.[0];
  return t ? <>작업 <Proj>{t.stage}</Proj> {t.pnDone}/{t.pnDone + t.pnOpen}</> : null;
};

/** 마일스톤 패널. 마일스톤이 없으면 로드맵 패널로, 로드맵이 없으면 진행 중인 작업 링크만 그린다. */
export function MilestonePanel({ roadmapItems, milestones, currentMilestone, generatedAt, tasksRunning = 0, at }) {
  const hasMs = milestones.length > 0;
  const items = roadmapItems;
  const cur = hasMs ? milestones.find((m) => m.id === currentMilestone) : null;
  let head = null, rows = [];
  if (hasMs) {
    const curItems = cur ? items.filter((r) => r.milestone === cur.id) : [];
    const firstWait = curItems.find((r) => r.waitingOn);
    head = cur && {
      title: cur.title, status: cur.status, goal: cur.goal,
      chips: [
        cur.steps.total ? [`s`, `단계 ${cur.steps.live}/${cur.steps.total}`] : cur.plans.total ? ['p', `계획 항목 ${cur.plans.done}/${cur.plans.total}`] : null,
        cur.targetOn ? ['t', `목표 ${mdKo(cur.targetOn)}`] : null,
        firstWait ? ['w', <><Proj>{firstWait.waitingWho ? `${firstWait.waitingWho} ` : ''}</Proj>결정 대기</>] : null,
      ].filter(Boolean),
    };
    const after = milestones.filter((m) => m.status !== '완료' && (!cur || m.order > cur.order));
    const done = milestones.filter((m) => m.status === '완료').sort((a, b) => (b.completedOn || '').localeCompare(a.completedOn || ''));
    rows = [
      ...curItems.filter((r) => r.status !== '완료').map((r) => ({ key: r.id, tag: r.status, title: r.title, right: itemRight(r, generatedAt), href: roadmapHref(r.id) })),
      ...after.map((m) => {
        const w = items.find((r) => r.milestone === m.id && r.waitingWho);
        return { key: m.id, tag: m.status, title: m.title, right: <>항목 {m.items.length}{w ? <> · <Proj>{w.waitingWho}</Proj> 결정 대기</> : null}</>, href: roadmapHref(m.id) };
      }),
      ...done.map((m) => ({ key: m.id, fold: true, title: m.title, suffix: ` · 항목 ${m.items.length} · ${m.completedOn ? `${mdKo(m.completedOn)} 완료` : '완료'}`, href: roadmapHref(m.id) })),
    ];
  } else if (items.length) {
    const first = items.find((r) => r.status === '진행') || items.find((r) => r.status !== '완료');
    head = first && {
      title: first.title, status: first.status, goal: first.goal,
      chips: [
        first.mode ? ['m', <Proj>{first.mode}</Proj>] : null,
        ...first.tasks.map((t) => [`t-${t.name}`, <>작업 <Proj>{t.stage}</Proj> {t.pnDone}/{t.pnDone + t.pnOpen}</>]),
        first.waitingOn ? ['w', <><Proj>{first.waitingWho ? `${first.waitingWho} ` : ''}</Proj>결정 대기</>] : null,
      ].filter(Boolean),
    };
    const done = items.filter((r) => r.status === '완료');
    const latest = [...done].filter((r) => r.completedAt).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
    rows = [
      ...items.filter((r) => r.status !== '완료' && r !== first).map((r) => ({ key: r.id, tag: r.status, title: r.title, right: itemRight(r, generatedAt), href: roadmapHref(r.id) })),
      ...(done.length ? [latest
        ? { key: 'done', fold: true, prefix: `완료 ${done.length} · 최근 `, title: latest.title, suffix: ` ${mdKo(latest.completedAt)}`, href: '#/roadmap' }
        : { key: 'done', fold: true, prefix: `완료 ${done.length}`, href: '#/roadmap' }] : []),
    ];
  }
  const [ref, n] = useFitRows(rows.length, 30);
  if (!hasMs && !items.length) {
    return (
      <Panel icon={Icons.list} title="로드맵" at={at} budget="list" className="ms">
        <div className="pb pb-tight">
          <div className="rows fit">
            <div className="row slim static"><div className="body"><div className="tt">로드맵이 없습니다</div></div></div>
          </div>
          <a className="tasks-link" href="#/tasks">진행 중인 작업 {tasksRunning} →</a>
        </div>
      </Panel>
    );
  }
  const doneCount = hasMs ? milestones.filter((m) => m.status === '완료').length : items.filter((r) => r.status === '완료').length;
  return (
    <Panel icon={Icons.list} title={hasMs ? '마일스톤' : '로드맵'} sub={`${doneCount}/${hasMs ? milestones.length : items.length} 완료`} at={at}
      budget="list" className="ms" more={rows.length > n ? { n: rows.length - n, href: '#/roadmap' } : null}>
      {head && (
        <div className="brief">
          <div className="av"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#F5A524" strokeWidth="1.6" strokeDasharray="42 14" /><circle cx="12" cy="12" r="3" fill="#F5A524" /></svg></div>
          <div className="bb">
            <div className="who"><span className="wt-t" title={head.title}><Proj>{head.title}</Proj></span> <Tag kind={ROADMAP_TAG[head.status]}>{roadmapWord(head.status)}</Tag></div>
            {head.goal && <p title={head.goal}><Proj>{head.goal}</Proj></p>}
            <div className="chips">{head.chips.map(([k, c]) => <Chip key={k}>{c}</Chip>)}</div>
          </div>
        </div>
      )}
      <div className="pb pb-tight">
        <div className="rows fit" ref={ref}>
          {rows.slice(0, n).map((r) => r.fold
            ? <a className="row fold" key={r.key} href={r.href}><div className="body"><div className="tt" title={`${r.prefix || ''}${r.title || ''}${r.suffix || ''}`}>{r.prefix}<Proj>{r.title}</Proj>{r.suffix}</div></div></a>
            : <a className="row slim" key={r.key} href={r.href}><Tag kind={ROADMAP_TAG[r.tag]}>{roadmapWord(r.tag)}</Tag><div className="body"><div className="tt" title={r.title}><Proj>{r.title}</Proj></div></div>{r.right && <span className="right">{r.right}</span>}</a>)}
        </div>
      </div>
    </Panel>
  );
}

/** 진척 계기. 범위는 현재 마일스톤 단계 → 마일스톤 계획 항목 → 전체 단계. */
export function ProgressPanel({ steps, journeysLive, journeysTotal, milestone, at }) {
  const total = sum(STATUS_ORDER.map((k) => steps[k]));
  let value, den, caption, scope = 'all';
  if (milestone && milestone.steps.total) { value = milestone.steps.live; den = milestone.steps.total; caption = [milestone.title, ' 동작 단계']; scope = 'ms'; }
  else if (milestone && milestone.plans.total) { value = milestone.plans.done; den = milestone.plans.total; caption = [milestone.title, ' 계획 항목']; scope = 'ms'; }
  else { value = steps.live; den = total; caption = [null, total ? '전체 동작 단계' : '단계 없음']; }
  const pct = den ? Math.round((value / den) * 100) : 0;
  const shown = STATUS_ORDER.filter((k) => steps[k]);
  return (
    <Panel icon={Icons.gauge} title="진척" badge={<span className="pill good pill-sm">완성 기능 {journeysLive}/{journeysTotal}</span>} at={at}>
      <div className="gauge">
        <div className="gw"><Gauge value={pct} caption="" /><div className="cap-html" title={caption.filter(Boolean).join('')}><Proj>{caption[0]}</Proj>{caption[1]}</div></div>
        <div>
          {scope === 'ms' && <div className="stat stat-ms"><small>{milestone.steps.total ? '단계' : '계획 항목'}</small><b>{value}<i>/{den}</i></b></div>}
          <div className="stats3">
            {shown.map((k) => <div className="stat" key={k}><small>{STATUS[k].word} 단계</small><b style={{ color: STATUS[k].color }}>{steps[k]}<i>/{total}</i></b></div>)}
          </div>
          <div className="seg">{shown.map((k) => <span key={k} style={{ flex: steps[k], background: STATUS[k].color }} />)}</div>
          <div className="gline">{scope === 'ms' ? `전체 동작 ${steps.live}/${total} · 완성 기능 ${journeysLive}/${journeysTotal}` : `실제 데이터로 동작 ${steps.live} · 화면만 ${steps.mock} · 스펙 전 ${steps.next}`}</div>
        </div>
      </div>
    </Panel>
  );
}

const KIND_ORDER = ['기능', '수정', '문서', '검사', '정리', '운영', '변경'];
/** 최근 변경(사람 커밋). 행은 더보기 > 변화로 간다. */
export function ChangesPanel({ changes, activity, generatedAt, lastVisit, at }) {
  const [filter, setFilter] = React.useState('전체');
  const kinds = ['전체', ...KIND_ORDER.filter((k) => changes.some((c) => c.kind === k))];
  const list = changes.filter((c) => filter === '전체' || c.kind === filter);
  const [ref, n] = useFitRows(list.length, 48);
  const sub = activity.total || activity.bots ? `14일 ${activity.total}건${activity.bots ? ` · 자동 ${activity.bots}건` : ''}` : '14일 변경 없음';
  return (
    <Panel icon={Icons.clock} title="최근 변경" sub={sub} at={at} budget="list" className="changes" more={list.length > n ? { n: list.length - n, href: '#/more/changes' } : null}>
      <div className="pb pb-top">
        {changes.length > 0 && <div className="chips">{kinds.map((k) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{k}</Chip>)}</div>}
        <div className="rows fit rows-gap" ref={ref}>
          {list.slice(0, n).map((c, i) => {
            const more = c.journeys.length + (c.journeysMore || 0) - 2;
            return (
              <a className="row" key={i} href="#/more/changes">
                <Tag kind={c.kind}>{c.kind}</Tag>
                <div className="body">
                  <div className="tt" title={c.subject}>{isNewer(c.date, lastVisit) && <span className="newdot" />}<span data-text="commit">{c.subject}</span></div>
                  <div className="meta">{ago(c.date, generatedAt)}{c.journeys.length ? <> · <Proj>{c.journeys.slice(0, 2).join(', ')}</Proj>{more > 0 ? ` 외 ${more}` : ''}</> : null}</div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/** 기능별 변경: 14일 커밋 내림차순. 활동은 중립 청록. */
export function FeatureTrendPanel({ journeys, selected, onSelect, at }) {
  const sorted = journeys.map((j, i) => ({ j, i })).sort((a, b) => b.j.commits - a.j.commits || a.i - b.i).map((x) => x.j);
  const [ref, n] = useFitRows(sorted.length, 52);
  return (
    <Panel icon={Icons.trend} title="기능별 변경" sub="14일 커밋" at={at} budget="list" more={sorted.length > n ? { n: sorted.length - n, href: '#/journeys' } : null}>
      <div className="pb">
        <div className="rows fit" ref={ref}>
          {!sorted.length && <div className="row static"><div className="body"><div className="tt">기능이 없습니다</div></div></div>}
          {sorted.slice(0, n).map((j) => (
            <button key={j.id} className={`mk row ${j.id === selected ? 'sel' : ''}`} onClick={() => onSelect(j.id)}>
              <div className="mk-b"><div className="tt"><Proj>{j.title}</Proj></div><div className="meta"><Proj>{j.actor}</Proj> · <Proj>{j.lane}</Proj></div></div>
              <Sparkline series={j.series} color={j.commits ? '#2FD3E6' : '#222B36'} />
              <div className="v"><b style={{ color: journeyColor(j) }}>{j.counts.live}/{j.steps.length}</b><span className="fl">변경 {j.commits}</span></div>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** 특보: 이상 신호(검사 실패는 더보기 > 검사, 나머지는 더보기 > 이 상황판) 다음 결정 대기(로드맵 화면으로). 넘치면 결정 대기가 '외 n' 뒤로 간다. */
export function SignalsPanel({ roadmapItems, milestones, signals, generatedAt, at }) {
  const rows = [];
  const sig = (key, mag, tone, title, meta, href = '#/more/about') => rows.push({ key, cls: 'sig', mag, tone, title, titleText: title, meta, metaText: meta, href });
  if (signals.deploy === 'behind') sig('deploy', '배포', 'hot', `미배포 ${signals.deployBehind}커밋`, '제품 코드 변경이 배포되지 않음');
  if (signals.warnings > 0) sig('warn', '경고', 'hot', `경고 ${signals.warnings}`, '상태와 코드가 어긋난 단계');
  if (signals.tests === 'fail') sig('tests', '검사', 'hot', `검사 실패 ${signals.lastRun?.failures ?? ''}`.trim(), '마지막 검사 리포트', '#/more/tests');
  if (signals.adapters === 'fail') sig('adapters', '자료', 'hot', '자료 일부 누락', '읽지 못한 자료가 있음');
  if (signals.deploy === 'ok' && signals.deployBehindAll > 0) sig('board', '뒤', '', `상황판 ${signals.deployBehindAll}커밋 뒤`, '제품 배포는 최신');
  [...milestones, ...roadmapItems].filter((r) => r.status !== '완료' && (r.waitingOn || r.waitingWhat)).forEach((r) => rows.push({
    key: `w-${r.id}`, cls: 'wait', mag: '대기', tone: 'warm', href: roadmapHref(r.id),
    title: <><Proj>{r.waitingWho ? `${r.waitingWho} ` : ''}</Proj>결정 대기 · <Proj>{r.title}</Proj></>, titleText: `${r.waitingWho ? `${r.waitingWho} ` : ''}결정 대기 · ${r.title}`,
    meta: <>{r.waitingSince ? `${waitDays(r.waitingSince, generatedAt)}일째 · ` : ''}<Proj>{r.waitingWhat || r.waitingOn}</Proj></>, metaText: r.waitingWhat || r.waitingOn,
  }));
  const [ref, n] = useFitRows(rows.length, 48);
  return (
    <Panel icon={Icons.alert} title="특보" badge={<Tag kind={rows.length ? 'mock' : 'live'}>{rows.length}</Tag>} at={at} budget="list" className="signals" more={rows.length > n ? { n: rows.length - n, href: '#/roadmap' } : null}>
      <div className="pb">
        <div className="rows fit" ref={ref}>
          {rows.length === 0 && <div className="row al static"><div className="body"><div className="tt">특보 없음</div></div></div>}
          {rows.slice(0, n).map((s) => (
            <a className={`row al ${s.cls}`} key={s.key} href={s.href}>
              <span className={`mag ${s.tone}`}>{s.mag}</span>
              <div className="body"><div className="tt" title={s.titleText}>{s.title}</div><div className="meta" title={s.metaText}>{s.meta}</div></div>
            </a>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** 화면 캡처 순환. 썸네일을 누르면 회전을 멈추고, 마우스·초점이 있으면 잠시 멈추며, 모션 줄임이면 돌지 않는다. */
export function CapturePanel({ captures, journeys = [], base = 'captures/', interval = 6000, selected, userPicked = false, previewCount = 5 }) {
  // 1.3.0: 고르기 전에는 미리보기 previewCount장, 사용자가 기능을 고르면 그 기능 캡처만 돈다
  const { list: shown, scoped, key } = visibleCaptures(captures, { selected, userPicked, previewCount });
  const [i, setI] = React.useState(0);
  const [stopped, setStopped] = React.useState(false);
  // 보이는 목록의 신원이 바뀌면 장 번호 0·멈춤 거짓으로 되돌린다(DEC-39). 렌더 중에 맞춰 옛 장 번호로 한 번 그리는 일이 없게 한다
  const [shownKey, setShownKey] = React.useState(key);
  if (shownKey !== key) { setShownKey(key); setI(0); setStopped(false); }
  const [hover, setHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const hold = stopped || hover || focused;
  React.useEffect(() => {
    if (hold || shown.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % shown.length), interval);
    return () => clearInterval(t);
  }, [shown.length, interval, hold, key]);
  const src = (c) => c.src || `${base}${c.file}`;
  const names = (c) => {
    const j = journeys.find((x) => x.id === c.journey);
    const s = j?.steps.find((x) => x.id === c.step);
    return { jt: j?.title ?? c.journey, st: s?.label ?? c.step };
  };
  const c = shown[i];
  const cn = c && names(c);
  const jt = scoped ? journeys.find((x) => x.id === selected)?.title ?? selected : null;
  const sub = scoped ? '고른 기능의 화면' : shown.length ? `실제 데이터로 동작하는 화면 ${shown.length}장` : '실제 데이터로 동작하는 화면';
  return (
    <Panel icon={Icons.screen} title="화면" sub={sub} className="capture">
      <div className="capbox" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
        <div className="live">
          {c ? (<>
            <img src={src(c)} alt={`${cn.jt} ${cn.st} 화면`} />
            <span className="rec">화면 캡처</span>
            <span className="cnt num">{i + 1}/{shown.length}</span>
            <div className="ov"><a href={`#/journeys/${encodeURIComponent(c.journey)}/${encodeURIComponent(c.step)}`}><b><Proj>{cn.st}</Proj></b></a><small><Proj>{cn.jt}</Proj> · 실제 데이터로 동작</small></div>
          </>) : scoped
            ? <div className="ov"><b>캡처 없음</b><small>「<Proj>{jt}</Proj>」 화면 캡처가 아직 없다</small></div>
            : <div className="ov"><small>캡처 없음</small></div>}
        </div>
        {shown.length > 0 && (
          <div className="thumbs">
            {shown.map((x, k) => <button key={k} className={k === i ? 'on' : ''} aria-pressed={k === i} onClick={() => { setI(k); setStopped(true); }} aria-label={names(x).st}><img src={src(x)} alt="" /></button>)}
          </div>
        )}
      </div>
    </Panel>
  );
}

const ORDER = { mock: 1, planned: 2, next: 3 };
/** 기능 현황: 미완성 기능 + 완성 기능 접은 행, 선택 기능 상세. */
export function FeatureTablePanel({ journeys, activity, selected, onSelect }) {
  const series = activity.days.map((d) => d.commits);
  const days = activity.days.map((d) => d.date);
  const incomplete = journeys.map((j, i) => ({ j, i })).filter((x) => x.j.status !== 'live')
    .sort((a, b) => ((a.j.counts.live > 0 ? 0 : ORDER[a.j.status] || 4) - (b.j.counts.live > 0 ? 0 : ORDER[b.j.status] || 4)) || a.i - b.i).map((x) => x.j);
  const done = journeys.filter((j) => j.status === 'live');
  const rows = [...incomplete.map((j) => ({ j })), ...(done.length ? [{ fold: true }] : [])];
  const [ref, n] = useFitRows(rows.length, 30);
  const j = journeys.find((x) => x.id === selected) || incomplete[0] || journeys[0];
  return (
    <Panel icon={Icons.table} title="기능 현황" sub={`${journeys.length}개 기능`} budget="list" more={rows.length > n ? { n: rows.length - n, href: '#/journeys' } : null}>
      <div className="pb pb-table">
        <div className="rows fit" ref={ref}>
          {!rows.length && <div className="row static"><div className="body"><div className="tt">기능이 없습니다</div></div></div>}
          {rows.slice(0, n).map((r) => r.fold
            ? <a key="fold" className="wt fold row" href="#/journeys"><span className="tt">완성 기능 {done.length} · 단계 {sum(done.map((x) => x.steps.length))}</span><span className="st" /><span /><span className="v" /><StepMark status="live" /></a>
            : <button key={r.j.id} className={`wt row ${r.j.id === j?.id ? 'sel' : ''}`} onClick={() => onSelect(r.j.id)}>
                <span className="tt"><Proj>{r.j.title}</Proj></span><span className="st">{journeyWord(r.j)}</span>
                <Sparkline series={r.j.series} color={r.j.commits ? '#2FD3E6' : '#222B36'} width={64} height={18} />
                <span className="v">{r.j.counts.live}/{r.j.steps.length}</span><StepMark status={journeyMark(r.j)} />
              </button>)}
        </div>
      </div>
      {j && (
        <div className="detail">
          <div className="hd"><b title={j.goal}><Proj>{j.title}</Proj></b><span><Proj>{j.actor}</Proj></span><em>14일 변경 {j.commits}</em><a className="open" href={`#/journeys/${encodeURIComponent(j.id)}`}>기능 화면 →</a></div>
          <AreaChart series={j.series} compare={series} days={days} />
          <div className="kv">
            <div>상태<b style={{ color: journeyColor(j) }}>{journeyWord(j)}</b></div>
            <div>단계<b>{j.counts.live}/{j.steps.length} 동작</b></div>
            <div>최근 7일<b>{j.week}</b></div>
            <div>로드맵<b title={j.roadmapItem?.title}>{j.roadmapItem ? <Proj>{j.roadmapItem.title}</Proj> : '—'}</b></div>
            <div>마일스톤<b title={j.milestone?.title}>{j.milestone ? <Proj>{j.milestone.title}</Proj> : '마일스톤 없음'}</b></div>
          </div>
        </div>
      )}
    </Panel>
  );
}
