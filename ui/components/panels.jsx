// 첫 화면 패널: 상단 바, 전광판, 마일스톤, 진척, 최근 변경, 기능별 변경, 특보, 화면 캡처, 기능 현황.
// 목록 패널은 스크롤 없이 들어가는 행만 그리고 나머지는 머리줄 "외 n →"로 보낸다.
import React from 'react';
import { Panel, Chip, Tag, Pill, Dot, Icons, StepMark } from './primitives.jsx';
import { Gauge, Sparkline, AreaChart } from './charts.jsx';
import { STATUS, STATUS_ORDER, clock, longDate, hostOf, ago, sum, mdKo, freshness, waitDays, ROADMAP_TAG, roadmapWord } from '../lib/format.js';
import { useFitRows } from '../lib/fit.js';

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
        <div><b>{project.name.toUpperCase()} MONITOR</b><small>{project.tagline} · 제품 상황판</small></div>
      </div>
      <nav className="nav" aria-label="화면">
        {nav.map(([n, href], i) => <a key={n} className={i === current ? 'on' : ''} href={href} aria-current={i === current ? 'page' : undefined}>{n}</a>)}
      </nav>
      <div className="right">
        {signals.deploy === 'ok' && <Pill tone="good"><Dot />배포 최신</Pill>}
        {signals.deploy === 'behind' && <Pill tone="warn">미배포 {signals.deployBehind}</Pill>}
        <Pill tone={signals.warnings ? 'warn' : 'plain'}>경고 {signals.warnings}</Pill>
        <Pill>{fresh.live && <Dot color="var(--red)" pulse />}{fresh.label}</Pill>
        {host && <Pill href={host.href}>{host.hostname} ↗</Pill>}
      </div>
      <div className="clock"><b className="num">{clock(now)}</b><small>{longDate(now)}</small></div>
    </header>
  );
}

/** 흐르는 전광판. 정지·재생 버튼, 복제 사본은 보조기기에서 숨긴다. */
export function Ticker({ items }) {
  const [paused, setPaused] = React.useState(false);
  const row = (hidden) => items.map((it, i) => (
    <span className="tk" key={i} aria-hidden={hidden || undefined}>{it.label} <span className="num">{it.value}</span>{it.extra && <span className="num fl"> {it.extra}</span>}</span>
  ));
  return (
    <div className={`ticker ${paused ? 'paused' : ''}`} aria-label="주요 수치">
      <div className="track">{row(false)}{row(true)}</div>
      <button className="pause" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? '재생' : '정지'}</button>
    </div>
  );
}

const itemRight = (r, ref) => {
  if (r.waitingOn) return `${r.waitingWho ? `${r.waitingWho} ` : ''}결정 대기${r.waitingSince ? ` ${waitDays(r.waitingSince, ref)}일째` : ''}`;
  const n = sum(STATUS_ORDER.map((k) => r.sceneCounts?.[k] || 0));
  if (n) return `연결 단계 ${n}`;
  const t = r.tasks?.[0];
  return t ? `작업 ${t.stage} ${t.pnDone}/${t.pnDone + t.pnOpen}` : '';
};

/** 마일스톤 패널. 마일스톤이 없으면 로드맵 패널로 그린다. */
export function MilestonePanel({ roadmapItems, milestones, currentMilestone, generatedAt, at }) {
  const hasMs = milestones.length > 0;
  const cur = hasMs ? milestones.find((m) => m.id === currentMilestone) : null;
  const items = roadmapItems;
  let head, rows;
  if (hasMs) {
    const curItems = cur ? items.filter((r) => r.milestone === cur.id) : [];
    const firstWait = curItems.find((r) => r.waitingOn);
    head = cur && {
      title: cur.title, status: cur.status, goal: cur.goal,
      chips: [
        cur.steps.total ? `단계 ${cur.steps.live}/${cur.steps.total}` : cur.plans.total ? `계획 항목 ${cur.plans.done}/${cur.plans.total}` : null,
        cur.targetOn ? `목표 ${mdKo(cur.targetOn)}` : null,
        firstWait ? `${firstWait.waitingWho ? `${firstWait.waitingWho} ` : ''}결정 대기` : null,
      ].filter(Boolean),
    };
    const after = cur ? milestones.filter((m) => m.order > cur.order && m.status !== '완료') : milestones.filter((m) => m.status !== '완료');
    const done = milestones.filter((m) => m.status === '완료').sort((a, b) => (b.completedOn || '').localeCompare(a.completedOn || ''));
    rows = [
      ...curItems.filter((r) => r.status !== '완료').map((r) => ({ key: r.id, tag: r.status, title: r.title, right: itemRight(r, generatedAt) })),
      ...after.map((m) => {
        const w = items.find((r) => r.milestone === m.id && r.waitingWho);
        return { key: m.id, tag: m.status, title: m.title, right: `항목 ${m.items.length}${w ? ` · ${w.waitingWho} 결정 대기` : ''}` };
      }),
      ...done.map((m) => ({ key: m.id, fold: true, title: `${m.title} · 항목 ${m.items.length}${m.completedOn ? ` · ${mdKo(m.completedOn)} 완료` : ''}`, href: `#/roadmap/${m.id}` })),
    ];
  } else {
    const first = items.find((r) => r.status === '진행') || items.find((r) => r.status !== '완료');
    head = first && {
      title: first.title, status: first.status, goal: first.goal,
      chips: [first.mode, ...first.tasks.map((t) => `작업 ${t.stage} ${t.pnDone}/${t.pnDone + t.pnOpen}`), first.waitingOn ? '결정 대기' : null].filter(Boolean),
    };
    const done = items.filter((r) => r.status === '완료');
    const latest = [...done].filter((r) => r.completedAt).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
    rows = [
      ...items.filter((r) => r.status !== '완료' && r !== first).map((r) => ({ key: r.id, tag: r.status, title: r.title, right: itemRight(r, generatedAt) })),
      ...(done.length ? [{ key: 'done', fold: true, title: `완료 ${done.length}${latest ? ` · 최근 ${latest.title} ${mdKo(latest.completedAt)}` : ''}`, href: '#/roadmap' }] : []),
    ];
  }
  const [ref, n] = useFitRows(rows.length, 30);
  const doneCount = hasMs ? milestones.filter((m) => m.status === '완료').length : items.filter((r) => r.status === '완료').length;
  return (
    <Panel icon={Icons.list} title={hasMs ? '마일스톤' : '로드맵'} sub={`${doneCount}/${hasMs ? milestones.length : items.length} 완료`} at={at}
      budget="list" more={rows.length > n ? { n: rows.length - n, href: '#/roadmap' } : null}>
      {head && (
        <div className="brief">
          <div className="av"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#F5A524" strokeWidth="1.6" strokeDasharray="42 14" /><circle cx="12" cy="12" r="3" fill="#F5A524" /></svg></div>
          <div style={{ minWidth: 0 }}>
            <div className="who">{head.title} <Tag kind={ROADMAP_TAG[head.status]}>{roadmapWord(head.status)}</Tag></div>
            {head.goal && <p title={head.goal}>{head.goal}</p>}
            <div className="chips">{head.chips.map((c) => <Chip key={c}>{c}</Chip>)}</div>
          </div>
        </div>
      )}
      <div className="pb pb-tight">
        <div className="rows fit" ref={ref}>
          {rows.slice(0, n).map((r) => r.fold
            ? <a className="row fold" key={r.key} href={r.href}><div className="body"><div className="tt">{r.title}</div></div></a>
            : <div className="row slim" key={r.key}><Tag kind={ROADMAP_TAG[r.tag]}>{roadmapWord(r.tag)}</Tag><div className="body"><div className="tt" title={r.title}>{r.title}</div></div>{r.right && <span className="right">{r.right}</span>}</div>)}
        </div>
      </div>
    </Panel>
  );
}

/** 진척 계기. 범위는 현재 마일스톤 단계 → 마일스톤 계획 항목 → 전체 단계. */
export function ProgressPanel({ steps, journeysLive, journeysTotal, milestone, at }) {
  const total = sum(STATUS_ORDER.map((k) => steps[k]));
  let value, den, caption, scope = 'all';
  if (milestone && milestone.steps.total) { value = milestone.steps.live; den = milestone.steps.total; caption = `${milestone.title} 동작 단계`; scope = 'ms'; }
  else if (milestone && milestone.plans.total) { value = milestone.plans.done; den = milestone.plans.total; caption = `${milestone.title} 계획 항목`; scope = 'ms'; }
  else { value = steps.live; den = total; caption = total ? '전체 동작 단계' : '단계 없음'; }
  const pct = den ? Math.round((value / den) * 100) : 0;
  const shown = STATUS_ORDER.filter((k) => steps[k]);
  return (
    <Panel icon={Icons.gauge} title="진척" badge={<span className="pill good pill-sm">완성 기능 {journeysLive}/{journeysTotal}</span>} at={at}>
      <div className="gauge">
        <div><Gauge value={pct} caption="" /><div className="cap-html" title={caption}>{caption}</div></div>
        <div>
          {scope === 'ms' && <div className="stat" style={{ marginBottom: 8 }}><small>{milestone.steps.total ? '단계' : '계획 항목'}</small><b style={{ color: 'var(--amber)' }}>{value}<i>/{den}</i></b></div>}
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

/** 최근 변경(사람 커밋). */
export function ChangesPanel({ changes, activity, generatedAt, lastVisit, at }) {
  const [filter, setFilter] = React.useState('전체');
  const kinds = ['전체', ...['기능', '수정', '문서', '검사', '정리', '운영', '변경'].filter((k) => changes.some((c) => c.kind === k))];
  const list = changes.filter((c) => filter === '전체' || c.kind === filter);
  const [ref, n] = useFitRows(list.length, 48);
  const sub = activity.total || activity.bots ? `14일 ${activity.total}건${activity.bots ? ` · 자동 ${activity.bots}건` : ''}` : '14일 변경 없음';
  return (
    <Panel icon={Icons.clock} title="최근 변경" sub={sub} at={at} budget="list" more={list.length > n ? { n: list.length - n, href: '#/more/changes' } : null}>
      <div className="pb pb-top">
        <div className="chips">{kinds.map((k) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{k}</Chip>)}</div>
        <div className="rows fit rows-gap" ref={ref}>
          {list.slice(0, n).map((c, i) => (
            <div className="row" key={i}>
              <Tag kind={c.kind}>{c.kind}</Tag>
              <div className="body">
                <div className="tt" title={c.subject} data-text="commit">{lastVisit && Date.parse(c.date) > Date.parse(lastVisit) && <span className="newdot" />}{c.subject}</div>
                <div className="meta">{ago(c.date, generatedAt)}{c.journeys.length ? ` · ${c.journeys.slice(0, 2).join(', ')}${c.journeys.length + (c.journeysMore || 0) > 2 ? ` 외 ${c.journeys.length + (c.journeysMore || 0) - 2}` : ''}` : ''}</div>
              </div>
            </div>
          ))}
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
          {sorted.slice(0, n).map((j) => (
            <button key={j.id} className={`mk row ${j.id === selected ? 'sel' : ''}`} onClick={() => onSelect(j.id)}>
              <div style={{ minWidth: 0 }}><div className="tt">{j.title}</div><div className="meta">{j.actor} · {j.lane}</div></div>
              <Sparkline series={j.series} color={j.commits ? '#2FD3E6' : '#222B36'} />
              <div className="v"><b style={{ color: STATUS[j.status]?.color }}>{j.counts.live}/{j.steps.length}</b><span className="fl">변경 {j.commits}</span></div>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** 특보: 결정 대기와 이상 신호만. */
export function SignalsPanel({ roadmapItems, milestones, signals, generatedAt, at }) {
  const rows = [];
  [...milestones, ...roadmapItems].filter((r) => r.status !== '완료' && (r.waitingOn || r.waitingWhat)).forEach((r) => rows.push({
    key: `w-${r.id}`, mag: '대기', warm: true, title: `${r.waitingWho ? `${r.waitingWho} ` : ''}결정 대기 · ${r.title}`,
    meta: `${r.waitingSince ? `${waitDays(r.waitingSince, generatedAt)}일째 · ` : ''}${r.waitingWhat || r.waitingOn}`,
  }));
  if (signals.deploy === 'behind') rows.push({ key: 'deploy', mag: '배포', hot: true, title: `미배포 ${signals.deployBehind}커밋`, meta: '제품 코드 변경이 배포되지 않음' });
  if (signals.warnings > 0) rows.push({ key: 'warn', mag: '경고', hot: true, title: `경고 ${signals.warnings}`, meta: '상태와 코드가 어긋난 단계' });
  if (signals.tests === 'fail') rows.push({ key: 'tests', mag: '검사', hot: true, title: `검사 실패 ${signals.lastRun?.failures ?? ''}`, meta: '마지막 검사 리포트' });
  if (signals.adapters === 'fail') rows.push({ key: 'adapters', mag: '자료', hot: true, title: '자료 일부 누락', meta: '읽지 못한 자료가 있음' });
  if (signals.deploy === 'ok' && signals.deployBehindAll > 0) rows.push({ key: 'board', mag: '뒤', title: `상황판 ${signals.deployBehindAll}커밋 뒤`, meta: '제품 배포는 최신' });
  const [ref, n] = useFitRows(rows.length, 48);
  return (
    <Panel icon={Icons.alert} title="특보" badge={<Tag kind={rows.length ? 'mock' : 'live'}>{rows.length}</Tag>} at={at} budget="list" more={rows.length > n ? { n: rows.length - n, href: '#/roadmap' } : null}>
      <div className="pb">
        <div className="rows fit" ref={ref}>
          {rows.length === 0 && <div className="row"><div className="body"><div className="tt">이상 없음</div><div className="meta">결정 대기와 경고가 없습니다</div></div></div>}
          {rows.slice(0, n).map((s) => (
            <div className="sig row" key={s.key}>
              <span className={`mag ${s.hot ? 'hot' : s.warm ? 'warm' : ''}`}>{s.mag}</span>
              <div style={{ minWidth: 0 }}><div className="tt" title={s.title}>{s.title}</div><div className="meta" title={s.meta}>{s.meta}</div></div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** 화면 캡처 순환. 썸네일을 누르면 회전을 멈춘다. */
export function CapturePanel({ captures, base = 'captures/', interval = 6000 }) {
  const [i, setI] = React.useState(0);
  const [hold, setHold] = React.useState(false);
  React.useEffect(() => {
    if (hold || captures.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % captures.length), interval);
    return () => clearInterval(t);
  }, [captures.length, interval, hold]);
  const src = (c) => c.src || `${base}${c.file}`;
  const c = captures[i];
  return (
    <Panel icon={Icons.screen} title="화면" sub="실제 데이터로 동작하는 화면">
      <div className="live" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
        {c ? (<>
          <img src={src(c)} alt={`${c.journey} ${c.step} 화면`} />
          <span className="rec">화면 캡처</span>
          <span className="cnt num">{i + 1}/{captures.length}</span>
          <div className="ov"><b>{c.step}</b><small>{c.journey} · 실제 데이터로 동작</small></div>
        </>) : <div className="ov"><small>캡처 없음</small></div>}
      </div>
      {captures.length > 0 && (
        <div className="thumbs">
          {captures.map((x, k) => <button key={k} className={k === i ? 'on' : ''} onClick={() => { setI(k); setHold(true); }} aria-label={x.step}><img src={src(x)} alt="" /></button>)}
        </div>
      )}
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
  const word = (x) => (x.status === 'live' ? '완성' : x.counts.live ? `${x.counts.live}/${x.steps.length} 동작` : STATUS[x.status].word);
  return (
    <Panel icon={Icons.table} title="기능 현황" sub={`${journeys.length}개 기능`} budget="list" more={rows.length > n ? { n: rows.length - n, href: '#/journeys' } : null}>
      <div className="pb pb-table">
        <div className="rows fit" ref={ref}>
          {rows.slice(0, n).map((r) => r.fold
            ? <a key="fold" className="wt fold row" href="#/journeys"><span className="tt">완성 기능 {done.length} · 단계 {sum(done.map((x) => x.steps.length))}</span><span className="st" /><span /><span className="v" /><StepMark status="live" /></a>
            : <button key={r.j.id} className={`wt row ${r.j.id === j?.id ? 'sel' : ''}`} onClick={() => onSelect(r.j.id)}>
                <span className="tt">{r.j.title}</span><span className="st">{word(r.j)}</span>
                <Sparkline series={r.j.series} color={r.j.commits ? '#2FD3E6' : '#222B36'} width={64} height={18} />
                <span className="v">{r.j.counts.live}/{r.j.steps.length}</span><StepMark status={r.j.status} />
              </button>)}
        </div>
      </div>
      {j && (
        <div className="detail">
          <div className="hd"><b title={j.goal}>{j.title}</b><span>{j.actor}</span><em>14일 변경 {j.commits}</em><a className="open" href={`#/journeys/${j.id}`}>기능 화면 →</a></div>
          <AreaChart series={j.series} compare={series} days={days} />
          <div className="kv">
            <div>상태<b style={{ color: STATUS[j.status].color }}>{word(j)}</b></div>
            <div>단계<b>{j.counts.live}/{j.steps.length} 동작</b></div>
            <div>최근 7일<b>{j.week}</b></div>
            <div>로드맵<b title={j.roadmapItem?.title}>{j.roadmapItem ? j.roadmapItem.title : '—'}</b></div>
            <div>마일스톤<b>{j.milestone ? j.milestone.title : '마일스톤 없음'}</b></div>
          </div>
        </div>
      )}
    </Panel>
  );
}
