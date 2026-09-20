// 영향 패널: 고른 것이 무엇이고 무엇을 건드리는가. 초점 단계마다 담는 내용이 다르다(스펙 「화면 모델」 패널 절).
//  · 노드: 이름·파일과 줄·묶음 이름, 지나는 기능 n/<전체>, 들어오고 나가는 호출, 안에 든 것, 「이웃 펼치기」, 규칙 절
//  · 부품: 종류별 수, 지나는 기능, 들어오고 나가는 연결을 층별 건수로, 「이 부품 안으로」
//  · 묶음: 이름·노드 수·걸친 층 목록·물려받은 노드 수와 이웃 묶음
//  · 묶은 선: 그 짝의 관계별 건수와 상대 노드 목록
// 규칙 절은 선언이 없으면 어디에 적으면 위반이 여기 뜨는지 말한다.
import React from 'react';
import { Panel, Icons, Proj } from './primitives.jsx';
import { neighbors, laneName, laneMembers } from '../lib/arch.js';

const Row = ({ k, children }) => <div className="am-kv"><span className="k">{k}</span><span className="v">{children}</span></div>;
const nameOfLane = (arch, id) => laneName((arch.lanes || []).find((l) => l.id === id)) || id;

/** 규칙 절: 위반이 있으면 파일·줄 좌표, 없으면 선언 자리를 알려 준다 */
function Rules({ violations, part, dir }) {
  if (violations.length) {
    return (
      <div className="am-rules bad">
        <div className="am-sec">규칙 어긋남 {violations.length}</div>
        {violations.map((v, i) => (
          <div key={i} className="am-vio">
            <span className="code">{v.code}</span> <Proj>{v.to || v.from || ''}</Proj>
            {v.at && <span className="at">{v.at.file}:{v.at.line}</span>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="am-rules">
      <div className="am-sec">규칙</div>
      <p className="am-note">선언 없음, <code>{dir || 'map/architecture'}/{part || '<부품>'}.md</code>에 적으면 위반이 여기 뜬다</p>
    </div>
  );
}

/** 목록 한 묶음: 이름 최대 n개와 "외 k" */
function Names({ ids, max = 8, onPick }) {
  if (!ids.length) return <span className="dim">없음</span>;
  const shown = ids.slice(0, max);
  // 목록 상자가 세로 flex 라 이름들을 한 줄짜리 상자에 담아야 가운뎃점 구분자가 제 줄로 떨어지지 않는다
  return (
    <span className="am-names">
      {shown.map((id, i) => (
        <React.Fragment key={id}>
          {i > 0 && ' · '}
          {onPick ? <button type="button" className="am-link" onClick={() => onPick(id)}><Proj>{id.split('/').pop()}</Proj></button> : <Proj>{id.split('/').pop()}</Proj>}
        </React.Fragment>
      ))}
      {ids.length > max && <span className="dim"> 외 {ids.length - max}</span>}
    </span>
  );
}

/**
 * arch: architecture 절, focus: 초점, bundle: 고른 묶은 선(없으면 null)
 * flows: architecture.flows, onFlow: 기능 고르기, onFocus: 초점 바꾸기, expanded/onExpand: 「이웃 펼치기」
 */
export function ImpactPanel({ arch, focus, bundle = null, fn = null, onFocus, onFlow, expanded = false, onExpand }) {
  const dir = arch.declaration?.dir;
  const flows = arch.flows || [];
  const at = `기능 ${flows.length}개 기준`;

  if (bundle) {
    const to = bundle.to;
    const kinds = bundle.members.length;
    return (
      <Panel icon={Icons.alert} title="묶은 선" sub={`${kinds}가닥 → ${to.split('/').pop()}`} at={at} className="am-panel">
        <Row k="받는 노드"><Proj>{to}</Proj></Row>
        <Row k="가닥 수">{bundle.n}</Row>
        <div className="am-sec">보내는 노드</div>
        <div className="am-list">{bundle.members.map((m) => (
          <button key={m} type="button" className="am-link am-row" onClick={() => onFocus?.(m)}><Proj>{m}</Proj></button>
        ))}</div>
        <p className="am-note">묶은 선을 눌러도 초점은 옮기지 않는다. 여기서 상대 노드를 골라 내려간다</p>
      </Panel>
    );
  }

  if (focus?.startsWith('part:')) {
    const id = focus.slice(5);
    const c = (arch.containers || []).find((x) => x.id === id);
    if (!c) return <Panel icon={Icons.alert} title="영향" className="am-panel"><p className="empty">없는 부품입니다.</p></Panel>;
    const lanes = (arch.lanes || []).filter((l) => l.container === id);
    const laneIds = new Set(lanes.map((l) => l.id));
    const out = (arch.laneLinks || []).filter((e) => laneIds.has(e.from) && !laneIds.has(e.to));
    const into = (arch.laneLinks || []).filter((e) => !laneIds.has(e.from) && laneIds.has(e.to));
    const fl = flows.filter((f) => f.container === id);
    return (
      <Panel icon={Icons.alert} title="영향" sub={<Proj>{c.name}</Proj>} at={at} className="am-panel">
        <Row k="경계">{c.boundary || '없음'} · {c.kind === 'ours' ? '우리 코드' : '바깥 상대'}</Row>
        <Row k="종류별 수">{Object.entries(c.counts || {}).filter(([, v]) => v).map(([k, v]) => `${{ screens: '화면', files: '파일', symbols: '함수', mocks: '목업' }[k] || k} ${v}`).join(' · ') || '없음'}</Row>
        <Row k="지나는 기능">{fl.length}/{flows.length}{fl.length > 0 && <> · {fl.map((f) => <button key={f.id} type="button" className="am-link" onClick={() => onFlow?.(f.id)}><Proj>{f.name}</Proj></button>)}</>}</Row>
        <div className="am-sec">나가는 연결 (층별)</div>
        <div className="am-list">{out.length ? out.map((e) => <div key={`${e.from}>${e.to}`} className="am-row"><Proj>{nameOfLane(arch, e.from)} → {nameOfLane(arch, e.to)}</Proj><span className="n">{e.n}</span></div>) : <span className="dim">없음</span>}</div>
        <div className="am-sec">들어오는 연결 (층별)</div>
        <div className="am-list">{into.length ? into.map((e) => <div key={`${e.from}>${e.to}`} className="am-row"><Proj>{nameOfLane(arch, e.from)} → {nameOfLane(arch, e.to)}</Proj><span className="n">{e.n}</span></div>) : <span className="dim">없음</span>}</div>
        <button type="button" className="chip am-into" onClick={() => onFocus?.(`group:${lanes[0]?.id ?? id}`)} disabled={!lanes.length}>이 부품 안으로</button>
        <Rules violations={(arch.violations || []).filter((v) => (arch.modules || []).some((m) => m.container === id && m.id === v.from))} part={id} dir={dir} />
      </Panel>
    );
  }

  if (focus?.startsWith('community:')) {
    const id = Number(focus.slice(10));
    const c = (arch.communities || []).find((x) => x.id === id);
    if (!c) return <Panel icon={Icons.alert} title="영향" className="am-panel"><p className="empty">없는 묶음입니다.</p></Panel>;
    const near = (arch.communityLinks || []).filter((e) => e.from === id || e.to === id);
    const nameOf = (x) => (arch.communities || []).find((y) => y.id === x)?.name ?? String(x);
    const mods = (arch.modules || []).filter((m) => m.community === id);
    return (
      <Panel icon={Icons.alert} title="영향" sub={<Proj>{c.name}</Proj>} at={at} className="am-panel">
        <Row k="노드 수">{c.nodes}{c.inherited ? ` · 물려받은 노드 ${c.inherited}` : ''}</Row>
        <Row k="구역">{c.zone ?? '구역 없음'}</Row>
        <Row k="걸친 층">{(c.lanes || []).length ? c.lanes.map((x) => nameOfLane(arch, x)).join(' · ') : <span className="dim">층 밖</span>}</Row>
        <div className="am-sec">이웃 묶음 {near.length}</div>
        <div className="am-list">{near.slice(0, 12).map((e) => (
          <button key={`${e.from}>${e.to}`} type="button" className="am-row am-link" onClick={() => onFocus?.(`community:${e.from === id ? e.to : e.from}`)}>
            <Proj>{e.from === id ? '→' : '←'} {nameOf(e.from === id ? e.to : e.from)}</Proj><span className="n">{e.n}</span>
          </button>
        ))}{near.length > 12 && <span className="dim">외 {near.length - 12}</span>}</div>
        <div className="am-sec">안에 든 파일 {mods.length}</div>
        <div className="am-list"><Names ids={mods.map((m) => m.id)} max={10} onPick={onFocus} /></div>
      </Panel>
    );
  }

  if (focus?.startsWith('group:')) {
    const id = focus.slice(6);
    const l = (arch.lanes || []).find((x) => x.id === id);
    if (!l) return <Panel icon={Icons.alert} title="영향" className="am-panel"><p className="empty">없는 층입니다.</p></Panel>;
    const mods = (arch.modules || []).filter((m) => (m.lane ?? m.container) === id);
    const out = (arch.laneLinks || []).filter((e) => e.from === id);
    const into = (arch.laneLinks || []).filter((e) => e.to === id);
    return (
      <Panel icon={Icons.alert} title="영향" sub={<Proj>{laneName(l)}</Proj>} at={at} className="am-panel">
        <Row k="노드 수">{l.nodes}</Row>
        <Row k="부품">{l.container ? <Proj>{(arch.containers || []).find((c) => c.id === l.container)?.name ?? l.container}</Proj> : <span className="dim">부품 밖</span>}</Row>
        <div className="am-sec">나가는 연결</div>
        <div className="am-list">{out.length ? out.map((e) => <div key={e.to} className="am-row"><Proj>→ {nameOfLane(arch, e.to)}</Proj><span className="n">{e.n}</span></div>) : <span className="dim">없음</span>}</div>
        <div className="am-sec">들어오는 연결</div>
        <div className="am-list">{into.length ? into.map((e) => <div key={e.from} className="am-row"><Proj>← {nameOfLane(arch, e.from)}</Proj><span className="n">{e.n}</span></div>) : <span className="dim">없음</span>}</div>
        <div className="am-sec">안에 든 파일 {mods.length}</div>
        <div className="am-list"><Names ids={mods.map((m) => m.id)} max={10} onPick={onFocus} /></div>
      </Panel>
    );
  }

  if (!focus || focus === 'sys') {
    const c = arch.containers || [];
    return (
      <Panel icon={Icons.alert} title="영향" sub="고른 것 없음" at={at} className="am-panel">
        <p className="am-note">위 그림에서 부품이나 묶음을, 아래 그림에서 파일을 고르면 여기에 그것이 무엇을 건드리는지 선다.</p>
        <Row k="부품">{c.length} · 우리 코드 {c.filter((x) => x.kind === 'ours').length} · 바깥 상대 {c.filter((x) => x.kind !== 'ours').length}</Row>
        <Row k="파일">{(arch.modules || []).length} · 미배정 {(arch.modules || []).filter((m) => !m.container).length}</Row>
        <Row k="묶음">{(arch.communities || []).length} · 물려받은 노드 {arch.inherited ?? 0}</Row>
        <Row k="기능">{flows.length} · 끊김 {flows.filter((f) => (f.broken || []).length).length}</Row>
        <Rules violations={arch.violations || []} dir={dir} />
      </Panel>
    );
  }

  // 노드 초점. 파일이 아닌 노드(화면 경로·API·로그인·DB 함수·테이블)는 층이 실은 목록에서 이름을 얻는다
  const n = neighbors(arch, focus, fn);
  const m = (arch.modules || []).find((x) => x.id === n.id);
  const mem = m || n.symbol ? null : laneMembers(arch).get(n.id) || null;
  const kindWord = n.symbol ? '함수' : { screen: '화면 경로', api: 'API', auth: '로그인', function: 'DB 함수', table: '테이블' }[mem?.kind ?? ''] ?? '노드';
  const passing = flows.filter((f) => (f.nodes || []).some((x) => x.replace(/^module:/, '') === n.id));
  return (
    <Panel icon={Icons.alert} title="영향" sub={<Proj>{m ? n.id.split('/').pop() : mem?.label ?? n.id}</Proj>} at={at} className="am-panel">
      <Row k={m ? '파일' : kindWord}><Proj>{m ? n.id : mem?.label ?? n.id}</Proj></Row>
      <Row k="묶음">{n.communityName ? <button type="button" className="am-link" onClick={() => onFocus?.(`community:${n.community}`)}><Proj>{n.communityName}</Proj></button> : <span className="dim">묶음 없음</span>}</Row>
      <Row k="층·부품">{n.lane ? nameOfLane(arch, n.lane) : <span className="dim">층 없음</span>} · {n.container ?? <span className="dim">미배정</span>}</Row>
      <Row k="지나는 기능">{passing.length}/{flows.length}{passing.length > 0 && <> · {passing.map((f) => <button key={f.id} type="button" className="am-link" onClick={() => onFlow?.(f.id)}><Proj>{f.name}</Proj></button>)}</>}</Row>
      {!m && !n.symbol && <p className="am-note">이 노드의 이웃은 기능의 실측 선에서 읽는다. 기능을 고르면 그 길 위에서 함께 선다</p>}
      {n.symbol && !n.in.length && !n.out.length && <p className="am-note">이 함수를 부르는 곳도, 이 함수가 부르는 곳도 없다</p>}
      <div className="am-sec">나가는 호출 {n.out.length}</div>
      <div className="am-list"><Names ids={n.out} onPick={onFocus} /></div>
      <div className="am-sec">들어오는 호출 {n.in.length}</div>
      <div className="am-list"><Names ids={expanded ? n.in : n.in.slice(0, 8)} max={expanded ? 999 : 8} onPick={onFocus} /></div>
      {m && <Row k="안에 든 것">함수 {m.symbols}</Row>}
      {/* 접힌 이웃이 있을 때만 단추를 둔다. 펼칠 것이 없는데 단추가 있으면 눌러도 아무 일이 없다 */}
      {n.in.length > 8 && <button type="button" className="chip am-expand" aria-pressed={expanded} onClick={() => onExpand?.(!expanded)}>이웃 펼치기 {n.in.length - 8}</button>}
      <Rules violations={n.violations} part={n.container} dir={dir} />
    </Panel>
  );
}
