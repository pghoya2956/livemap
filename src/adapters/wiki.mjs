// 위키 어댑터: .agent/wiki/index.md의 결정 목록에서 decision 노드를 만든다(상태 current/proposed/superseded).
export default function wiki(g, fs, cfg) {
  const c = cfg.wiki;
  if (!fs.has(c.index)) return `위키 인덱스 없음: ${c.index}`;
  const text = fs.read(c.index);
  let n = 0;
  for (const m of text.matchAll(/^- \[([^\]]+)\]\(<(decisions\/[^>]+)>\) — (\w+) — (.+)$/gm)) {
    const slug = m[2].replace(/^decisions\//, '').replace(/\.md$/, '');
    g.add('decision', slug, m[1], { kind: 'wiki', file: `.agent/wiki/${m[2]}`, status: m[3], summary: m[4] }, { file: c.index, line: fs.lineOf(text, m[0]), rule: 'wiki:index decisions' });
    n += 1;
  }
  return n === 0 ? '결정 0건' : null;
}
