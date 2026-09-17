// 첫 화면 패널: 상단 바, 전광판, 로드맵, 진척, 최근 변경, 기능별 진척, 특보, 화면 캡처, 기능 현황.
import React from 'react';
import { Panel, Chip, Tag, Pill, Dot, Icons } from './primitives.jsx';
import { Gauge, StatusBar, Sparkline, AreaChart } from './charts.jsx';
import { STATUS, STATUS_ORDER, clock, longDate, hostOf, ago, md, sum } from '../lib/format.js';

/** 상단 바. project = { name, tagline, host }, signals = { deploy, deployBehind, warnings } */
export function TopBar({ project, signals, nav = ['개요', '기능', '로드맵', '작업', '더보기'], current = 0 }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const host = hostOf(project.host);
  return (
    <header className="top">
      <div className="brand">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15.5" fill="#0C1319" stroke="#1E2A35" /><circle cx="17" cy="17" r="9" fill="none" stroke="#2FD3E6" strokeWidth="1.5" strokeDasharray="40 17" /><circle cx="17" cy="17" r="3.2" fill="#2FD3E6" /></svg>
        <div><b>{project.name.toUpperCase()} MONITOR</b><small>{project.tagline} · 제품 상황판</small></div>
      </div>
      <nav className="nav" aria-label="화면">
        {nav.map((n, i) => <a key={n} className={i === current ? 'on' : ''} href={`#${i}`}>{n}</a>)}
      </nav>
      <div className="right">
        <Pill tone={signals.deploy === 'behind' ? 'warn' : 'good'}><Dot pulse />{signals.deploy === 'behind' ? `미배포 ${signals.deployBehind}` : '배포 최신'}</Pill>
        <Pill tone={signals.warnings ? 'warn' : 'plain'}>경고 {signals.warnings}</Pill>
        <Pill><Dot color="var(--red)" />LIVE</Pill>
        {host && <Pill href={host.href}>{host.hostname} ↗</Pill>}
      </div>
      <div className="clock"><b className="num">{clock(now)}</b><small>{longDate(now)}</small></div>
    </header>
  );
}

/** 흐르는 전광판. items = [{ label, value, delta?, trend?: 'up'|'dn'|'fl' }] */
export function Ticker({ items }) {
  const row = items.map((it, i) => (
    <span className="tk" key={i}>{it.label} <span className="num">{it.value}</span>{it.delta && <span className={`num ${it.trend || ''}`}> {it.delta}</span>}</span>
  ));
  return <div className="ticker" aria-label="주요 수치"><div className="track">{row}{row}</div></div>;
}

/** 로드맵. roadmap = [{ title, status, mode, goal, waitingOn, sceneCounts }] */
export function RoadmapPanel({ roadmap, tasks = [], at }) {
  const [filter, setFilter] = React.useState('전체');
  const active = roadmap.find((r) => r.status === '진행');
  const counts = roadmap.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
  const list = roadmap.map((r, i) => ({ ...r, i }))
    .filter((r) => filter === '전체' || r.status === filter)
    .sort((a, b) => (a.status === '완료') - (b.status === '완료') || b.i - a.i);
  return (
    <Panel icon={Icons.list} title="로드맵" sub={`${counts['완료'] || 0}/${roadmap.length} 완료`} at={at}>
      {active && (
        <div className="brief">
          <div className="av"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#F5A524" strokeWidth="1.6" strokeDasharray="42 14" /><circle cx="12" cy="12" r="3" fill="#F5A524" /></svg></div>
          <div style={{ minWidth: 0 }}>
            <div className="who">{active.title} <span className="onair"><Dot color="var(--amber)" />진행 중</span></div>
            <p>{active.goal}</p>
            <div className="chips">
              {active.mode && <Chip>{active.mode}</Chip>}
              {tasks.map((t, i) => <Chip key={i} count={t.done + t.open ? `${t.done}/${t.done + t.open}` : undefined}>작업 {t.stage}</Chip>)}
            </div>
          </div>
        </div>
      )}
      <div className="pb pb-tight">
        <div className="chips">
          {['전체', ...Object.keys(counts)].map((k) => <Chip key={k} on={filter === k} count={k === '전체' ? roadmap.length : counts[k]} onClick={() => setFilter(k)}>{k}</Chip>)}
        </div>
        <div className="rows">
          {list.map((r) => {
            const n = sum(STATUS_ORDER.map((k) => r.sceneCounts?.[k] || 0));
            const meta = [r.mode, n ? `연결 단계 ${n}` : ''].filter(Boolean).join(' · ');
            return (
              <div className="row" key={r.i}>
                <Tag kind={r.status}>{r.status}</Tag>
                <div className="body"><div className="tt">{r.title}</div><div className="meta">{r.waitingOn || meta}</div></div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/** 진척 계기. steps = { live, mock, planned, next } */
export function ProgressPanel({ steps, total, journeysLive, journeysTotal, at }) {
  const pct = total ? Math.round((steps.live / total) * 100) : 0;
  const shown = STATUS_ORDER.filter((k) => steps[k]);
  return (
    <Panel icon={Icons.gauge} title="진척" badge={<span className="pill good pill-sm">완성 기능 {journeysLive}/{journeysTotal}</span>} at={at}>
      <div className="gauge">
        <Gauge value={pct} caption="동작 단계" />
        <div>
          <div className="stats3">
            {shown.map((k) => <div className="stat" key={k}><small>{STATUS[k].word} 단계</small><b style={{ color: STATUS[k].color }}>{steps[k]}<i>/{total}</i></b></div>)}
          </div>
          <StatusBar counts={steps} />
          <div className="gnote">실제 데이터로 동작 {steps.live} · 화면만 {steps.mock} · 스펙 전 {steps.next}</div>
        </div>
      </div>
    </Panel>
  );
}

/** 최근 변경. changes = [{ date, tag, subject, journeys: [title] }] */
export function ChangesPanel({ changes, total, refIso, at }) {
  const [filter, setFilter] = React.useState('전체');
  const tags = ['전체', '기능', '수정', '화면', '배포', '문서'].filter((k) => k === '전체' || changes.some((c) => c.tag === k));
  return (
    <Panel icon={Icons.clock} title="최근 변경" sub={`14일 ${total}건`} at={at}>
      <div className="pb pb-top">
        <div className="chips">{tags.map((k) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{k}</Chip>)}</div>
        <div className="rows rows-gap">
          {changes.filter((c) => filter === '전체' || c.tag === filter).slice(0, 14).map((c, i) => (
            <div className="row" key={i}>
              <Tag kind={c.tag}>{c.tag}</Tag>
              <div className="body">
                <div className="tt" title={c.subject}>{c.subject}</div>
                <div className="meta">{ago(c.date, refIso)}{c.journeys.length ? ` · ${c.journeys.slice(0, 2).join(', ')}${c.journeys.length > 2 ? ` 외 ${c.journeys.length - 2}` : ''}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** 기능별 진척(변경 많은 순). */
export function FeatureTrendPanel({ journeys, selected, onSelect, at }) {
  const sorted = [...journeys].sort((a, b) => b.commits - a.commits);
  return (
    <Panel icon={Icons.trend} title="기능별 진척" sub="14일 변경 추이" at={at}>
      <div className="pb">
        {sorted.map((j) => (
          <button key={j.id} className={`mk ${j.id === selected ? 'sel' : ''}`} onClick={() => onSelect(j.id)}>
            <div style={{ minWidth: 0 }}><div className="tt">{j.title}</div><div className="meta">{j.actor} · {j.lane}</div></div>
            <Sparkline series={j.series} color={j.commits ? '#E5484D' : '#39424D'} />
            <div className="v">
              <b style={{ color: STATUS[j.status]?.color }}>{j.counts.live}/{j.steps.length}</b>
              <span className={j.week ? 'up' : 'fl'}>{j.week ? `▲ ${j.week}` : '변경 없음'}</span>
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** 특보: 결정 대기, 미완성 기능, 변경이 많았던 날, 최근 배포. */
export function SignalsPanel({ roadmap, journeys, activity, changes, refIso, at }) {
  const sigs = [];
  roadmap.filter((r) => r.waitingOn && r.status !== '완료').forEach((r) => sigs.push({ kind: '결정 대기', title: r.title, text: r.waitingOn }));
  journeys.filter((j) => j.status !== 'live').forEach((j) => sigs.push({ kind: `${STATUS[j.status].word} 기능`, title: j.title, text: `${STATUS[j.status].word} ${j.steps.length}단계${j.milestone ? ` · 로드맵 ${j.milestone.title}` : ''}` }));
  const hot = activity.days.map((d, i) => ({ d, i, n: activity.total[i] })).filter((x) => x.n).slice(-4).reverse();
  const deploys = changes.filter((c) => c.tag === '배포').slice(0, 4);
  const [first, ...rest] = sigs;
  return (
    <Panel icon={Icons.alert} title="특보" badge={<Tag kind="mock">{sigs.length}</Tag>} at={at}>
      <div className="pb">
        {first && (<><div className="sect">기능 특보</div><div className="alert"><div className="h"><Tag kind="mock">{first.kind}</Tag>{first.title}</div><p>{first.text}</p></div></>)}
        <div className="rows rows-gap">
          {rest.map((s, i) => <div className="sig" key={i}><span className={`mag ${s.kind.startsWith('목업') ? 'warm' : ''}`}>{s.kind.slice(0, 2)}</span><div style={{ minWidth: 0 }}><div className="tt">{s.title}</div><div className="meta">{s.text}</div></div></div>)}
        </div>
        <div className="sect">변경이 많았던 날</div>
        <div className="rows">
          {hot.map((x) => <div className="sig" key={x.d}><span className={`mag ${x.n >= 50 ? 'hot' : x.n >= 20 ? 'warm' : ''}`}>{x.n}</span><div><div className="tt">{md(x.d)} 변경 {x.n}건</div><div className="meta">제품 코드 {activity.runtime[x.i]} · 배포 {activity.deploy[x.i]}</div></div></div>)}
        </div>
        {deploys.length > 0 && (<><div className="sect">최근 배포</div><div className="rows">
          {deploys.map((c, i) => <div className="sig" key={i}><span className="mag mag-cyan">↑</span><div style={{ minWidth: 0 }}><div className="tt">{c.subject}</div><div className="meta">{ago(c.date, refIso)}</div></div></div>)}
        </div></>)}
      </div>
    </Panel>
  );
}

/** 화면 캡처 순환. captures = [{ src, journey, step }] */
export function CapturePanel({ captures, interval = 6000 }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (captures.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % captures.length), interval);
    return () => clearInterval(t);
  }, [captures.length, interval]);
  const c = captures[i];
  return (
    <Panel icon={Icons.screen} title="화면" sub="실제 데이터로 동작하는 화면">
      <div className="live">
        {c ? (<>
          <img src={c.src} alt={`${c.journey} ${c.step} 화면`} />
          <span className="rec"><Dot pulse />LIVE</span>
          <span className="cnt num">{i + 1}/{captures.length}</span>
          <div className="ov"><b>{c.step}</b><small>{c.journey} · 실제 데이터로 동작</small></div>
        </>) : <div className="ov"><small>캡처 없음</small></div>}
      </div>
      <div className="thumbs">
        {captures.map((x, k) => <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={x.step}><img src={x.src} alt="" /></button>)}
      </div>
    </Panel>
  );
}

/** 기능 현황 표와 선택 기능 상세. */
export function FeatureTablePanel({ journeys, activity, selected, onSelect }) {
  const j = journeys.find((x) => x.id === selected) || journeys[0];
  const color = { live: '#2FD3E6', mock: '#F5A524', next: '#A48DFF', planned: '#8C98A5' };
  return (
    <Panel icon={Icons.table} title="기능 현황" sub={`${journeys.length}개 기능`}>
      <div className="pb pb-table">
        {journeys.map((x) => (
          <button key={x.id} className={`wt ${x.id === j.id ? 'sel' : ''}`} onClick={() => onSelect(x.id)}>
            <span className="tt">{x.title}</span>
            <span className="st">{x.status === 'live' ? '완성' : STATUS[x.status].word}</span>
            <Sparkline series={x.series} color={color[x.status]} width={64} height={18} />
            <span className="v">{x.counts.live}/{x.steps.length}</span>
            <span className="sd" style={{ background: STATUS[x.status]?.color }} />
          </button>
        ))}
      </div>
      {j && (
        <div className="detail">
          <div className="hd"><b title={j.goal}>{j.title}</b><span>{j.actor}</span><em>14일 변경 {j.commits}</em></div>
          <AreaChart series={j.series} compare={activity.total} days={activity.days} />
          <div className="kv">
            <div>상태<b style={{ color: STATUS[j.status].color }}>{j.status === 'live' ? '완성' : STATUS[j.status].word}</b></div>
            <div>단계<b>{j.counts.live}/{j.steps.length} 동작</b></div>
            <div>최근 7일<b>{j.week}</b></div>
            <div>로드맵<b>{j.milestone ? j.milestone.title : '—'}</b></div>
          </div>
        </div>
      )}
    </Panel>
  );
}
