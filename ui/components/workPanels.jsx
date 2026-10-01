// 제품 축이 빈 개요의 패널 여섯(2.3.0): 저장소 표, 진행 작업 분포, 진행 중인 작업, 저장소별 변경, 장부, 결정.
// 패널 클래스는 overviewSlots 키 그대로다(예산 검사·클릭 크롤 선택자). 목록 패널은 data-budget="list"이고
// 스크롤 없이 들어가는 행만 그린 뒤 나머지는 머리줄 "외 n →"로 보낸다. n은 상한으로 잘리기 전 전체 수에서 센다(DEC-22).
import React from 'react';
import { Panel, Chip, Tag, Icons, Proj } from './primitives.jsx';
import { AreaChart } from './charts.jsx';
import { useFitRows } from '../lib/fit.js';
import { sum } from '../lib/format.js';
import { repoRows, stageCounts, workRepoFilters, ledgerHref, noteTail } from '../lib/repos.js';

const EMPTY = { tasks: [], ledger: [], decisions: [] };
/** productEmpty인데 work가 없는 자료는 세 목록을 빈 배열로 읽는다 */
const workOf = (d) => ({ ...EMPTY, ...(d.work || {}) });
const emptyRow = (text) => <div className="row static"><div className="body"><div className="tt">{text}</div></div></div>;

/** 막대 묶음. 들어가는 막대만 그리고(최대 6) 몇 개가 접혔는지 돌려준다 */
function Bars({ bars, onFit }) {
  const max = Math.max(1, ...bars.map((b) => b.n));
  const [ref, n] = useFitRows(bars.length, 24);
  React.useEffect(() => { onFit?.(n); }, [n, onFit]);
  return (
    <div className="bars fit" ref={ref}>
      {bars.slice(0, n).map((b) => (
        <div className="bar" key={b.key}>
          <span className="lb" title={b.label}><Proj>{b.label}</Proj></span>
          <span className="track"><span className="fill" style={{ width: `${Math.round((b.n / max) * 100)}%` }} /></span>
          <span className="n num">{b.n}</span>
        </div>
      ))}
    </div>
  );
}

/** 저장소 표(DEC-5·7). 워크스페이스면 행이 저장소 탭으로 가고, 단일 저장소면 프로젝트 한 행과 여정 안내 한 줄이다 */
export function RepoTablePanel({ d, at }) {
  const rows = repoRows(d);
  const ws = !!d.repos?.length;
  const [ref, n] = useFitRows(rows.length, 30);
  const cells = (r) => (<>
    <span className="nm"><b><Proj>{r.name}</Proj></b>{r.top && <span className="tag t-repo">상위</span>}</span>
    <span className="num">{r.commits}</span><span className="num">{r.running}</span>
    <span className={`st${r.warn ? ' warn' : ''}`}>{r.word}</span>
  </>);
  return (
    <Panel icon={Icons.table} title="저장소" sub={ws ? `저장소 ${rows.length} · 어긋남 ${d.signals?.reposDrift ?? 0}` : null} at={at}
      budget="list" className="repos" more={ws && rows.length > n ? { n: rows.length - n, href: '#/more/repos' } : null}>
      <div className="pb pb-tight">
        <div className="rhead"><span>저장소</span><span>14일</span><span>진행</span><span>상태</span></div>
        <div className={ws ? 'rows fit' : 'rows'} ref={ref}>
          {rows.slice(0, n).map((r) => (ws
            ? <a className="row slim" key={r.name} href="#/more/repos">{cells(r)}</a>
            : <div className="row slim static" key={r.name}>{cells(r)}</div>))}
        </div>
        {!ws && <p className="hint">여정 파일에 적으면 기능 패널로 돌아갑니다</p>}
      </div>
    </Panel>
  );
}

/** 진행 작업 분포(DEC-5): 저장소가 둘 이상이면 저장소별 진행 수와 단계 요약 한 줄, 하나면 단계별 막대 */
export function SpreadPanel({ d, at }) {
  const { tasks } = workOf(d);
  const multi = (d.repos?.length ?? 0) >= 2;
  const stages = stageCounts(tasks);
  const bars = multi ? d.repos.map((r) => ({ key: r.name, label: r.name, n: r.running ?? 0 })) : stages.map((s) => ({ key: s.stage, label: s.stage, n: s.n }));
  const [shown, setShown] = React.useState(Math.min(6, bars.length));
  const more = bars.length > shown ? { n: bars.length - shown, href: multi ? '#/more/repos' : '#/tasks' } : null;
  return (
    <Panel icon={Icons.gauge} title="진행 작업 분포" sub={`진행 ${tasks.length}`} at={at} budget="list" className="spread" more={tasks.length ? more : null}>
      <div className="pb">
        {tasks.length ? <Bars bars={bars} onFit={setShown} /> : <div className="rows">{emptyRow('진행 중인 작업이 없습니다')}</div>}
        {multi && tasks.length > 0 && <p className="sum" title={stages.map((s) => `${s.stage} ${s.n}`).join(' · ')}>단계: {stages.map((s) => `${s.stage} ${s.n}`).join(' · ')}</p>}
      </div>
    </Panel>
  );
}

/** 진행 중인 작업(DEC-10·27): 워크스페이스면 저장소 칩(제자리 필터, 0건 칩도 보임). 행은 작업 화면으로 */
export function WorkTasksPanel({ d, at }) {
  const { tasks } = workOf(d);
  const chips = workRepoFilters(d);
  const [repo, setRepo] = React.useState(null);
  const list = repo ? tasks.filter((t) => t.repo === repo) : tasks;
  const [ref, n] = useFitRows(list.length, 44);
  return (
    <Panel icon={Icons.list} title="진행 중인 작업" sub={`진행 ${tasks.length}`} at={at} budget="list" className="work-tasks"
      more={list.length > n ? { n: list.length - n, href: '#/tasks' } : null}>
      <div className="pb pb-top">
        {chips.length > 0 && (
          <div className="chips">
            {chips.map((c) => (
              <Chip key={c.repo ?? ''} on={repo === c.repo} count={c.count} onClick={() => setRepo(c.repo)} {...(c.repo ? { 'data-repo-filter': c.repo } : {})}>
                {c.repo ? <Proj>{c.label}</Proj> : c.label}
              </Chip>
            ))}
          </div>
        )}
        <div className={`rows fit${chips.length ? ' rows-gap' : ''}`} ref={ref}>
          {!list.length && emptyRow('진행 중인 작업이 없습니다')}
          {list.slice(0, n).map((t) => (
            <a className="row" key={t.id} href={`#/tasks/${encodeURIComponent(t.id)}`}>
              <span className="dt num">{t.date ? t.date.slice(5) : '—'}</span>
              <div className="body"><div className="tt" title={t.title}><Proj>{t.title}</Proj></div></div>
              {t.repo ? <span className="tag t-repo" data-repo-tag={t.repo}><Proj>{t.repo}</Proj></span> : <span />}
              <span className={`stg${t.stage === '실행' ? ' run' : ''}`}><Proj>{t.stage || '—'}</Proj></span>
              <span className="plan num">{t.pnDone + t.pnOpen ? `${t.pnDone}/${t.pnDone + t.pnOpen}` : '—'}</span>
            </a>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** 저장소별 변경(DEC-25): 저장소가 둘 이상이면 개요 repos[].commits(자동 커밋 포함) 내림차순 막대, 하나면 14일 사람 커밋 날짜 추이 */
export function RepoTrendPanel({ d, at }) {
  const multi = (d.repos?.length ?? 0) >= 2;
  const bars = multi ? d.repos.map((r, i) => ({ key: r.name, label: r.name, n: r.commits ?? 0, i })).sort((a, b) => b.n - a.n || a.i - b.i) : [];
  const [shown, setShown] = React.useState(Math.min(6, bars.length));
  const days = d.activity.days;
  return (
    <Panel icon={Icons.trend} title="저장소별 변경" sub={multi ? '14일 커밋 · 자동 포함' : '14일 사람 커밋'} at={at} budget="list" className="repo-trend"
      more={bars.length > shown ? { n: bars.length - shown, href: '#/more/repos' } : null}>
      <div className="pb">
        {multi
          ? <Bars bars={bars} onFit={setShown} />
          : <><AreaChart series={days.map((x) => x.commits)} days={days.map((x) => x.date)} /><p className="sum">14일 {sum(days.map((x) => x.commits))}건</p></>}
      </div>
    </Panel>
  );
}

/** 장부 메모: 줄이 모자라면 같은 끝 문장 규칙으로 앞을 더 버린다(DEC-18). 끝을 말줄임으로 숨기지 않는다. 전체는 title */
function NoteTail({ text }) {
  const full = [...String(text ?? '').replace(/^…/, '')].length;
  const ref = React.useRef(null);
  const [max, setMax] = React.useState(full);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    // 상자 높이는 CSS로 고정이라 너비가 바뀔 때만 다시 잰다
    const ro = new ResizeObserver(() => setMax(full)); ro.observe(el);
    return () => ro.disconnect();
  }, [full]);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.clientHeight > 1 && max > 8) setMax(Math.max(8, max - 6));
  });
  if (!text) return null;
  return <div className="note" ref={ref} title={text}><Proj>{noteTail(text, max)}</Proj></div>;
}

/** 장부(DEC-9·18·21): 진행 행. 작업 링크가 풀린 행은 작업 화면으로, 아니면 정적 행. 머리 숫자는 상한 전 전체 진행 행 수 */
export function LedgerPanel({ d }) {
  const { ledger } = workOf(d);
  const total = d.running?.length ?? ledger.length;
  const [ref, n] = useFitRows(ledger.length, 88);
  const body = (r) => (
    <div className="body">
      <div className="lg-h"><span className="tt" title={r.work}><Proj>{r.work}</Proj></span>{r.repo && <span className="tag t-repo" data-repo-tag={r.repo}><Proj>{r.repo}</Proj></span>}</div>
      <div className="meta" title={r.owner}><Proj>{r.owner}</Proj></div>
      <NoteTail text={r.note} />
    </div>
  );
  return (
    <Panel icon={Icons.clock} title="장부" sub={`진행 ${total}`} budget="list" className="ledger" more={total > Math.min(n, ledger.length) ? { n: total - Math.min(n, ledger.length), href: '#/tasks' } : null}>
      <div className="pb pb-tight">
        <div className="rows fit" ref={ref}>
          {!ledger.length && emptyRow('장부가 없습니다')}
          {ledger.slice(0, n).map((r, i) => {
            const href = ledgerHref(r);
            return href ? <a className="row" key={i} href={href}>{body(r)}</a> : <div className="row static" key={i}>{body(r)}</div>;
          })}
        </div>
      </div>
    </Panel>
  );
}

/** 결정(DEC-4·15): 제안 먼저, 행은 결정 탭으로. 머리는 확정·제안 수 */
export function DecisionsPanel({ d }) {
  const { decisions } = workOf(d);
  const total = (d.counts.decisions ?? 0) + (d.counts.proposed ?? 0);
  const [ref, n] = useFitRows(decisions.length, 30);
  const shown = Math.min(n, decisions.length);
  return (
    <Panel icon={Icons.list} title="결정" sub={`확정 ${d.counts.decisions ?? 0} · 제안 ${d.counts.proposed ?? 0}`} budget="list" className="decisions"
      more={total > shown ? { n: total - shown, href: '#/more/decisions' } : null}>
      <div className="pb pb-tight">
        <div className="rows fit" ref={ref}>
          {!decisions.length && emptyRow('결정 기록이 없습니다')}
          {decisions.slice(0, n).map((x, i) => (
            <a className="row slim" key={i} href="#/more/decisions">
              <Tag kind={x.status === 'proposed' ? '제안' : '확정'}>{x.status === 'proposed' ? '제안' : '확정'}</Tag>
              <div className="body"><div className="tt" title={x.title}><Proj>{x.title}</Proj></div></div>
              {x.repo && <span className="right"><Proj>{x.repo}</Proj></span>}
            </a>
          ))}
        </div>
      </div>
    </Panel>
  );
}
