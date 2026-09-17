// 더보기 화면(#/more, #/more/<tab>[/<detail>], #/changes는 #/more/changes 별칭).
// 1.0.1 site/map.js의 changes()·more()·decisionsView()·screensView()·backendView()·testsView()·aboutView()를 이식한다.
// 어휘는 "여정"→"기능", "장면"→"단계"로 바꾸고, 첫 화면에서 옮겨온 신호·규모(about)는 SC-5 내부 용어(스캔·미분류·게이트·등급·어댑터)를
// 피해 "자료 출처"·"분류 안 됨"·"승인 대기"·"신뢰도"로 쓴다. 파일 경로는 항상 data.sources에서 읽는다.
import React from 'react';
import { Screen, Card, Table, Empty, StatusChip, kst } from './common.jsx';
import { Proj, Chip, Tag } from '../components/primitives.jsx';
import { MORE_TABS } from '../lib/route.js';
import { isNewer, readLastVisit } from '../lib/visit.js';

const TAB_LABEL = { changes: '변화', decisions: '결정', screens: '화면', backend: 'API·DB', tests: '검사', about: '이 상황판' };
const DECISION_STATUS = { current: 'live', adopted: 'live', accepted: 'live', proposed: 'mock', draft: 'mock' };
const DECISION_WORD = { current: '채택', adopted: '채택', accepted: '채택', proposed: '제안', draft: '제안', superseded: '대체됨', deprecated: '보류', archived: '보류', rejected: '반려' };
const isBot = (c) => /\[bot\]$/.test(c.author || '');

/** 검사 이름 목록. 없으면 "없음"(흐림). Journeys.jsx의 Tests와 같은 규칙. */
function TestsList({ ts }) {
  return ts && ts.length ? <>{ts.join(', ')}</> : <span className="jmuted">없음</span>;
}

/** 탭 막대. `a[href="#/more/<tab>"]` 링크라 크롤러가 그대로 따라간다. */
function TabBar({ tab }) {
  return (
    <div className="tabs" role="tablist">
      {MORE_TABS.map((id) => (
        <a key={id} role="tab" aria-selected={tab === id} className={`chip${tab === id ? ' on' : ''}`} href={`#/more/${id}`}>
          {TAB_LABEL[id]}
        </a>
      ))}
    </div>
  );
}

/** 변화 탭(#/more/changes, #/changes). 영역 필터, 최신순 정렬, 자동 커밋 숨김(기본 켬), 마지막 방문 점. */
function ChangesTab({ data }) {
  const commits = data.commits || [];
  const sorted = React.useMemo(() => [...commits].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)), [commits]);
  const lastVisit = React.useMemo(() => readLastVisit(), []);
  const [area, setArea] = React.useState('전체');
  const [hideBots, setHideBots] = React.useState(true);

  if (!commits.length) {
    return <Empty>14일 안에 커밋이 없습니다.</Empty>;
  }

  const areas = Object.entries(data.areaCounts || {}).sort((a, b) => b[1] - a[1]);
  const journeyHits = commits.filter((c) => c.journeys.length).length;
  const botCount = commits.filter(isBot).length;
  const humanCount = commits.length - botCount;
  const visible = (c) => (
    (area === '전체' || (area === '기능에 닿음' ? c.journeys.length > 0 : c.areas.includes(area)))
    && (!hideBots || !isBot(c))
  );
  const rows = sorted.filter(visible);

  return (
    <>
      <div className="chips mm-filters">
        <Chip on={area === '전체'} count={commits.length} onClick={() => setArea('전체')}>전체</Chip>
        <Chip on={area === '기능에 닿음'} count={journeyHits} onClick={() => setArea('기능에 닿음')}>기능에 닿음</Chip>
        {areas.map(([a, n]) => (
          <Chip key={a} on={area === a} count={n} onClick={() => setArea(a)}>{a}</Chip>
        ))}
        <Chip on={hideBots} count={botCount || undefined} onClick={() => setHideBots((v) => !v)}>자동 커밋 숨김</Chip>
      </div>
      <p className="jmuted mm-changes-sub">14일 {humanCount}건 · 자동 {botCount}건</p>
      <Card>
        {rows.length ? (
          <ul className="log mm-log">
            {rows.map((c) => {
              const isNewC = isNewer(c.date, lastVisit);
              return (
                <li key={c.sha} className={isNewC ? 'new' : ''}>
                  <span className="log-d">{c.sha}</span>
                  <span className="log-d">{kst(c.date)}</span>
                  <span className="log-t">
                    <div className="mm-subject" title={c.subject}>
                      {isNewC && <span className="newdot" aria-hidden="true" />}
                      <span data-text="commit">{c.subject}</span>
                      <span className="jmuted"> · {c.files}파일</span>
                    </div>
                    <div className="mm-tags">
                      {c.areas.map((a) => <span key={a} className="mm-area">{a}</span>)}
                      {c.journeys.map((x, i) => (
                        <a key={i} className="mm-jlink" href={`#/journeys/${encodeURIComponent(x.journey)}/${encodeURIComponent(x.step)}`}>
                          <Proj>{x.label}</Proj>
                        </a>
                      ))}
                    </div>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : <Empty>고른 조건에 맞는 커밋이 없습니다.</Empty>}
      </Card>
    </>
  );
}

/** 결정 탭(#/more/decisions). */
function DecisionsTab({ data }) {
  const D = data.decisions || [];
  if (!D.length) return <Empty>결정 기록이 없습니다.</Empty>;
  return (
    <Card>
      <Table head={['상태', '결정', '적용', '단계 참조']}>
        {D.map((x) => (
          <tr key={x.slug}>
            <td><StatusChip status={DECISION_STATUS[x.status] || 'planned'} /> <span className="jmuted mm-rawstatus">{DECISION_WORD[x.status] || x.status}</span></td>
            <td><b>{x.title}</b><br /><span className="src">{x.file}</span></td>
            <td className="jmuted">{x.summary}</td>
            <td className="mm-mono">{x.refs || <span className="jmuted">0</span>}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

/** 화면 탭(#/more/screens, #/more/screens/<path>). */
function ScreensTab({ data, detail }) {
  const S = data.screens || [];
  if (!S.length) return <Empty>화면 자료가 없습니다.</Empty>;
  const J = data.semantic?.journeys || [];
  const selS = detail ? S.find((s) => s.path === detail) : null;
  const missingDetail = detail && !selS;
  const withCap = J.flatMap((j) => j.steps).filter((s) => s.captureFile && (s.screens || []).length);
  const capOf = (path) => withCap.find((s) => (s.screens || []).includes(path));
  const gallery = [...new Map(withCap.map((s) => [s.captureFile, s])).values()];
  const cov = data.coverage?.screens;

  return (
    <>
      {selS && (
        <div className="card detail" aria-current="true">
          <h3 className="detail-h"><span className="mm-mono">{selS.path}</span> <StatusChip status={selS.source} /></h3>
          <div className="cols">
            <div>
              {capOf(selS.path)
                ? <img className="detail-big" src={`captures/${capOf(selS.path).captureFile}`} alt={`${selS.path} 화면`} loading="lazy" />
                : <Empty>캡처 없음</Empty>}
            </div>
            <dl className="kv">
              <dt>페이지</dt><dd className="mm-mono">{selS.file || '—'}</dd>
              <dt>연결 파일</dt><dd className="mm-mono mm-wrap">{(selS.files || []).map((f) => f.replace('web/src/', '')).join(', ') || '—'}</dd>
              <dt>목업 출처</dt><dd className="mm-mono">{(selS.mockVia || []).join(', ') || '—'}</dd>
              <dt>API</dt><dd className="mm-mono">{(selS.apis || []).join(', ') || '—'}</dd>
              <dt>검사</dt><dd className="mm-mono"><TestsList ts={selS.tests} /></dd>
              <dt>기능 단계</dt>
              <dd>
                {selS.steps?.length ? selS.steps.map((x, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <br />}
                    <a href={`#/journeys/${encodeURIComponent(x.journey)}/${encodeURIComponent(x.step)}`}><Proj>{x.label}</Proj></a>
                  </React.Fragment>
                )) : '—'}
              </dd>
              <dt>출처</dt><dd className="src">{selS.src?.file || ''}:{selS.src?.line ?? ''} {selS.src?.rule || ''}</dd>
            </dl>
          </div>
        </div>
      )}
      {missingDetail && (
        <div className="card detail" aria-current="true">
          <h3 className="detail-h"><span className="mm-mono">{detail}</span> <StatusChip status="missing" /></h3>
          <Empty>화면 자료에 없는 경로입니다. 기능 파일의 참조가 아직 라우터에 없을 수 있습니다.</Empty>
        </div>
      )}
      <Card
        title="화면"
        sub={<>{data.summary?.liveRoutes ?? 0}/{S.length} 실데이터 · 하드코딩 표시 {data.summary?.fixedRoutes ?? 0}{cov ? ` · 기능 커버 ${cov.inJourney}/${cov.total}` : ''}</>}
      >
        <Table head={['라우트', '출처', '표시값', '페이지', 'API', '기능 단계', '검사', '마지막 변경']}>
          {S.map((r) => (
            <tr key={r.path} className={detail === r.path ? 'hl' : ''}>
              <td className="mm-mono">
                <a href={`#/more/screens/${encodeURIComponent(r.path)}`}>{r.path}</a>
                {r.guarded && <span className="jmuted" title="로그인 필요"> 잠금</span>}
              </td>
              <td><StatusChip status={r.source} /></td>
              <td>{r.fixedVia?.length ? <span className="mm-fixed">하드코딩 표시값</span> : <span className="jmuted">—</span>}</td>
              <td className="mm-mono jmuted">{(r.file || '').replace('web/src/pages/', '')}</td>
              <td className="mm-mono">{(r.apis || []).join(', ')}</td>
              <td>
                {r.steps?.length ? r.steps.map((x, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <br />}
                    <a href={`#/journeys/${encodeURIComponent(x.journey)}/${encodeURIComponent(x.step)}`}><Proj>{x.label}</Proj></a>
                  </React.Fragment>
                )) : <span className="jmuted">기능에 없음</span>}
              </td>
              <td className="mm-mono"><TestsList ts={r.tests} /></td>
              <td className="mm-mono jmuted">{r.last ? `${r.last.date} ${r.last.sha}` : ''}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {gallery.length > 0 && (
        <Card title="확정 화면" sub={`캡처 ${gallery.length}장`}>
          <div className="mm-gallery">
            {gallery.map((s) => (
              <a key={s.captureFile} className="mm-thumb" href={`#/more/screens/${encodeURIComponent(s.screens[0])}`}>
                <img src={`captures/${s.captureFile}`} alt={s.label} loading="lazy" />
                <span className="mm-thumb-c"><Proj>{s.label}</Proj><span className="jmuted">{s.screens[0]}</span></span>
              </a>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/** API·DB 탭(#/more/backend). */
function BackendTab({ data }) {
  const A = data.apis || [], F = data.functions || [], M = data.migrations || [];
  if (!A.length && !F.length && !M.length) return <Empty>API·DB 자료가 없습니다.</Empty>;
  return (
    <div className="mm-grid12">
      <Card title="API" sub={`${A.length}건`} className="mm-span6">
        <Table head={['메서드', '경로', 'DB 호출', '검사', '출처']}>
          {A.map((a, i) => (
            <tr key={i}>
              <td className="mm-mono">{a.method}</td>
              <td className="mm-mono">{a.path}</td>
              <td className="mm-mono jmuted">{a.calls?.length ? a.calls.join(', ') : 'BFF 내부'}</td>
              <td className="mm-mono"><TestsList ts={a.tests} /></td>
              <td className="src">{a.src?.file || ''}:{a.src?.line ?? ''}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="DB 함수" sub={`${F.length}건 · 미호출 ${data.orphans?.functions?.length || 0}`} className="mm-span6">
        <Table head={['함수', 'BFF', '테이블', '검사']}>
          {F.map((f, i) => (
            <tr key={i}>
              <td className="mm-mono">{f.name}</td>
              <td>{f.usedByApi ? <Tag kind="live">호출</Tag> : <Tag kind="planned">내부</Tag>}</td>
              <td className="mm-mono jmuted">{(f.tables || []).join(', ') || '—'}</td>
              <td className="mm-mono"><TestsList ts={f.tests} /></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Migration" sub={`${M.length}건`} className="mm-span12">
        <Table head={['파일', '테이블', '함수', 'grant', 'RLS', '마지막 변경']}>
          {M.map((m, i) => (
            <tr key={i}>
              <td className="mm-mono">{m.file}</td>
              <td className="mm-mono jmuted">{(m.tables || []).join(', ')}</td>
              <td className="mm-mono jmuted">{(m.functions || []).join(', ')}</td>
              <td className="mm-mono">{m.grants}</td>
              <td className="mm-mono">{m.rls}</td>
              <td className="mm-mono jmuted">{m.last ? `${m.last.date} ${m.last.sha}` : ''}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/** 검사 탭(#/more/tests). */
function TestsTab({ data }) {
  const T = data.tests || [];
  const tr = data.testreport;
  if (!T.length) return <Empty>검사 자료가 없습니다.</Empty>;
  return (
    <Card
      title="검사"
      sub={<>{T.length}건{tr ? ` · 마지막 실행 ${kst(tr.at)} · ${tr.fresh ? '최신 커밋' : '이전 커밋'} · 실패 ${tr.failures}` : ' · 검사 리포트 없음(npm run test:report 실행)'}</>}
    >
      <Table head={['파일', '종류', '건수', '승인', '마지막 실행']}>
        {T.map((t) => (
          <tr key={t.file}>
            <td className="mm-mono">{t.label}</td>
            <td>{t.kind}</td>
            <td className="mm-mono">{t.count}</td>
            <td>{t.gated ? <Tag kind="planned">승인 필요</Tag> : null}</td>
            <td>
              {t.lastRun ? (
                <>
                  <Tag kind={t.lastRun.passed ? 'live' : 'fail'}>{t.lastRun.passed ? '통과' : '실패'}</Tag>
                  {!t.lastRun.fresh && <span className="jmuted"> 이전 커밋</span>}
                </>
              ) : <span className="jmuted">—</span>}
            </td>
          </tr>
        ))}
      </Table>
      {data.orphans?.tests?.length > 0 && (
        <p className="jmuted mm-fs12">화면·API·함수에 붙지 않는 검사: {data.orphans.tests.join(', ')}</p>
      )}
    </Card>
  );
}

/** 이 상황판 탭(#/more/about). 1.0.1 첫 화면의 신호 6종·규모 8종을 옮기고 SC-5 내부 용어를 피한다. */
function AboutTab({ ov, data }) {
  const S = ov.signals || {}, C = ov.counts || {};
  const O = data.orphans || {};
  const src = data.sources || {};
  const testText = S.tests === 'ok' ? `통과 ${S.lastRun?.total ?? 0}` : S.tests === 'fail' ? `실패 ${S.lastRun?.failures ?? 0}` : S.tests === 'stale' ? '이전 커밋 결과' : '리포트 없음';
  const signals = [
    { ok: S.deploy === 'ok', label: '배포', text: S.deploy === 'ok' ? '최신' : S.deploy === 'behind' ? `${S.deployBehind}커밋 미배포` : '알 수 없음' },
    { ok: S.tests === 'ok', label: '검사', text: testText },
    { ok: S.adapters === 'ok', label: '자료 출처', text: S.adapters === 'ok' ? '모두 정상' : (S.adapterNotes?.[0] || '문제 있음') },
    { ok: !S.orphans, label: '분류 안 됨', text: `화면 ${O.screens?.length || 0} · API ${O.apis?.length || 0} · DB 함수 ${O.functions?.length || 0} · 검사 ${O.tests?.length || 0}` },
    { ok: !S.gated, label: '승인 대기 검사', text: S.gated ? `${S.gated}건` : '없음' },
    { ok: !C.oq, label: '열린 질문', text: `${C.oq ?? 0}건` },
  ];
  const tiles = [
    [`${C.screensLive ?? 0}/${C.screens ?? 0}`, '실데이터 화면'],
    [C.apis ?? 0, 'API'],
    [C.functions ?? 0, 'DB 함수'],
    [C.tests ?? 0, '검사'],
    [`${C.pnDone ?? 0}/${C.pnTotal ?? 0}`, '계획 항목'],
    [C.decisions ?? 0, '확정 결정'],
    [C.proposed ?? 0, '제안 결정'],
    [C.oq ?? 0, '열린 질문'],
  ];

  return (
    <>
      <Card className="mm-prose">
        <h3>무엇을 보는가</h3>
        <p>코드가 아니라 프로젝트를 봅니다. 배우가 목표를 이루는 기능(무엇이 되는가), 스펙 주도 작업(어떻게 정하고 실행하는가), 결정(왜)이 앞에 있고 화면·API·DB는 그 주장을 뒷받침하는 증거로 뒤에 있습니다.</p>
        <h3>두 층</h3>
        <p><b>손으로 유지하는 층</b>은 기능 파일 하나입니다. 배우·목표·단계(의도, 상태, 화면, 캡처, 참조, 확인일)를 적습니다. 단계 상태가 바뀌는 병합은 같은 커밋에서 이 파일을 고칩니다.</p>
        <p><b>생성하는 층</b>은 저장소에서 자동으로 모은 자료입니다. 라우터·서버·migration·검사·작업·git·배포 매니페스트·검사 리포트를 자료 출처가 읽습니다. 생성물은 커밋하지 않고 CI와 로컬 serve가 매번 만듭니다.</p>
        <h3>신뢰</h3>
        <ul>
          <li>모든 항목에 출처(파일·줄·규칙)가 있고 상세에서 보입니다.</li>
          <li>단계 확인 신뢰도: 주장(D) → 관측(C) → 검사 있음(B) → 최신 커밋에서 검사 통과(A).</li>
          <li>어긋남(라우트 없음, 상태가 코드와 다름, 참조 미해결)은 check가 막고, 빠짐(기능에 없는 화면, 안 불리는 API, 안 붙는 검사)은 분류 안 된 항목으로 셉니다.</li>
          <li>자료 출처마다 단위 검사와 바닥값이 있어 수집이 깨지면 빈 표 대신 실패가 뜹니다.</li>
        </ul>
        <h3>단순함</h3>
        <ul>
          <li>개요 화면은 세 질문(어디까지·지금 무엇·무엇이 바뀜)만 답합니다. 1440×900에서 스크롤 없음, 패널 8 이하, 목록 패널 6행 이하, 시스템 식별자 0. Playwright 예산 검사가 지킵니다.</li>
          <li>화면 깊이 3, 상단 내비 5개. 마지막 방문 이후 생긴 변화에는 점 표시를 붙입니다.</li>
        </ul>
      </Card>

      <Card title="상태 신호">
        <div className="mm-signals">
          {signals.map((s) => (
            <div className="mm-sig" key={s.label}>
              <span className={`mm-dot${s.ok ? '' : ' warn'}`} aria-hidden="true" />
              <span className="mm-sig-l">{s.label}</span>
              <span className="jmuted">{s.text}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="규모" sub="코드에서 센 숫자">
        <div className="mm-tiles">
          {tiles.map(([v, k]) => (
            <div className="mm-tile" key={k}>
              <div className="mm-tile-v num">{v}</div>
              <div className="mm-tile-k">{k}</div>
            </div>
          ))}
        </div>
      </Card>

      {data.issues?.length > 0 && (
        <Card title="자료 이상" sub={`${data.issues.length}건`}>
          <ul className="mm-issues">
            {data.issues.map((x, i) => (
              <li key={i} className={`mm-issue ${x.level}`}>
                <b>{x.label}</b> {x.message} <span className="jmuted">({x.adapter})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="자료 출처 상태">
        <p className="src mm-wrap">{(data.adapters || []).map((a) => `${a.name}: ${a.status === 'ok' ? '정상' : '실패'}`).join(' · ')}</p>
      </Card>

      <Card className="mm-prose">
        <p>화면의 기능·단계 = 기능 정본 파일의 journey·step.</p>
        <p>사람이 적는 곳: 기능 정본 파일, 로드맵(마일스톤 포함), 작업 장부, 작업 폴더 문서.</p>
        {(src.semantic || src.roadmap) && (
          <p className="src">{[src.semantic && `기능 정본 ${src.semantic}`, src.roadmap && `로드맵 정본 ${src.roadmap}`].filter(Boolean).join(' · ')}</p>
        )}
      </Card>
    </>
  );
}

const HEAD = {
  changes: ['변화', 'main 14일. 커밋이 어느 화면·기능에 닿았는지'],
  decisions: ['더보기', '증거 층. 기능 단계에서 내려오면 여기에 닿는다'],
  screens: ['더보기', '증거 층. 기능 단계에서 내려오면 여기에 닿는다'],
  backend: ['더보기', '증거 층. 기능 단계에서 내려오면 여기에 닿는다'],
  tests: ['더보기', '증거 층. 기능 단계에서 내려오면 여기에 닿는다'],
  about: ['더보기', '증거 층. 기능 단계에서 내려오면 여기에 닿는다'],
};

/** ov: overview.json, data: data.json, params: parseRoute 결과의 params({tab, detail}) */
export function More({ ov, data, params }) {
  const tab = params.tab || 'decisions';
  const [title, sub] = HEAD[tab] || HEAD.decisions;
  return (
    <Screen ov={ov} screen="more" nav={4} title={title} sub={sub}>
      <TabBar tab={tab} />
      {tab === 'changes' && <ChangesTab data={data} />}
      {tab === 'decisions' && <DecisionsTab data={data} />}
      {tab === 'screens' && <ScreensTab data={data} detail={params.detail} />}
      {tab === 'backend' && <BackendTab data={data} />}
      {tab === 'tests' && <TestsTab data={data} />}
      {tab === 'about' && <AboutTab ov={ov} data={data} />}
    </Screen>
  );
}
