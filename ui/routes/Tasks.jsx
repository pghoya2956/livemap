// 작업 화면(#/tasks, #/tasks/<name>).
// 1.0.1 site/map.js의 tasksView()를 이식한다. 어휘는 "PN" → "계획 항목"으로 바꾸고,
// 상세에 tasks[].roadmapItems 기반 "추적하는 로드맵 항목"(설계 빈틈 G-02)을 더한다.
// 1.2.0: 결정 수를 빼고(DEC-12) 열린 질문은 답이 없는 질문 수(openQuestions)를 센다. 읽기 상태가 부분·낡음·모름이면
// 값에 "?"와 이유 분류를 붙이고, 작업 상세에는 이유 문장·근거 줄과 판정을 글자로 보인다(DEC-4).
import React from 'react';
import { Screen, Card, Table, Empty, StatusChip, RoadmapTag } from './common.jsx';
import { Proj, Tag, Chip } from '../components/primitives.jsx';
import { readingText, whyText, unsure, issuesByTask, FIELD_WORD, READING_WORD, RESOLUTION_WORD } from '../lib/reading.js';

const STAGES = ['스펙 초안', '검토', '스펙 확정', '계획', '실행', '검증'];
const ACTIVE = new Set(['진행', '대기']);
const FIELDS = ['plan', 'openQuestions', 'stage'];

const stageOn = (t, st) => (
  st === '스펙 초안' ? t.spec.initial
  : st === '검토' ? t.spec.review
  : st === '스펙 확정' ? t.spec.final
  : st === '계획' ? !!t.plan
  : st === '실행' ? t.execution > 0
  : t.verification.length > 0
);

/** 1.2.0 열린 질문 수(답이 없는 질문). 읽기 상태가 없는 옛 생성물은 1.1.1 oq. */
const oqOf = (t) => (t.reading ? t.openQuestions : t.oq);

/** 파이프라인 단계 칩 6개: 통과한 단계는 초록, 아직이면 흐림. */
function Pipe({ t }) {
  return (
    <span className="tk-pipe">
      {STAGES.map((st) => <span key={st} className={`tk-stage${stageOn(t, st) ? ' on' : ''}`}>{st}</span>)}
    </span>
  );
}

/** 값 칸: 읽기 상태가 부분·낡음·모름이면 "?"와 이유 분류(글자). */
function ReadVal({ value, state, why, keep, proj }) {
  const text = readingText(value, state, { keep });
  // 단계 문자열은 프로젝트 문구라 값만 Proj로 감싸고 "?"·이유는 엔진 글자로 둔다
  const q = keep && unsure(state);
  return (
    <>
      {proj ? <><Proj>{q ? value : text}</Proj>{q ? '?' : ''}</> : text}
      {unsure(state) && why && <span className="rd-why">{why}</span>}
    </>
  );
}

/** 작업 상세의 읽기 상태: "?"·판정인 필드의 이유 문장, 그 작업에 걸린 이슈와 근거 줄, 판정 파일. */
function ReadingDetail({ t, issues }) {
  const reading = t.reading || {};
  const notes = t.readingNotes || {};
  const codes = issues.map((x) => x.code);
  const fields = FIELDS.filter((f) => unsure(reading[f]) || reading[f] === 'judged');
  const j = t.judgment;
  if (!fields.length && !issues.length && !t.judged) return <p className="rd-ok jmuted">계획 항목·열린 질문·단계를 규칙으로 모두 읽음</p>;
  return (
    <>
      {fields.length > 0 && (
        <ul className="rd-list">
          {fields.map((f) => (
            <li key={f}>
              <b>{FIELD_WORD[f]}</b>{' '}
              {reading[f] === 'judged'
                ? <Tag kind="judged">판정</Tag>
                : <><span className="rd-q">?</span> <span>{whyText(f, reading[f], { codes, task: t })}</span></>}
              {reading[f] !== 'judged' && <span className="jmuted"> · {READING_WORD[reading[f]] || reading[f]}</span>}
              {notes[f] && <div className="rd-note">{notes[f]}</div>}
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <ul className="rd-list">
          {issues.map((x, i) => (
            <li key={i} className={`rd-issue ${x.level}`}>
              <span>{x.message}</span> <span className="rd-code">{x.code}</span>
              {x.resolutions?.length > 0 && <span className="jmuted"> · 처리 {x.resolutions.map((r) => RESOLUTION_WORD[r] || r).join('·')}</span>}
              {(x.anchors || []).map((a, k) => (
                <div key={k} className="rd-note">
                  <span className="src">{a.file}{a.line != null ? `:${a.line}` : ''}</span>
                  {a.excerpt && <span className="rd-excerpt"> {a.excerpt}</span>}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      {t.judged && (
        <div className="rd-judged">
          <Tag kind="judged">판정</Tag>{' '}
          <span>{j?.by === 'human' ? '사람' : j?.by === 'agent' ? '에이전트' : j?.by || ''} 판정</span>
          {j && <span className="jmuted"> · 적용 {j.applied ?? 0} · 낡음 {j.stale ?? 0} · 무효 {j.invalid ?? 0}</span>}
          {j?.note && <div className="rd-note">{j.note}</div>}
          <div className="src">{t.judged}</div>
        </div>
      )}
    </>
  );
}

/** 작업 상세: 파이프라인, 계획 항목·열린 질문 등 지표, 읽기 상태, 닿는 여정, 추적하는 로드맵 항목. */
function TaskDetail({ t, roadmapById, issues }) {
  const total = t.pnDone + t.pnOpen;
  const r = t.reading || {};
  const codes = issues.map((x) => x.code);
  const why = (f) => whyText(f, r[f], { codes, task: t });
  const oq = oqOf(t);
  return (
    <div className="card detail">
      <h3 className="detail-h">
        <Proj>{t.title}</Proj>
        <Tag kind={t.status}>{t.status}</Tag>
        {t.judged && <Tag kind="judged">판정</Tag>}
        <span className="tk-name">{t.name}</span>
      </h3>
      <Pipe t={t} />
      <div className="cols tk-cols">
        <div className="kv">
          <div>단계<b><ReadVal value={t.stage} state={r.stage} why={why('stage')} keep proj /></b></div>
          <div>계획 항목<b><ReadVal value={`${t.pnDone}/${total}`} state={r.plan} why={why('plan')} /></b></div>
          <div>열린 질문<b><ReadVal value={oq ?? 0} state={r.openQuestions} why={why('openQuestions')} />{t.openQuestionIds?.length ? ` (${t.openQuestionIds.join(', ')})` : ''}</b></div>
          <div>phase / 실행 기록<b>{t.phases} / {t.execution}</b></div>
          <div>검증 문서<b>{t.verification.map((v) => v.split('/').pop()).join(', ') || '—'}</b></div>
          <div>문서 수<b>{t.files}</b></div>
          <div>위키 출처<b>{t.wikiSources}</b></div>
          <div>마지막 변경<b>{t.last ? <>{t.last.date} {t.last.sha} <span data-text="commit">{t.last.subject}</span></> : '—'}</b></div>
        </div>
        <div>
          <h4>닿는 기능</h4>
          {t.journeys.length ? t.journeys.map((j) => (
            <div className="node" key={j.id}>
              <div className="node-n"><a href={`#/journeys/${encodeURIComponent(j.id)}`}><Proj>{j.title}</Proj></a> <StatusChip status={j.status} /></div>
              <div className="node-s"><Proj>{j.steps.join(' → ')}</Proj></div>
            </div>
          )) : <Empty>기능 단계가 이 작업을 참조하지 않음</Empty>}
        </div>
        <div>
          <h4>추적하는 로드맵 항목</h4>
          {t.roadmapItems?.length ? t.roadmapItems.map((rid) => {
            const item = roadmapById.get(rid);
            return (
              <div className="node" key={rid}>
                <div className="node-n">
                  {item ? <a href={`#/roadmap/${encodeURIComponent(rid)}`}><Proj>{item.title}</Proj></a> : <span>{rid}</span>}
                  {item && <RoadmapTag status={item.status} />}
                </div>
              </div>
            );
          }) : <Empty>추적하는 로드맵 항목 없음</Empty>}
        </div>
      </div>
      {t.reading && (
        <div className="tk-reading">
          <h4>읽기 상태</h4>
          <ReadingDetail t={t} issues={issues} />
        </div>
      )}
      <div className="src tk-src">{t.plan || t.planFile || `tasks/${t.name}`}</div>
    </div>
  );
}

/** ov: overview.json, data: data.json, params: parseRoute 결과의 params({task}) */
export function Tasks({ ov, data, params }) {
  const T = data.tasks || [];
  const roadmapById = new Map((data.roadmap || []).map((r) => [r.id, r]));
  const byTask = React.useMemo(() => issuesByTask(data.issues), [data.issues]);
  const sel = params.task || null;
  const [filter, setFilter] = React.useState('진행·대기');

  if (!T.length) {
    return (
      <Screen ov={ov} screen="tasks" nav={3} title="작업">
        <Empty>작업 폴더가 없거나 항목이 없습니다.</Empty>
      </Screen>
    );
  }

  const activeCount = T.filter((t) => ACTIVE.has(t.status)).length;
  // 경로로 고른 작업은 필터와 무관하게 보인다(스크롤 대상이 사라지지 않게).
  const visible = (t) => filter === '전체' || ACTIVE.has(t.status) || t.name === sel;
  const shown = T.filter(visible);
  const t = sel ? T.find((x) => x.name === sel) : null;

  return (
    <Screen ov={ov} screen="tasks" nav={3} title="작업" sub="스펙 주도 작업의 단계와 상태. tasks/ 폴더에서 읽는다. ?는 읽지 못했거나 확인이 필요한 값">
      <div className="chips tk-filter">
        <Chip on={filter === '진행·대기'} count={activeCount} onClick={() => setFilter('진행·대기')}>진행·대기</Chip>
        <Chip on={filter === '전체'} count={T.length} onClick={() => setFilter('전체')}>전체</Chip>
      </div>
      {t && <TaskDetail t={t} roadmapById={roadmapById} issues={byTask.get(t.name) || []} />}
      <Card>
        <Table head={['날짜', '작업', '파이프라인', '단계', '상태', '계획 항목', '열린 질문', '14일']}>
          {shown.map((x) => {
            const r = x.reading || {};
            const codes = (byTask.get(x.name) || []).map((i) => i.code);
            const why = (f) => whyText(f, r[f], { codes, task: x });
            const total = x.pnDone + x.pnOpen;
            const oq = oqOf(x);
            return (
              <tr key={x.name} className={sel === x.name ? 'hl' : ''}>
                <td className="tk-date">{x.date}</td>
                <td><b><a href={`#/tasks/${encodeURIComponent(x.name)}`}><Proj>{x.title}</Proj></a></b></td>
                <td><Pipe t={x} /></td>
                <td><ReadVal value={x.stage} state={r.stage} why={why('stage')} keep proj /></td>
                <td><Tag kind={x.status}>{x.status}</Tag></td>
                <td className="tk-num"><ReadVal value={total ? `${x.pnDone}/${total}` : ''} state={total || unsure(r.plan) ? r.plan : 'none'} why={why('plan')} /></td>
                <td className="tk-num"><ReadVal value={unsure(r.openQuestions) ? (oq ?? 0) : (oq || '')} state={r.openQuestions} why={why('openQuestions')} /></td>
                <td className="tk-num">{x.recentCommits}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </Screen>
  );
}
