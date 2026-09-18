// 여정 정본 읽개(2.0.0): 역할별 마크다운 디렉터리를 읽어 시맨틱 자료를 만든다.
// 사람이 읽고 고치는 정본은 역할 파일이고, 화면 주소·캡처·참조 같은 구현 좌표는 프로젝트가 가진 대응표에서 온다.
// 정본에 구현 정보를 적지 않는 대신 단계 ID(`<여정>/<단계>`)로 두 자료를 잇는다.
//
// 디렉터리 모양
//   README.md      역할 표(역할 → 파일·이름)와 상태 어휘 표
//   <역할>.md      머리 `- 사용자 확인`·`- 시작 지점`, `## 여정: <이름>` 절, 그 아래 `### <단계>` 절
//   대응표(JSON)   { lanes: { <여정 또는 역할>: <레인> }, steps: { "<여정>/<단계>": { screens, capture, refs, apis, note, actor } } }
import { parseSections } from './md-props.mjs';

const STATUS = { 동작: 'live', 목업: 'mock', 미착수: 'planned', 다음: 'next' };
const JOURNEY = /^여정\s*[:：]\s*(.*)$/;
// 단계의 넘김 줄: `**넘김**: <역할> \`<단계 ID>\`(조건)`
const HANDOFF = /\*\*넘김\*\*\s*[:：]\s*([^`\n(]+?)\s*`([^`]+)`/g;
const LIST_KEYS = ['하는 사람'];

// `20260917 11:00`·`2026-09-17`·`2026.09.17` → `2026-09-17`. 모양이 다르면 원문 그대로 둔다(검사 규칙이 본다)
export function normalizeDate(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/(\d{4})[-.\/ ]?(\d{2})[-.\/ ]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}

const slugOf = (file) => file.replace(/^.*\//, '').replace(/\.md$/, '');

// README.md: 역할 표에서 배우 사전, 상태 어휘 표에서 상태 뜻
function readIndex(text) {
  const actors = {}, statusLegend = {};
  const doc = parseSections(text, { head: true });
  for (const sec of doc.children) {
    for (const table of sec.tables) {
      const head = table.header || [];
      const col = (name) => head.findIndex((h) => h.includes(name));
      const roleAt = col('역할'), fileAt = col('파일');
      if (roleAt >= 0 && fileAt >= 0) {
        for (const row of table.rows) {
          const link = (row[fileAt] || '').match(/\(([^)]+)\)/);
          const slug = slugOf(link ? link[1] : row[fileAt] || '');
          if (slug) actors[slug] = row[roleAt];
        }
        continue;
      }
      const statusAt = col('상태'), meanAt = col('뜻');
      if (statusAt >= 0 && meanAt >= 0) {
        for (const row of table.rows) {
          const key = STATUS[row[statusAt]];
          if (key) statusLegend[key] = row[meanAt];
        }
      }
    }
  }
  return { actors, statusLegend };
}

// 역할 파일 하나 → { slug, reviewedAt, startStep, subtypes, handoffs, journeys }
export function readRoleFile(text, slug) {
  const doc = parseSections(text, { head: true, listKeys: LIST_KEYS });
  const reviewedAt = normalizeDate(doc.props['사용자 확인']);
  const startStep = String(doc.props['시작 지점'] ?? '').trim();
  const subtypes = [], handoffs = [];
  const journeys = [];
  for (const sec of doc.children) {
    if (sec.title.includes('하위 유형')) {
      for (const table of sec.tables) for (const row of table.rows) if (row[0]) subtypes.push({ name: row[0], start: row[row.length - 1] === '—' ? startStep : row[row.length - 1] });
      continue;
    }
    if (sec.title.includes('넘겨받는 일')) {
      for (const line of [...sec.items, sec.prose]) for (const m of String(line).matchAll(/([a-z-]+\/[a-z-]+)/g)) if (!handoffs.includes(m[1])) handoffs.push(m[1]);
      continue;
    }
    const jm = sec.title.match(JOURNEY);
    if (!jm) continue;
    const steps = [];
    for (const child of sec.children) {
      const id = String(child.props.id ?? '').trim();
      if (!id) continue;
      const [journeyId, stepId] = id.includes('/') ? [id.slice(0, id.indexOf('/')), id.slice(id.indexOf('/') + 1)] : [null, id];
      const handoffs2 = [];
      for (const line of [...child.items, child.prose]) for (const m of String(line).matchAll(HANDOFF)) handoffs2.push({ role: m[1].trim(), step: m[2].trim() });
      steps.push({
        id: stepId, journeyId, fullId: id, label: child.title, handoffs: handoffs2,
        status: STATUS[child.props['상태']] || child.props['상태'] || '',
        statusWord: child.props['상태'] || '',
        intent: child.props['목적'] || child.prose || '',
        subtypes: child.props['하는 사람'] || [],
        line: child.line,
      });
    }
    if (!steps.length) continue;
    journeys.push({ id: steps[0].journeyId || slugOf(slug), title: jm[1].trim(), actor: slug, steps, line: sec.line });
  }
  return { slug, reviewedAt, startStep, subtypes, handoffs, journeys };
}

// 디렉터리 전체 → 엔진이 쓰는 시맨틱 자료. map은 프로젝트 대응표(없으면 화면·캡처 없이 읽는다)
export function readJourneysDir(fs, dir, { map = {}, project = null } = {}) {
  const files = fs.ls(dir).filter((f) => f.endsWith('.md')).sort();
  const index = files.includes('README.md') ? readIndex(fs.read(`${dir}/README.md`)) : { actors: {}, statusLegend: {} };
  const roles = [];
  for (const f of files) {
    if (f === 'README.md') continue;
    const file = `${dir}/${f}`;
    const role = readRoleFile(fs.read(file), slugOf(f));
    const last = fs.lastCommit ? fs.lastCommit(file) : null;
    roles.push({ file, last, changedAfterReview: !!(last && role.reviewedAt && last.date > role.reviewedAt), ...role });
  }
  const stepsMap = map.steps || {};
  const journeys = [];
  for (const role of roles) {
    for (const j of role.journeys) {
      journeys.push({
        id: j.id, title: j.title, actor: role.slug, lane: (map.lanes || {})[j.id] || (map.lanes || {})[role.slug] || index.actors[role.slug] || role.slug,
        src: { file: role.file, line: j.line },
        steps: j.steps.map((s) => {
          const extra = stepsMap[s.fullId] || {};
          return {
            id: s.id, label: s.label, intent: s.intent, status: s.status,
            actor: extra.actor, screens: extra.screens || [], capture: extra.capture, apis: extra.apis,
            refs: extra.refs || [], note: extra.note, reviewedAt: extra.reviewedAt || role.reviewedAt,
            subtypes: s.subtypes, handoffs: s.handoffs, src: { file: role.file, line: s.line },
          };
        }),
      });
    }
  }
  return {
    project: project || map.project || {},
    actors: index.actors, statusLegend: index.statusLegend,
    journeys, roles: roles.map(({ journeys: _j, ...rest }) => rest), source: { kind: 'md', dir },
  };
}

export default readJourneysDir;
