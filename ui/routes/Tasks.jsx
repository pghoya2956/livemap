// 작업 화면(#/tasks, #/tasks/<name>).
// 1.0.1 site/map.js의 tasksView()를 이식한다. 어휘는 "PN" → "계획 항목"으로 바꾸고,
// 상세에 tasks[].roadmapItems 기반 "추적하는 로드맵 항목"(설계 빈틈 G-02)을 더한다.
import React from 'react';
import { Screen, Card, Table, Empty, StatusChip, RoadmapTag } from './common.jsx';
import { Proj, Tag, Chip } from '../components/primitives.jsx';

const STAGES = ['스펙 초안', '검토', '스펙 확정', '계획', '실행', '검증'];
const ACTIVE = new Set(['진행', '대기']);

const stageOn = (t, st) => (
  st === '스펙 초안' ? t.spec.initial
  : st === '검토' ? t.spec.review
  : st === '스펙 확정' ? t.spec.final
  : st === '계획' ? !!t.plan
  : st === '실행' ? t.execution > 0
  : t.verification.length > 0
);

/** 파이프라인 단계 칩 6개: 통과한 단계는 초록, 아직이면 흐림. */
function Pipe({ t }) {
  return (
    <span className="tk-pipe">
      {STAGES.map((st) => <span key={st} className={`tk-stage${stageOn(t, st) ? ' on' : ''}`}>{st}</span>)}
    </span>
  );
}

/** 작업 상세: 파이프라인, 결정·계획 항목·열린 질문 등 지표, 닿는 여정, 추적하는 로드맵 항목. */
function TaskDetail({ t, roadmapById }) {
  const total = t.pnDone + t.pnOpen;
  return (
    <div className="card detail">
      <h3 className="detail-h">
        <Proj>{t.title}</Proj>
        <Tag kind={t.status}>{t.status}</Tag>
        <span className="tk-name">{t.name}</span>
      </h3>
      <Pipe t={t} />
      <div className="cols" style={{ marginTop: 10 }}>
        <div className="kv">
          <div>단계<b><Proj>{t.stage}</Proj></b></div>
          <div>결정<b>{t.dec}</b></div>
          <div>계획 항목<b>{t.pnDone}/{total}</b></div>
          <div>열린 질문<b>{t.oq}</b></div>
          <div>phase / 실행 기록<b>{t.phases} / {t.execution}</b></div>
          <div>검증 문서<b>{t.verification.map((v) => v.split('/').pop()).join(', ') || '—'}</b></div>
          <div>문서 수<b>{t.files}</b></div>
          <div>위키 출처<b>{t.wikiSources}</b></div>
          <div>마지막 변경<b>{t.last ? <>{t.last.date} {t.last.sha} <span data-text="commit">{t.last.subject}</span></> : '—'}</b></div>
        </div>
        <div>
          <h4>닿는 여정</h4>
          {t.journeys.length ? t.journeys.map((j) => (
            <div className="node" key={j.id}>
              <div className="node-n"><a href={`#/journeys/${encodeURIComponent(j.id)}`}><Proj>{j.title}</Proj></a> <StatusChip status={j.status} /></div>
              <div className="node-s">{j.steps.join(' → ')}</div>
            </div>
          )) : <Empty>여정 단계가 이 작업을 참조하지 않음</Empty>}
        </div>
        <div>
          <h4>추적하는 로드맵 항목</h4>
          {t.roadmapItems?.length ? t.roadmapItems.map((rid) => {
            const r = roadmapById.get(rid);
            return (
              <div className="node" key={rid}>
                <div className="node-n">
                  <a href={`#/roadmap/${encodeURIComponent(rid)}`}>{r ? <Proj>{r.title}</Proj> : rid}</a>
                  {r && <RoadmapTag status={r.status} />}
                </div>
              </div>
            );
          }) : <Empty>추적하는 로드맵 항목 없음</Empty>}
        </div>
      </div>
      <div className="src" style={{ marginTop: 8 }}>{t.plan || `tasks/${t.name}`}</div>
    </div>
  );
}

/** ov: overview.json, data: data.json, params: parseRoute 결과의 params({task}) */
export function Tasks({ ov, data, params }) {
  const T = data.tasks || [];
  const roadmapById = new Map((data.roadmap || []).map((r) => [r.id, r]));
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
    <Screen ov={ov} screen="tasks" nav={3} title="작업" sub="스펙 주도 작업의 단계와 상태. tasks/ 폴더에서 읽는다">
      <div className="chips tk-filter">
        <Chip on={filter === '진행·대기'} count={activeCount} onClick={() => setFilter('진행·대기')}>진행·대기</Chip>
        <Chip on={filter === '전체'} count={T.length} onClick={() => setFilter('전체')}>전체</Chip>
      </div>
      {t && <TaskDetail t={t} roadmapById={roadmapById} />}
      <Card>
        <Table head={['날짜', '작업', '파이프라인', '단계', '상태', '결정', '계획 항목', '열린 질문', '14일']}>
          {shown.map((x) => (
            <tr key={x.name} className={sel === x.name ? 'hl' : ''}>
              <td className="tk-date">{x.date}</td>
              <td><b><a href={`#/tasks/${encodeURIComponent(x.name)}`}><Proj>{x.title}</Proj></a></b></td>
              <td><Pipe t={x} /></td>
              <td><Proj>{x.stage}</Proj></td>
              <td><Tag kind={x.status}>{x.status}</Tag></td>
              <td className="tk-num">{x.dec || ''}</td>
              <td className="tk-num">{(x.pnDone + x.pnOpen) ? `${x.pnDone}/${x.pnDone + x.pnOpen}` : ''}</td>
              <td className="tk-num">{x.oq || ''}</td>
              <td className="tk-num">{x.recentCommits}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </Screen>
  );
}
