// 로드맵 어댑터: tasks/roadmap.md 의 `## 제목` 절마다 milestone 노드를 만든다. 절의 첫 문단은 목표, `- 키: 값` 목록은 속성이다.
// 순서는 파일 안 위치다. 장면·작업·선행은 문자열로만 남기고 해석(존재 확인)은 derive·check가 한다.
const KEYS = { id: 'id', 상태: 'status', '진행 방식': 'mode', 작업: 'tasks', 장면: 'scenes', 선행: 'deps', '결정 대기': 'waitingOn', '완료 기준': 'done' };
const LISTS = new Set(['tasks', 'scenes', 'deps']);

export default function roadmap(g, fs, cfg) {
  const file = cfg.roadmap?.file;
  if (!file) return null;
  if (!fs.has(file)) return `로드맵 파일 없음: ${file}`;
  const text = fs.read(file);
  let n = 0;
  for (const block of text.split(/^## /m).slice(1)) {
    const [head, ...lines] = block.split('\n');
    const title = head.trim();
    const props = { order: n + 1, goal: '', status: '', mode: '', tasks: [], scenes: [], deps: [], waitingOn: '', done: '' };
    const goal = [];
    for (const line of lines) {
      const m = line.match(/^- ([^:]+):\s*(.*)$/);
      if (m && KEYS[m[1].trim()]) {
        const key = KEYS[m[1].trim()];
        const value = m[2].replace(/`/g, '').trim();
        props[key] = LISTS.has(key) ? value.split(/[,，]\s*/).map((x) => x.trim()).filter((x) => x && x !== '—') : value;
      } else if (!line.startsWith('- ') && line.trim()) goal.push(line.trim());
    }
    props.goal = goal.join(' ');
    const id = props.id || `m${n + 1}`;
    delete props.id;
    g.add('milestone', id, title, props, { file, line: fs.lineOf(text, `## ${head}`), rule: 'roadmap:## 제목 + - 키: 값' });
    for (const t of props.tasks) g.link('milestone', id, 'tracks', 'task', t);
    n += 1;
  }
  return n === 0 ? '로드맵 항목 0건' : null;
}
