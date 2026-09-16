// 어댑터 공용 유틸. 파일 읽기·순회·git 호출을 한 곳에 둔다(테스트에서 ROOT를 바꿔 끼운다).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function makeFs(ROOT) {
  const abs = (p) => join(ROOT, p);
  const has = (p) => existsSync(abs(p));
  const isDir = (p) => has(p) && statSync(abs(p)).isDirectory();
  const read = (p) => readFileSync(abs(p), 'utf8');
  const walk = (dir, pred, acc = []) => {
    if (!isDir(dir)) return acc;
    for (const name of readdirSync(abs(dir))) {
      const rel = join(dir, name);
      if (statSync(abs(rel)).isDirectory()) { if (name !== 'node_modules' && name !== '.git') walk(rel, pred, acc); }
      else if (pred(rel)) acc.push(rel);
    }
    return acc;
  };
  const ls = (dir) => (isDir(dir) ? readdirSync(abs(dir)) : []);
  let gitOk = null;
  const git = (...a) => {
    try { const out = execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); gitOk = true; return out; }
    catch { if (gitOk === null) gitOk = false; return ''; }
  };
  const lastCommit = (path) => {
    const line = git('log', '-1', '--format=%h|%ad|%s', '--date=short', '--', path);
    if (!line) return null;
    const [sha, date, ...s] = line.split('|');
    return { sha, date, subject: s.join('|') };
  };
  // main → origin/main → HEAD 순으로 존재하는 참조를 고른다(CI 체크아웃에는 로컬 main이 없을 수 있다).
  const resolveRef = (name) => { for (const c of [name, `origin/${name}`, 'HEAD']) if (git('rev-parse', '--verify', '--quiet', c)) return c; return null; };
  const lineOf = (text, needle) => { const i = text.indexOf(needle); return i < 0 ? null : text.slice(0, i).split('\n').length; };
  return { ROOT, abs, has, isDir, read, walk, ls, git, lastCommit, lineOf, resolveRef, hasGit: () => { if (gitOk === null) git('rev-parse', 'HEAD'); return gitOk; } };
}
