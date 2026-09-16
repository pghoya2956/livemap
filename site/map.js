(async function(){
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const glyph = { live: '●', mock: '◐', mixed: '◐', partial: '◐', planned: '○', next: '○', static: '–', missing: '?' };
  const word = { live: '동작', mock: '목업', mixed: '혼합', partial: '일부 동작', planned: '미착수', next: '다음 스펙', static: '정적', missing: '라우트 없음' };
  const chip = (s) => `<span class="chip c-${esc(s)}"><span class="g">${glyph[s] || ''}</span> ${word[s] || esc(s)}</span>`;
  const kst = (iso, withTime = true) => iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }) : '';
  const mmdd = (iso) => { const d = new Date(iso); const p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }).formatToParts(d); return `${p.find((x) => x.type === 'month').value}.${p.find((x) => x.type === 'day').value}`; };
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const plain = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const BASE = '/map/';
  const load = async (name) => { const r = await fetch(`${BASE}data/${name}.json`, { cache: 'no-store' }); if (!r.ok) throw new Error(`data/${name}.json ${r.status}`); return r.json(); };
  let O = null, D = null;
  const getO = async () => O || (O = await load('overview'));
  const getD = async () => D || (D = await load('data'));

  // 마지막 방문(브라우저 안에서만 기억)
  let lastVisit = null; try { lastVisit = localStorage.getItem('map:lastVisit'); } catch {}
  const isNew = (iso) => lastVisit && iso && iso > lastVisit;
  const stampVisit = () => { try { localStorage.setItem('map:lastVisit', new Date().toISOString()); } catch {} };

  const views = [['overview', '개요'], ['roadmap', '로드맵'], ['journeys', '여정'], ['tasks', '작업'], ['more', '더보기']];
  $('nav').innerHTML = views.map(([id, label]) => `<a href="#/${id}" data-v="${id}">${esc(label)}</a>`).join('');
  const setHead = (t, sub, meta) => { $('title').textContent = t; $('subtitle').textContent = sub || ''; $('meta').innerHTML = meta || ''; };
  const statusChip = (st) => `<span class="chip ${st === '진행' ? 'c-live' : st === '대기' ? 'c-mock' : st === '폐기' ? 'c-red' : st === '완료' ? 'c-navy' : 'c-planned'}">${esc(st)}</span>`;
  const rmClass = { 완료: 'c-navy', 진행: 'c-live', 다음: 'c-mock', 대기: 'c-planned', 이후: 'c-planned off' };
  const rmChip = (st) => `<span class="chip ${rmClass[st] || 'c-red'}">${esc(st || '상태 없음')}</span>`;
  const pbar = (counts, total) => `<div class="pbar">${['live', 'mock', 'planned'].map((k) => `<i class="${k}" data-w="${(counts[k] || 0) / total * 100}"></i>`).join('')}</div>`;

  // ---------- 개요(첫 화면): overview.json만 읽는다. 식별자 없음 ----------
  const overview = async () => {
    const o = await getO();
    $('brandName').textContent = `${o.project?.name || ''} 상황판`;
    document.title = `${o.project?.name || ''} 상황판`;
    $('brandSha').textContent = `${kst(o.headDate)} 기준`;
    $('sideFoot').innerHTML = `생성 ${esc(kst(o.generatedAt))}<br>손으로 유지: 여정 파일 하나<br>나머지: 저장소 스캔`;
    setHead('개요', '어디까지 됐나 · 지금 무엇을 하나 · 무엇이 바뀌었나');
    const S = o.signals, C = o.counts;
    const newCommits = o.recent.filter((c) => isNew(c.date)).length;
    const lanes = [...new Set(o.journeys.map((j) => j.lane))];
    const light = (k, label, text) => `<div><span class="light ${k}"></span>${esc(label)} <span class="dim">${esc(text)}</span></div>`;
    const testText = S.tests === 'ok' ? `통과 ${S.lastRun.total}` : S.tests === 'fail' ? `실패 ${S.lastRun.failures}` : S.tests === 'stale' ? '이전 커밋 결과' : '리포트 없음';
    return `
      <div class="ticker"><span class="l">${esc(o.line)}</span><div class="s">${lastVisit ? `<span>마지막 방문 이후 여정 커밋 ${newCommits}</span>` : ''}<span><span class="light ${S.deploy}"></span>배포</span><span><span class="light ${S.tests}"></span>검사</span><span><span class="light ${S.adapters}"></span>스캔</span><span><span class="light ${S.warnings ? 'fail' : 'ok'}"></span>경고 ${S.warnings}</span></div></div>
      <div class="grid">
        <section class="panel span7" data-budget="matrix"><h2>여정 <b>어디까지 됐나</b> <span class="r dim">장면 ${C.stepsLive}/${C.stepsTotal} 동작 · 등급 A ${C.grades.A} B ${C.grades.B}</span></h2>
          ${lanes.map((lane) => `<div class="lane-h">${esc(lane)}</div>${o.journeys.filter((j) => j.lane === lane).map((j) => `<a class="jrow" href="#/journeys/${esc(j.id)}"><span class="t">${esc(j.title)}</span><span class="a">${esc(j.actor)}</span><span class="dots">${j.steps.map((s) => `<span class="dot ${esc(s.status)} ${s.warn ? 'warn' : ''}" title="${esc(word[s.status])}${s.grade ? ' · 등급 ' + s.grade : ''}"><span class="g">${glyph[s.status]}</span>${esc(s.label)}</span>`).join('')}</span><span>${chip(j.status)}</span></a>`).join('')}`).join('')}
        </section>
        <section class="panel span5" data-budget="list"><h2>작업 <b>지금 무엇을 하나</b> <span class="r"><a href="#/tasks">전체</a></span></h2>
          <div class="rows">${o.tasks.map((t) => `<a class="row r-task" href="#/tasks/${esc(t.id)}"><span class="t">${esc(t.title)}</span><span class="dim fs115">${esc(t.stage)}</span><span>${statusChip(t.status)}</span><span class="g dim">${t.pnDone + t.pnOpen ? `PN ${t.pnDone}/${t.pnDone + t.pnOpen}` : ''}${t.oq ? ` Q${t.oq}` : ''}</span></a>`).join('')}</div>
          <h2 class="mt8">로드맵 <b>다음 차례</b> <span class="r"><a href="#/roadmap">완료 ${o.roadmapDone}/${o.roadmapTotal}</a></span></h2>
          <div class="rows">${o.roadmap.map((m) => `<a class="row r-road" href="#/roadmap/${esc(m.id)}"><span>${rmChip(m.status)}</span><span class="t">${esc(m.title)}</span><span class="dim fs115">${esc(m.mode)}</span><span class="dim fs115">${m.waiting ? '결정 대기' : ''}</span></a>`).join('') || '<div class="row r-next"><span class="t dim">로드맵 없음</span></div>'}</div>
        </section>
        <section class="panel span4" data-budget="list"><h2>변화 <b>무엇이 바뀌었나</b> <span class="r"><a href="#/more/changes">14일 전체</a></span></h2>
          <div class="bars">${o.areas.slice(0, 5).map(([a, n]) => `<div class="bar"><span>${esc(a)}</span><i data-w="${Math.round(n / o.areas[0][1] * 100)}"></i><b>${n}</b></div>`).join('')}</div>
          <div class="rows mt8">${o.recent.slice(0, 3).map((c) => `<div class="row r-recent ${isNew(c.date) ? 'new' : ''}"><span class="g dim fs11">${esc(mmdd(c.date))}</span><span class="t" title="${esc(c.subject)}">${esc(c.subject)} <span class="dim">· ${esc(c.scenes[0] || '')}</span></span></div>`).join('')}</div>
        </section>
        <section class="panel span4" data-budget="list"><h2>상태 <b>신호</b></h2>
          <div class="lights">${light(S.deploy, '배포', S.deploy === 'ok' ? '최신' : S.deploy === 'behind' ? `${S.deployBehind} 커밋 미배포` : '알 수 없음')}${light(S.tests, '검사', testText)}${light(S.adapters, '스캔', S.adapters === 'ok' ? '어댑터 전부 정상' : S.adapterNotes[0] || '')}${light(S.orphans ? 'partial' : 'ok', '미분류', `${S.orphans}건`)}${light(S.gated ? 'partial' : 'ok', '게이트 검사', S.gated ? `${S.gated}건 미실행` : '없음')}${light(C.oq ? 'partial' : 'ok', '열린 질문', `${C.oq}건`)}</div>
          ${S.adapterNotes.length ? `<div class="dim fs115">${S.adapterNotes.map(esc).join('<br>')}</div>` : ''}
        </section>
        <section class="panel span4" data-budget="list"><h2>규모 <b>코드에서 센 숫자</b></h2>
          <div class="tiles">${[[`${C.screensLive}<small>/${C.screens}</small>`, '실데이터 화면'], [C.apis, 'API'], [C.functions, 'DB 함수'], [C.tests, '검사'], [`${C.pnDone}<small>/${C.pnTotal}</small>`, '계획 항목'], [C.decisions, '확정 결정'], [C.proposed, '제안 결정'], [C.oq, '열린 질문']].map(([v, k]) => `<div class="tile"><div class="v">${v}</div><div class="k">${esc(k)}</div></div>`).join('')}</div>
        </section>
      </div>`;
  };

  // ---------- 로드맵: tasks/roadmap.md 순서대로. 장면 상태는 여정 파일, 작업 단계는 tasks 폴더에서 온다 ----------
  const roadmapView = async (sel) => {
    const d = await getD(); const R = d.roadmap || [];
    const done = R.filter((m) => m.status === '완료').length;
    setHead('로드맵', '목업을 걷어내고 실사용 여정으로 가는 순서. 위에서부터 차례로 한다', `<span>완료 ${done}/${R.length}</span>`);
    if (!R.length) return '<p class="empty">로드맵 파일이 없거나 항목이 없습니다.</p>';
    const T = d.tasks;
    const scene = (s) => s.missing ? `<span class="chip c-red">장면 없음 ${esc(s.ref)}</span>` : `<a class="dot" href="#/journeys/${esc(s.journey)}/${esc(s.step)}" title="${esc(word[s.status] || s.status)}${s.fixed ? ' · 하드코딩 표시값' : ''}"><span class="g">${glyph[s.status] || ''}</span>${esc(s.label)}${s.fixed ? ' <span class="fixmark">고정값</span>' : ''}</a>`;
    const task = (t) => t.missing ? `<span class="chip c-red">작업 폴더 없음 ${esc(t.name)}</span>` : `<a href="#/tasks/${esc(t.name)}">${esc(t.title)}</a> <span class="dim">${esc(t.stage)}${t.pnDone + t.pnOpen ? ` · PN ${t.pnDone}/${t.pnDone + t.pnOpen}` : ''}</span>`;
    return `<div class="rm">${R.map((m) => `<article class="rm-item ${sel === m.id ? 'on' : ''} ${m.status === '완료' ? 'is-done' : ''}" id="rm-${esc(m.id)}">
        <div class="rm-num g">${m.order}</div>
        <div class="rm-body">
          <div class="rm-h"><h3>${esc(m.title)}</h3>${rmChip(m.status)}<span class="chip c-navy">${esc(m.mode || '진행 방식 없음')}</span><span class="dim fs12">장면 동작 ${m.progress.live}/${m.progress.total}${m.progress.fixed ? ` · 하드코딩 표시 장면 ${m.progress.fixed}` : ''}</span></div>
          ${m.goal ? `<p class="rm-goal">${md(m.goal)}</p>` : ''}
          ${m.problems.length ? `<p class="note warnnote">${m.problems.map(esc).join('<br>')}</p>` : ''}
          <dl class="rm-kv">
            ${m.waitingOn ? `<dt>결정 대기</dt><dd class="rm-wait">${md(m.waitingOn)}</dd>` : ''}
            ${m.done ? `<dt>완료 기준</dt><dd>${md(m.done)}</dd>` : ''}
            ${m.deps.length ? `<dt>선행</dt><dd>${m.deps.map((x) => `<a href="#/roadmap/${esc(x.id)}">${esc(x.title)}</a> ${x.status ? rmChip(x.status) : ''}`).join(' ')}</dd>` : ''}
            <dt>작업</dt><dd>${m.tasks.length ? m.tasks.map(task).join('<br>') : '<span class="dim">착수 전</span>'}</dd>
            <dt>장면</dt><dd class="rm-scenes">${m.scenes.length ? m.scenes.map(scene).join('') : '<span class="dim">연결된 장면 없음</span>'}</dd>
          </dl>
        </div></article>`).join('')}</div>
      <p class="src">정본 tasks/roadmap.md · 장면 상태는 map/semantic/journeys.json</p>`;
  };

  // ---------- 여정 ----------
  const jcard = (j, A, T) => `<a class="jcard" href="#/journeys/${esc(j.id)}"><div class="t"><span>${esc(j.title)}</span>${chip(j.status)}</div><div class="dim fs12">${esc(A[j.actor] || j.actor)} · ${esc(j.goal)}</div>${pbar(j.counts, j.steps.length)}<div class="dots">${j.steps.map((s) => `<span class="dot ${esc(s.status)}"><span class="g">${glyph[s.status]}</span>${esc(s.label)}</span>`).join('')}</div>${j.taskNames.length ? `<div class="dim fs115">스펙: ${j.taskNames.map((n) => esc((T.find((t) => t.name === n) || { title: n }).title)).join(' · ')}</div>` : ''}</a>`;
  const journeys = async (jid, sid) => {
    const d = await getD(); const J = d.semantic.journeys, A = d.semantic.actors, T = d.tasks;
    if (!jid) { setHead('여정', '배우가 목표를 이루는 흐름. 장면을 누르면 화면·API·DB·검사·결정·작업으로 내려간다'); return `<div class="jcards">${J.map((j) => jcard(j, A, T)).join('')}</div>`; }
    const j = J.find((x) => x.id === jid); if (!j) return '<p class="empty">없는 여정입니다.</p>';
    setHead(j.title, j.goal, `<span>${esc(A[j.actor] || j.actor)}</span>${chip(j.status)}`);
    const step = sid ? j.steps.find((s) => s.id === sid) : null;
    return `<p class="dim note"><a href="#/journeys">← 여정 목록</a></p>
      <div class="board">${j.steps.map((s, i) => `<a class="scene ${esc(s.status)} ${step && step.id === s.id ? 'on' : ''}" href="#/journeys/${esc(j.id)}/${esc(s.id)}"><span class="num">${i + 1}</span>
        <div class="shot">${s.captureFile ? `<img src="${BASE}captures/${esc(s.captureFile)}" alt="${esc(s.label)} 화면" loading="lazy">` : `<span>${s.status === 'next' ? '다음 스펙' : s.status === 'planned' ? '아직 화면 없음' : '캡처 없음'}</span>`}</div>
        <div class="body"><div class="l"><span>${esc(s.label)}</span>${chip(s.status)}${s.grade ? `<span class="chip c-navy" title="D 주장 / C 관측 / B 검사 존재 / A 최신 커밋 통과">등급 ${s.grade}</span>` : ''}</div><div class="dim fs11">${esc(A[s.actor] || s.actor || '')}</div><div class="intent">${esc(s.intent || s.note || '')}</div>${s.warnings.length ? `<div class="warn">⚠ ${esc(s.warnings[0])}</div>` : ''}</div></a>`).join('')}</div>
      ${step ? stepDetail(d, j, step) : '<p class="empty">장면을 고르면 상세가 여기 나옵니다.</p>'}`;
  };
  const testsText = (ts) => ts && ts.length ? esc(ts.join(', ')) : '<span class="dim">없음</span>';
  const taskLink = (T, name) => { const t = T.find((x) => x.name === name); return t ? `<a href="#/tasks/${esc(name)}">${esc(t.title)}</a>` : esc(name); };
  const stepDetail = (d, j, s) => {
    const A = d.semantic.actors, T = d.tasks, i = j.steps.indexOf(s) + 1;
    return `<div class="detail">
      <h3><span class="g dim">${i}</span> ${esc(s.label)} ${chip(s.status)} ${s.grade ? `<span class="chip c-navy">등급 ${s.grade}</span>` : ''} <span class="dim fs125 normal">${esc(A[s.actor] || s.actor || '')}${s.intent ? ' · ' + esc(s.intent) : ''}</span></h3>
      ${s.note ? `<p class="dim note">${esc(s.note)}</p>` : ''}
      ${s.warnings.length ? `<p class="note warnnote">${s.warnings.map(esc).join('<br>')}</p>` : ''}
      <div class="cols">
        <div>${s.captureFile ? `<img class="big" src="${BASE}captures/${esc(s.captureFile)}" alt="${esc(s.label)} 확정 화면" loading="lazy">` : '<div class="empty">캡처 없음</div>'}<div class="src mt6">확인일 ${esc(s.reviewedAt || '—')} · 여정 파일 map/semantic/journeys.json</div></div>
        <div>
          <h4>화면</h4>${s.screenNodes.length ? s.screenNodes.map((n) => `<div class="node"><div class="n"><a href="#/more/screens/${encodeURIComponent(n.path)}">${esc(n.path)}</a> ${chip(n.source)}</div><div class="s">${esc((n.file || '').replace('web/src/', ''))}${n.mockVia && n.mockVia.length ? ' · 목업: ' + esc(n.mockVia.join(', ')) : ''}${n.fixedVia && n.fixedVia.length ? ' · 하드코딩 표시값: ' + esc(n.fixedVia.join(', ')) : ''}${n.last ? ' · ' + esc(n.last.date) + ' ' + esc(n.last.sha) : ''}</div><div class="s">검사: ${testsText(n.tests)}</div></div>`).join('') : '<div class="empty">연결된 화면 없음</div>'}
          <h4>API → DB 함수 → 테이블</h4>${s.apiNodes.length ? s.apiNodes.map((a) => `<div class="node"><div class="n">${esc(a.method)} ${esc(a.path)}${a.missing ? ' <span class="chip c-red">BFF에 없음</span>' : ''}</div><div class="s">${a.calls.length ? esc(a.calls.join(', ')) : 'BFF 내부 처리'} · 검사: ${testsText(a.tests)}</div></div>`).join('') : '<div class="empty">호출 API 없음</div>'}
          ${s.functionNodes.map((f) => `<div class="node"><div class="n">fn ${esc(f.name)}</div><div class="s">테이블: ${esc(f.tables.join(', ')) || '—'} · 검사: ${testsText(f.tests)}</div></div>`).join('')}
        </div>
        <div>
          <h4>근거·계획</h4>${s.refNodes.length ? s.refNodes.map((r) => `<div class="node"><div class="n"><span class="chip c-navy">${esc(r.ref)}</span>${r.task ? taskLink(T, r.task) : r.wiki ? `<a href="#/more/decisions">${esc(r.wiki.title)}</a> <span class="dim">${esc(r.wiki.status)}</span>` : '<span class="dim">문서 미연결</span>'}</div>${r.file ? `<div class="src">${esc(r.file)}</div>` : r.wiki ? `<div class="src">${esc(r.wiki.file)}</div>` : ''}</div>`).join('') : '<div class="empty">참조 없음</div>'}
          <h4>최근 이 장면에 닿은 커밋</h4>${s.recentCommits.length ? `<ul class="log">${s.recentCommits.map((c) => `<li><span class="d">${esc(c.sha)}</span><span class="d">${esc(kst(c.date))}</span><span class="s"><div class="t" title="${esc(c.subject)}">${esc(c.subject)}</div></span></li>`).join('')}</ul>` : '<div class="empty">14일 안에 없음</div>'}
        </div>
      </div></div>`;
  };

  // ---------- 작업 ----------
  const tasksView = async (sel) => {
    const d = await getD(); const T = d.tasks;
    setHead('작업', '스펙 주도 작업의 단계와 상태. tasks/ 폴더에서 읽는다', `<span>진행 ${T.filter((t) => t.status === '진행').length} · 완료 ${T.filter((t) => t.status === '완료').length} · 폐기 ${T.filter((t) => t.status === '폐기').length}</span>`);
    const t = sel ? T.find((x) => x.name === sel) : null;
    const pipe = (x) => ['스펙 초안', '검토', '스펙 확정', '계획', '실행', '검증'].map((st) => { const on = st === '스펙 초안' ? x.spec.initial : st === '검토' ? x.spec.review : st === '스펙 확정' ? x.spec.final : st === '계획' ? !!x.plan : st === '실행' ? x.execution > 0 : x.verification.length > 0; return `<span class="chip ${on ? 'c-navy' : 'c-planned off'}">${st}</span>`; }).join(' ');
    const detail = t ? `<div class="detail mb12"><h3>${esc(t.title)} ${statusChip(t.status)} <span class="dim g fs12">${esc(t.name)}</span></h3><div class="mb10">${pipe(t)}</div>
      <div class="cols"><dl class="kv"><dt>단계</dt><dd>${esc(t.stage)}</dd><dt>결정</dt><dd class="g">DEC ${t.dec}</dd><dt>계획 항목</dt><dd class="g">PN ${t.pnDone}/${t.pnDone + t.pnOpen}</dd><dt>열린 질문</dt><dd class="g">${t.oq}</dd><dt>phase / 실행 기록</dt><dd class="g">${t.phases} / ${t.execution}</dd><dt>검증 문서</dt><dd class="g wrapn">${esc(t.verification.map((v) => v.split('/').pop()).join(', ')) || '—'}</dd><dt>문서 수</dt><dd class="g">${t.files}</dd><dt>위키 출처</dt><dd class="g">${t.wikiSources}</dd><dt>마지막 변경</dt><dd class="g">${t.last ? `${esc(t.last.date)} ${esc(t.last.sha)} ${esc(t.last.subject)}` : '—'}</dd></dl>
      <div><h4>닿는 여정</h4>${t.journeys.length ? t.journeys.map((j) => `<div class="node"><div class="n"><a href="#/journeys/${esc(j.id)}">${esc(j.title)}</a> ${chip(j.status)}</div><div class="s">${esc(j.steps.join(' → '))}</div></div>`).join('') : '<div class="empty">여정 장면이 이 작업을 참조하지 않음</div>'}<div class="src mt8">${esc(t.plan || 'tasks/' + t.name)}</div></div></div></div>` : '';
    return `${detail}<section class="panel"><div class="tbl"><table><thead><tr><th>날짜</th><th>작업</th><th>파이프라인</th><th>단계</th><th>상태</th><th>DEC</th><th>PN</th><th>OQ</th><th>14일</th></tr></thead><tbody>${T.map((x) => `<tr class="link ${sel === x.name ? 'hl' : ''}" data-href="#/tasks/${esc(x.name)}"><td class="mono dim">${esc(x.date)}</td><td class="wrap"><b>${esc(x.title)}</b></td><td>${pipe(x)}</td><td>${esc(x.stage)}</td><td>${statusChip(x.status)}</td><td class="mono">${x.dec || ''}</td><td class="mono">${x.pnDone + x.pnOpen ? `${x.pnDone}/${x.pnDone + x.pnOpen}` : ''}</td><td class="mono">${x.oq || ''}</td><td class="mono">${x.recentCommits}</td></tr>`).join('')}</tbody></table></div></section>`;
  };

  // ---------- 변화 ----------
  let filter = null;
  const changes = async () => {
    const d = await getD();
    setHead('변화', 'main 14일. 커밋이 어느 화면·여정에 닿았는지', `<span>${d.commits.length} 커밋</span>`);
    const areas = Object.entries(d.areaCounts).sort((a, b) => b[1] - a[1]);
    const items = d.commits.filter((c) => !filter || (filter === '여정' ? c.journeys.length : c.areas.includes(filter)));
    return `<section class="panel"><div class="filters" id="filters"><button data-a="" class="${!filter ? 'on' : ''}">전체<b>${d.commits.length}</b></button><button data-a="여정" class="${filter === '여정' ? 'on' : ''}">여정에 닿음<b>${d.commits.filter((c) => c.journeys.length).length}</b></button>${areas.map(([a, n]) => `<button data-a="${esc(a)}" class="${filter === a ? 'on' : ''}">${esc(a)}<b>${n}</b></button>`).join('')}</div>
      <ul class="log">${items.map((c) => `<li class="${isNew(c.date) ? 'new' : ''}"><span class="d">${esc(c.sha)}</span><span class="d">${esc(kst(c.date))}</span><span class="s"><div class="t" title="${esc(c.subject)}">${esc(c.subject)} <span class="dim">· ${c.files}파일</span></div><div class="tags">${c.areas.map((a) => `<span>${esc(a)}</span>`).join('')}${c.journeys.map((x) => `<span class="j"><a href="#/journeys/${esc(x.journey)}/${esc(x.step)}" class="nolink">${esc(x.label)}</a></span>`).join('')}</div></span></li>`).join('') || '<li class="empty">없음</li>'}</ul></section>`;
  };

  // ---------- 더보기: 결정·화면·API·DB·검사·이 상황판 ----------
  const more = async (tab = 'decisions', sel) => {
    const d = await getD();
    const tabs = [['changes', '변화'], ['decisions', '결정'], ['screens', '화면'], ['backend', 'API·DB'], ['tests', '검사'], ['about', '이 상황판']];
    setHead('더보기', '증거 층. 여정 장면에서 내려오면 여기에 닿는다');
    const bar = `<div class="tabs">${tabs.map(([id, l]) => `<button data-t="${id}" class="${id === tab ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
    if (tab === 'changes') return bar + await changes();
    const body = tab === 'decisions' ? decisionsView(d) : tab === 'screens' ? screensView(d, sel) : tab === 'backend' ? backendView(d) : tab === 'tests' ? testsView(d) : aboutView(d);
    return bar + body;
  };
  const decisionsView = (d) => `<section class="panel"><div class="tbl"><table><thead><tr><th>상태</th><th>결정</th><th>적용</th><th>장면 참조</th></tr></thead><tbody>${d.decisions.map((x) => `<tr><td>${chip(x.status === 'current' ? 'live' : x.status === 'proposed' ? 'mock' : 'planned')} <span class="dim g fs11">${esc(x.status)}</span></td><td class="wrap"><b>${esc(x.title)}</b><br><span class="src">${esc(x.file)}</span></td><td class="wrap dim">${esc(x.summary)}</td><td class="mono">${x.refs || '<span class="dim">0</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
  const screensView = (d, sel) => {
    const S = d.screens, J = d.semantic.journeys;
    const selS = sel ? S.find((s) => s.path === sel) : null;
    const withCap = J.flatMap((j) => j.steps).filter((s) => s.captureFile);
    const capOf = (path) => withCap.find((s) => (s.screens || []).includes(path));
    return `${selS ? `<div class="detail mb12"><h3><span class="g">${esc(selS.path)}</span> ${chip(selS.source)}</h3><div class="cols"><div>${capOf(selS.path) ? `<img class="big" src="${BASE}captures/${esc(capOf(selS.path).captureFile)}" alt="${esc(selS.path)} 화면">` : '<div class="empty">캡처 없음</div>'}</div><dl class="kv"><dt>페이지</dt><dd class="g">${esc(selS.file || '')}</dd><dt>닫힘 파일</dt><dd class="g wrapn">${esc((selS.files || []).map((f) => f.replace('web/src/', '')).join(', '))}</dd><dt>목업 출처</dt><dd class="g">${esc((selS.mockVia || []).join(', ')) || '—'}</dd><dt>API</dt><dd class="g">${esc(selS.apis.join(', ')) || '—'}</dd><dt>검사</dt><dd class="g">${testsText(selS.tests)}</dd><dt>여정</dt><dd>${selS.steps.map((x) => `<a href="#/journeys/${esc(x.journey)}/${esc(x.step)}">${esc(x.label)}</a>`).join('<br>') || '—'}</dd><dt>출처</dt><dd class="src">${esc(selS.src?.file || '')}:${esc(selS.src?.line ?? '')} ${esc(selS.src?.rule || '')}</dd></dl></div></div>` : ''}
      <section class="panel"><h2>화면 <b>${d.summary.liveRoutes}/${S.length} 실데이터</b> <span class="dim">하드코딩 표시 ${d.summary.fixedRoutes}</span> <span class="r dim">여정 커버 ${d.coverage.screens.inJourney}/${d.coverage.screens.total}</span></h2><div class="tbl"><table><thead><tr><th class="mono">라우트</th><th>출처</th><th>표시값</th><th>페이지</th><th>API</th><th>여정 장면</th><th>검사</th><th>마지막 변경</th></tr></thead><tbody>${S.map((r) => `<tr class="link ${sel === r.path ? 'hl' : ''}" data-href="#/more/screens/${encodeURIComponent(r.path)}"><td class="mono">${esc(r.path)}${r.guarded ? ' <span class="dim" title="로그인 필요">🔒</span>' : ''}</td><td>${chip(r.source)}</td><td class="fs12">${r.fixedVia.length ? '<span class="fixmark">코드 고정</span>' : '<span class="dim">—</span>'}</td><td class="mono dim">${esc((r.file || '').replace('web/src/pages/', ''))}</td><td class="mono">${esc(r.apis.join(', '))}</td><td class="wrap fs12">${r.steps.map((x) => `<a href="#/journeys/${esc(x.journey)}/${esc(x.step)}">${esc(x.label)}</a>`).join('<br>') || '<span class="dim">여정에 없음</span>'}</td><td class="mono">${testsText(r.tests)}</td><td class="mono dim">${r.last ? `${esc(r.last.date)} ${esc(r.last.sha)}` : ''}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="panel mt12"><h2>확정 화면 <b>캡처 ${new Set(withCap.map((s) => s.captureFile)).size}장</b></h2><div class="thumbs">${[...new Map(withCap.map((s) => [s.captureFile, s])).values()].map((s) => `<a class="thumb" href="#/more/screens/${encodeURIComponent(s.screens[0])}"><img src="${BASE}captures/${esc(s.captureFile)}" alt="${esc(s.label)}" loading="lazy"><div class="c"><span>${esc(s.label)}</span><span class="g dim">${esc(s.screens[0])}</span></div></a>`).join('')}</div></section>`;
  };
  const backendView = (d) => `<div class="grid">
      <section class="panel span6"><h2>API <b>${d.apis.length}</b></h2><div class="tbl"><table><thead><tr><th>메서드</th><th class="mono">경로</th><th class="mono">DB·Auth 호출</th><th>검사</th><th>출처</th></tr></thead><tbody>${d.apis.map((a) => `<tr><td class="mono">${esc(a.method)}</td><td class="mono">${esc(a.path)}</td><td class="mono">${esc(a.calls.join(', ')) || '<span class="dim">BFF 내부</span>'}</td><td class="mono">${testsText(a.tests)}</td><td class="src">${esc(a.src?.file || '')}:${esc(a.src?.line ?? '')}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="panel span6"><h2>DB 함수 <b>${d.functions.length}</b> <span class="r dim">BFF 미호출 ${d.orphans.functions.length}</span></h2><div class="tbl"><table><thead><tr><th class="mono">함수</th><th>BFF</th><th>테이블</th><th>검사</th></tr></thead><tbody>${d.functions.map((f) => `<tr><td class="mono">${esc(f.name)}</td><td>${f.usedByApi ? '<span class="chip c-live">호출</span>' : '<span class="chip c-planned">내부</span>'}</td><td class="wrap mono dim">${esc(f.tables.join(', ')) || '—'}</td><td class="mono">${testsText(f.tests)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="panel span12"><h2>Migration <b>${d.migrations.length}</b></h2><div class="tbl"><table><thead><tr><th class="mono">파일</th><th>테이블</th><th>함수</th><th>grant</th><th>RLS</th><th>마지막 변경</th></tr></thead><tbody>${d.migrations.map((m) => `<tr><td class="mono">${esc(m.file)}</td><td class="wrap mono dim">${esc(m.tables.join(', '))}</td><td class="wrap mono dim">${esc(m.functions.join(', '))}</td><td class="mono">${m.grants}</td><td class="mono">${m.rls}</td><td class="mono dim">${m.last ? `${esc(m.last.date)} ${esc(m.last.sha)}` : ''}</td></tr>`).join('')}</tbody></table></div></section></div>`;
  const testsView = (d) => `<section class="panel"><h2>검사 <b>${d.summary.tests}건</b> <span class="r dim">${d.testreport ? `마지막 실행 ${esc(kst(d.testreport.at))} · ${d.testreport.fresh ? '최신 커밋' : '이전 커밋'} · 실패 ${d.testreport.failures}` : '리포트 없음(npm run test:report)'}</span></h2><div class="tbl"><table><thead><tr><th>파일</th><th>종류</th><th>건수</th><th>게이트</th><th>마지막 실행</th></tr></thead><tbody>${d.tests.map((t) => `<tr><td class="mono">${esc(t.label)}</td><td>${esc(t.kind)}</td><td class="mono">${t.count}</td><td>${t.gated ? '<span class="chip c-planned">승인 필요</span>' : ''}</td><td>${t.lastRun ? `<span class="chip ${t.lastRun.passed ? 'c-live' : 'c-red'}">${t.lastRun.passed ? '통과' : '실패'}</span> ${t.lastRun.fresh ? '' : '<span class="dim">이전 커밋</span>'}` : '<span class="dim">—</span>'}</td></tr>`).join('')}</tbody></table></div>${d.orphans.tests.length ? `<p class="dim fs12">라우트·API·함수에 붙지 않는 검사: ${esc(d.orphans.tests.join(', '))}</p>` : ''}</section>`;
  const aboutView = (d) => `<section class="panel prose">
      <h3>무엇을 보는가</h3><p>코드가 아니라 프로젝트를 봅니다. 배우의 여정(무엇이 되는가), 스펙 주도 작업(어떻게 정하고 실행하는가), 결정(왜)이 앞에 있고 화면·API·DB는 그 주장을 뒷받침하는 증거로 뒤에 있습니다.</p>
      <h3>두 층</h3><p><b>손으로 유지하는 층</b>은 여정 파일 하나입니다. 배우·목표·장면(intent, 상태, 화면, 캡처, 참조, 확인일)을 적습니다. 장면 상태가 바뀌는 병합은 같은 커밋에서 이 파일을 고칩니다.</p><p><b>생성하는 층</b>은 저장소 스캔입니다. 라우터·서버·migration·검사·tasks·위키·git·배포 매니페스트·검사 리포트를 어댑터가 읽습니다. 생성물은 커밋하지 않고 CI와 로컬 serve가 매번 만듭니다.</p>
      <h3>신뢰</h3><ul><li>모든 노드에 출처(파일·줄·규칙)가 있고 상세에서 보입니다.</li><li>장면 등급: D 주장 / C 관측 / B 검사 존재 / A 최신 커밋에서 검사 통과.</li><li>어긋남(라우트 없음, 상태 모순, 참조 미해결)은 check가 막고, 빠짐(여정에 없는 화면, 안 불리는 API, 안 붙는 검사)은 미분류로 셉니다.</li><li>어댑터마다 단위 검사와 바닥값이 있어 스캐너가 깨지면 빈 표 대신 실패가 뜹니다.</li></ul>
      <h3>단순함</h3><ul><li>첫 화면은 세 질문(어디까지·지금 무엇·무엇이 바뀜)만. 1440×900에서 스크롤 없음, 패널 8 이하, 목록 패널 6행 이하, 시스템 식별자 0. Playwright 예산 검사가 지킵니다.</li><li>깊이 3, 내비 5. 마지막 방문 이후 변화는 빨간 점으로.</li></ul>
      <p class="src">어댑터 ${d.adapters.map((a) => `${a.name}:${a.status}`).join(' ')}</p></section>`;

  // ---------- 라우터 ----------
  const render = async () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const v = parts[0] || 'overview';
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.v === v));
    const map = { overview, roadmap: () => roadmapView(parts[1]), journeys: () => journeys(parts[1], parts[2]), tasks: () => tasksView(parts[1]), changes: () => more('changes'), more: () => more(parts[1] || 'decisions', parts[2]) };
    try { $('view').innerHTML = await (map[v] || overview)(); }
    catch (e) { $('view').innerHTML = `<p class="empty">불러오지 못했습니다: ${esc(e.message)}. 생성물(data/)이 없으면 npm run map 을 먼저 실행하세요.</p>`; }
    $('view').querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
    $('view').querySelectorAll('tr.link').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const f = $('filters'); if (f) f.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.a || null; render(); });
    $('view').querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { location.hash = `#/more/${b.dataset.t}`; }));
    if (v === 'roadmap' && parts[1]) { const it = document.getElementById(`rm-${parts[1]}`); if (it) it.scrollIntoView({ block: 'start' }); } else if (v === 'journeys' && parts[2]) { const dd = $('view').querySelector('.detail'); if (dd) dd.scrollIntoView({ block: 'nearest' }); } else window.scrollTo(0, 0);
    if (v !== 'overview') { const o = await getO(); $('brandName').textContent = `${o.project?.name || ''} 상황판`; $('brandSha').textContent = `${kst(o.headDate)} 기준`; }
  };
  window.addEventListener('hashchange', render);
  await render();
  window.addEventListener('pagehide', stampVisit);
  setTimeout(stampVisit, 60000);
})();
