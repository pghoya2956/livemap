// 기능 화면(#/journeys, #/journeys/<id>, #/journeys/<id>/<step>).
// 1.0.1 site/map.js의 journeys()·stepDetail()을 이식한다. 어휘는 "여정"→"기능", "장면"→"단계"로 바꾼다.
import React from 'react';
import { Screen, Empty, StatusChip, kst } from './common.jsx';
import { StepMark, Proj } from '../components/primitives.jsx';
import { StatusBar } from '../components/charts.jsx';
import { STATUS, journeyWord, journeyMark } from '../lib/format.js';

const CAP = 'captures/';
const GRADE_TITLE = 'D 주장 / C 관측 / B 검사 존재 / A 최신 커밋 통과';

const taskTitle = (tasks, name) => (tasks.find((t) => t.name === name) || { title: name }).title;

/** 검사 이름 목록. 없으면 "없음"(흐림). */
function Tests({ ts }) {
  return ts && ts.length ? <>{ts.join(', ')}</> : <span className="jmuted">없음</span>;
}

/** 기능 카드: 제목·상태, 배우·목표, 상태 막대, 단계 칩, 관련 스펙. */
function JourneyCard({ j, actors, tasks }) {
  const specs = j.taskNames.map((n) => taskTitle(tasks, n));
  return (
    <a className="jcard" href={`#/journeys/${encodeURIComponent(j.id)}`}>
      <div className="jcard-hd">
        <span><Proj>{j.title}</Proj></span>
        <span className="schip"><StepMark status={journeyMark(j)} />{journeyWord(j)}</span>
      </div>
      <div className="jcard-meta"><Proj>{actors[j.actor] || j.actor}</Proj> · <Proj>{j.goal}</Proj></div>
      <StatusBar counts={j.counts} />
      <div className="jsteps">
        {j.steps.map((s) => (
          <span className="jstep" key={s.id} title={STATUS[s.status]?.word || s.status}>
            <StepMark status={s.status} size={10} /><Proj>{s.label}</Proj>
          </span>
        ))}
      </div>
      {specs.length > 0 && <div className="jcard-specs">스펙: <Proj>{specs.join(' · ')}</Proj></div>}
    </a>
  );
}

/** 스토리보드 장면 카드: 번호, 캡처, 이름, 상태, 등급, 배우, 의도, 경고(첫 줄만). */
function Scene({ j, s, i, actors, selected }) {
  const shot = s.status === 'next' ? '다음 스펙' : s.status === 'planned' ? '아직 화면 없음' : '캡처 없음';
  return (
    <a className={`scene${s.status === 'next' ? ' next' : ''}${selected ? ' on' : ''}`} href={`#/journeys/${encodeURIComponent(j.id)}/${encodeURIComponent(s.id)}`}>
      <span className="scene-num">{i + 1}</span>
      <div className="scene-shot">
        {s.captureFile ? <img src={`${CAP}${s.captureFile}`} alt={`${s.label} 화면`} loading="lazy" /> : <span>{shot}</span>}
      </div>
      <div className="scene-body">
        <div className="scene-l">
          <span><Proj>{s.label}</Proj></span>
          <StatusChip status={s.status} />
          {s.grade && <span className="scene-grade" title={GRADE_TITLE}>등급 {s.grade}</span>}
        </div>
        <div className="scene-actor">{(actors[s.actor] || s.actor) ? <Proj>{actors[s.actor] || s.actor}</Proj> : null}</div>
        <div className="scene-intent">{(s.intent || s.note) ? <Proj>{s.intent || s.note}</Proj> : null}</div>
        {s.warnings.length > 0 && <div className="scene-warn">⚠ {s.warnings[0].replace(/장면/g, '단계')}</div>}
      </div>
    </a>
  );
}

/** 단계 상세: 캡처·확인일, 화면·API→DB 함수·테이블, 근거·계획, 최근 커밋. */
function StepDetail({ data, j, s, actors, tasks }) {
  const idx = j.steps.findIndex((x) => x.id === s.id) + 1;
  const actor = actors[s.actor] || s.actor || '';
  return (
    <div className="card detail">
      <h3 className="detail-h">
        <span className="num">{idx}</span>
        <Proj>{s.label}</Proj>
        <StatusChip status={s.status} />
        {s.grade && <span className="detail-grade" title={GRADE_TITLE}>등급 {s.grade}</span>}
        <span className="detail-sub">{actor && <Proj>{actor}</Proj>}{s.intent ? <> · <Proj>{s.intent}</Proj></> : null}</span>
      </h3>
      {s.note && <p className="detail-note"><Proj>{s.note}</Proj></p>}
      {s.warnings.length > 0 && (
        <p className="detail-warn">{s.warnings.map((w, i) => <React.Fragment key={i}>{i > 0 && <br />}{w.replace(/장면/g, '단계')}</React.Fragment>)}</p>
      )}
      <div className="cols">
        <div>
          {s.captureFile
            ? <img className="detail-big" src={`${CAP}${s.captureFile}`} alt={`${s.label} 확정 화면`} loading="lazy" />
            : <Empty>캡처 없음</Empty>}
          <div className="src" style={{ marginTop: 6 }}>확인일 {s.reviewedAt || '—'} · {data.sources?.semantic || ''}</div>
        </div>
        <div>
          <h4>화면</h4>
          {s.screenNodes.length ? s.screenNodes.map((n, i) => {
            const line = [(n.file || '').replace('web/src/', '')];
            if (n.mockVia?.length) line.push(`목업: ${n.mockVia.join(', ')}`);
            if (n.fixedVia?.length) line.push(`하드코딩 표시값: ${n.fixedVia.join(', ')}`);
            if (n.last) line.push(`${n.last.date} ${n.last.sha}`);
            return (
              <div className="node" key={i}>
                {/* 화면 목록에 없는 경로(missing)는 갈 상세가 없어 링크로 두지 않는다 */}
                <div className="node-n">{n.source === "missing" ? <span>{n.path}</span> : <a href={`#/more/screens/${encodeURIComponent(n.path)}`}>{n.path}</a>} <StatusChip status={n.source} /></div>
                <div className="node-s">{line.filter(Boolean).join(' · ')}</div>
                <div className="node-s">검사: <Tests ts={n.tests} /></div>
              </div>
            );
          }) : <Empty>연결된 화면 없음</Empty>}
          <h4>API → DB 함수 → 테이블</h4>
          {s.apiNodes.length ? s.apiNodes.map((a, i) => (
            <div className="node" key={i}>
              <div className="node-n">{a.method} {a.path}{a.missing && <span className="jwarn-inline">BFF에 없음</span>}</div>
              <div className="node-s">{a.calls.length ? a.calls.join(', ') : 'BFF 내부 처리'} · 검사: <Tests ts={a.tests} /></div>
            </div>
          )) : <Empty>호출 API 없음</Empty>}
          {s.functionNodes.map((f, i) => (
            <div className="node" key={i}>
              <div className="node-n">fn {f.name}</div>
              <div className="node-s">테이블: {f.tables.join(', ') || '—'} · 검사: <Tests ts={f.tests} /></div>
            </div>
          ))}
        </div>
        <div>
          <h4>근거·계획</h4>
          {s.refNodes.length ? s.refNodes.map((r, i) => (
            <div className="node" key={i}>
              <div className="node-n">
                <span className="refbadge">{r.ref}</span>
                {r.task ? <a href={`#/tasks/${encodeURIComponent(r.task)}`}><Proj>{taskTitle(tasks, r.task)}</Proj></a>
                  : r.wiki ? <><a href="#/more/decisions"><Proj>{r.wiki.title}</Proj></a> <span className="jmuted">{r.wiki.status}</span></>
                    : <span className="jmuted">문서 미연결</span>}
              </div>
              {r.file ? <div className="src">{r.file}</div> : r.wiki ? <div className="src">{r.wiki.file}</div> : null}
            </div>
          )) : <Empty>참조 없음</Empty>}
          <h4>최근 이 단계에 닿은 커밋</h4>
          {s.recentCommits.length ? (
            <ul className="log">
              {s.recentCommits.map((c) => (
                <li key={c.sha}>
                  <span className="log-d">{c.sha}</span>
                  <span className="log-d">{kst(c.date)}</span>
                  <span className="log-t" title={c.subject}><span data-text="commit">{c.subject}</span></span>
                </li>
              ))}
            </ul>
          ) : <Empty>14일 안에 없음</Empty>}
        </div>
      </div>
    </div>
  );
}

/** ov: overview.json, data: data.json, params: parseRoute 결과의 params({journey, step}) */
export function Journeys({ ov, data, params }) {
  const J = data.semantic.journeys;
  const actors = data.semantic.actors || {};
  const tasks = data.tasks || [];
  const jid = params.journey, sid = params.step;

  if (!jid) {
    return (
      <Screen ov={ov} screen="journeys" nav={1} title="기능" sub="배우가 목표를 이루는 흐름. 단계를 누르면 화면·API·DB·검사·결정·작업으로 내려간다">
        <div className="jcards">
          {J.map((j) => <JourneyCard key={j.id} j={j} actors={actors} tasks={tasks} />)}
        </div>
      </Screen>
    );
  }

  const j = J.find((x) => x.id === jid);
  if (!j) {
    return (
      <Screen ov={ov} screen="journeys" nav={1} title="기능">
        <Empty>없는 기능입니다.</Empty>
      </Screen>
    );
  }
  const step = sid ? j.steps.find((x) => x.id === sid) : null;

  return (
    <Screen ov={ov} screen="journeys" nav={1} title={<Proj>{j.title}</Proj>} sub={<Proj>{j.goal}</Proj>}>
      <p className="jback"><a href="#/journeys">← 기능 목록</a></p>
      <div className="jhead">
        <span className="schip"><StepMark status={journeyMark(j)} />{journeyWord(j)}</span>
        <span className="jhead-actor"><Proj>{actors[j.actor] || j.actor}</Proj></span>
      </div>
      <div className="board">
        {j.steps.map((s, i) => <Scene key={s.id} j={j} s={s} i={i} actors={actors} selected={step?.id === s.id} />)}
      </div>
      {step ? <StepDetail data={data} j={j} s={step} actors={actors} tasks={tasks} /> : <Empty>단계를 고르면 상세가 여기 나옵니다.</Empty>}
    </Screen>
  );
}
