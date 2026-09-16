// DB 어댑터: migration SQL에서 migration·table·function 노드를 만들고, 함수 본문이 건드리는 테이블을 잇는다.
import { basename } from 'node:path';

export default function migrations(g, fs, cfg) {
  const dir = cfg.migrations.dir;
  const files = fs.walk(dir, (p) => p.endsWith('.sql')).sort();
  if (!files.length) return `migration 없음: ${dir}`;
  const allTables = [];
  const parsed = files.map((f) => {
    const sql = fs.read(f).toLowerCase();
    const tables = [...sql.matchAll(/create table (?:if not exists )?([a-z_.]+)/g)].map((m) => m[1]);
    const functions = [...new Set([...sql.matchAll(/create (?:or replace )?function ([a-z_.]+)/g)].map((m) => m[1]))];
    allTables.push(...tables);
    return { f, sql, tables, functions, grants: (sql.match(/^\s*grant /gm) || []).length, rls: (sql.match(/enable row level security/g) || []).length };
  });
  for (const p of parsed) {
    const id = basename(p.f);
    g.add('migration', id, id.replace(/^\d+_/, ''), { file: p.f, tables: p.tables, functions: p.functions, grants: p.grants, rls: p.rls, last: fs.lastCommit(p.f) }, { file: p.f, line: 1, rule: 'migrations:create table|function' });
    for (const t of p.tables) { g.add('table', t, t.split('.').pop(), { schema: t.split('.')[0] }, { file: p.f, line: fs.lineOf(p.sql, t), rule: 'migrations:create table' }); g.link('migration', id, 'contains', 'table', t); }
    const parts = p.sql.split(/create (?:or replace )?function /);
    for (const part of parts.slice(1)) {
      const name = (part.match(/^([a-z_.]+)/) || [])[1];
      if (!name) continue;
      const short = name.split('.').pop();
      const body = part.split(/\$\$/).slice(1, 2).join('') || part;
      g.add('function', short, short, { qualified: name, migration: id }, { file: p.f, line: fs.lineOf(p.sql, `function ${name}`), rule: 'migrations:create function' });
      g.link('migration', id, 'contains', 'function', short);
      for (const t of allTables) if (body.includes(t) || body.includes(t.split('.').pop() + ' ')) g.link('function', short, 'touches', 'table', t);
    }
  }
  return null;
}
