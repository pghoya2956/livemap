// 로드맵 어댑터: tasks/roadmap.md 의 `## 제목` 절마다 milestone 노드(로드맵 항목)를 만든다. 절의 첫 문단은 목표, `- 키: 값` 목록은 속성이다.
// `## 마일스톤: 제목` 절은 release 노드(마일스톤, 1.x 임시 이름)이고, 항목의 `마일스톤` 키가 release → milestone contains 엣지가 된다.
// 순서는 파일 안 위치다. 항목 order·자동 id는 항목 절만 센다. 장면·작업·선행은 문자열로만 남기고 해석(존재 확인)은 derive·check가 한다.
// 완료일(completedAt)·결정 대기 시작일(waitingSince)은 로드맵 파일의 git 이력에서 계산한다.
const KEYS = { id: 'id', 상태: 'status', '진행 방식': 'mode', 작업: 'tasks', 장면: 'scenes', 선행: 'deps', '결정 대기': 'waitingOn', '완료 기준': 'done', 마일스톤: 'milestone' };
const RELEASE_KEYS = { id: 'id', 상태: 'status', 완료일: 'completedOn', 목표일: 'targetOn', '결정 대기': 'waitingOn' };
const LISTS = new Set(['tasks', 'scenes', 'deps']);
const RELEASE_HEAD = /^마일스톤\s*[:：]\s*(.*)$/;
const SHALLOW = '얕은 클론: 완료일·결정 대기 시작일 생략';

// 로드맵 본문 → { items, releases }. 이력의 옛 판도 같은 규칙으로 읽는다.
function parse(text) {
  const items = [], releases = [];
  for (const block of text.split(/^## /m).slice(1)) {
    const [head, ...lines] = block.split('\n');
    const rel = head.trim().match(RELEASE_HEAD);
    const keys = rel ? RELEASE_KEYS : KEYS;
    const props = rel
      ? { order: releases.length + 1, goal: '', status: '', completedOn: '', targetOn: '', waitingOn: '' }
      : { order: items.length + 1, goal: '', status: '', mode: '', tasks: [], scenes: [], deps: [], waitingOn: '', done: '', milestone: null };
    const goal = [];
    for (const line of lines) {
      const m = line.match(/^- ([^:]+):\s*(.*)$/);
      if (m && keys[m[1].trim()]) {
        const key = keys[m[1].trim()];
        const value = m[2].replace(/`/g, '').trim();
        props[key] = LISTS.has(key) ? value.split(/[,，]\s*/).map((x) => x.trim()).filter((x) => x && x !== '—') : key === 'milestone' ? value || null : value;
      } else if (!line.startsWith('- ') && line.trim()) goal.push(line.trim());
    }
    props.goal = goal.join(' ');
    const declared = props.id;
    delete props.id;
    if (rel) releases.push({ id: declared || `r${props.order}`, idMissing: !declared, title: rel[1].trim(), head, props });
    else items.push({ id: declared || `m${props.order}`, title: head.trim(), head, props });
  }
  return { items, releases };
}

// 이력 날짜: 마지막 완료 전이 커밋, 결정 대기 연속 구간의 시작 커밋(작성 시각, UTC ISO). 키는 'item:<id>'·'release:<id>'.
function historyDates(fs, cfg, file) {
  if (!fs.hasGit()) return { dates: null };
  if (fs.git('rev-parse', '--is-shallow-repository') === 'true') return { dates: null, note: SHALLOW };
  const ref = fs.resolveRef(cfg.git?.branch || 'main');
  if (!ref) return { dates: null };
  // --reverse와 --follow를 함께 주면 git이 이름 바꾸기를 따라가지 않는다(git 2.53 실측). 최신순으로 받아 뒤집는다.
  const log = fs.git('log', '--follow', '--name-only', '--format=%H|%ad', '--date=iso-strict', ref, '--', file);
  const completedAt = new Map(), waitingSince = new Map();
  let prev = new Map();
  let commit = null;
  const apply = (sha, date, path) => {
    const { items, releases } = parse(fs.git('show', `${sha}:${path}`));
    const iso = new Date(date).toISOString();
    const now = new Map([...items.map((x) => [`item:${x.id}`, x.props]), ...releases.map((x) => [`release:${x.id}`, x.props])]);
    for (const [k, p] of now) {
      const before = prev.get(k);
      if (k.startsWith('item:')) {
        if (p.status !== '완료') completedAt.delete(k);
        else if (!before || before.status !== '완료') completedAt.set(k, iso);
      }
      if (!p.waitingOn) waitingSince.delete(k);
      else if (!before || !before.waitingOn) waitingSince.set(k, iso);
    }
    for (const k of [...completedAt.keys()]) if (!now.has(k)) completedAt.delete(k);
    for (const k of [...waitingSince.keys()]) if (!now.has(k)) waitingSince.delete(k);
    prev = now;
  };
  const commits = [];
  for (const line of log.split('\n')) {
    const h = line.match(/^([0-9a-f]{40})\|(.+)$/);
    if (h) { commit = { sha: h[1], date: h[2], path: null }; commits.push(commit); continue; }
    if (commit && !commit.path && line.trim()) commit.path = line.trim();
  }
  for (const c of commits.reverse()) if (c.path) apply(c.sha, c.date, c.path);
  return { dates: { completedAt, waitingSince } };
}

export default function roadmap(g, fs, cfg) {
  const file = cfg.roadmap?.file;
  if (!file) return null;
  if (!fs.has(file)) return `로드맵 파일 없음: ${file}`;
  const text = fs.read(file);
  const { items, releases } = parse(text);
  const hist = items.length || releases.length ? historyDates(fs, cfg, file) : { dates: null };
  const d = hist.dates;
  const rule = 'roadmap:## 제목 + - 키: 값';
  const seen = new Map();
  for (const r of releases) {
    if (seen.has(r.id)) { seen.get(r.id).props.duplicates += 1; continue; }
    const waitingSince = r.props.waitingOn && d?.waitingSince.get(`release:${r.id}`) || null;
    const node = g.add('release', r.id, r.title, { ...r.props, idMissing: r.idMissing, duplicates: 0, waitingSince }, { file, line: fs.lineOf(text, `## ${r.head}`), rule: 'roadmap:## 마일스톤: 제목 + - 키: 값' });
    seen.set(r.id, node);
  }
  for (const it of items) {
    const p = it.props;
    p.completedAt = p.status === '완료' && d?.completedAt.get(`item:${it.id}`) || null;
    p.waitingSince = p.waitingOn && d?.waitingSince.get(`item:${it.id}`) || null;
    g.add('milestone', it.id, it.title, p, { file, line: fs.lineOf(text, `## ${it.head}`), rule });
    for (const t of p.tasks) g.link('milestone', it.id, 'tracks', 'task', t);
    if (p.milestone && seen.has(p.milestone)) g.link('release', p.milestone, 'contains', 'milestone', it.id);
  }
  if (items.length === 0) return '로드맵 항목 0건';
  return hist.note || null;
}
