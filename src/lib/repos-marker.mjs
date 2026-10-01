// 여러 저장소 표식 파일(.agent/repos.yaml) 읽개와 저장소 어긋남 판정 R1~R4.
// 문법과 판정은 표식 파일을 관리하는 하네스 스킬의 점검 스크립트(repos-audit.py)와 같다. 두 읽개가 다른 판정을 내면 어느 쪽을 믿을지 사람이 가려야 하므로
// 문법을 바꿀 때는 두 쪽을 같이 바꾼다. YAML 라이브러리를 쓰지 않는다(엔진은 런타임 의존성 0): 스킬이 쓰는 고정 형식만 받고 그 밖의 줄은 줄 번호와 함께 오류다.
//   R1 목록에만 있음  목록의 자식이 없거나 .git 이 없다. root.url 이 있는데 상위에 .git 이 없는 경우 포함
//   R2 디스크에만 있음  상위 바로 아래 점으로 시작하지 않는 폴더가 .git 을 가졌는데 목록에 없다(깊이 1)
//   R3 상위 색인에 있음  상위 저장소 색인에 자식 경로 파일이 있다(git ls-files 1회)
//   R4 원격 불일치  목록 url 과 실제 origin 이 다르다(상위 포함). url 이 빈 항목은 건너뛴다
// 상위 .git 이 파일(연결된 워크트리)이면 자식 폴더가 없으므로 판정을 건너뛴다. 자동 수정은 하지 않는다.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const MARKER = '.agent/repos.yaml';
export const ROOT_PATH = '.';
// git 한 번에 주는 시간(ms). 점검 스크립트의 GIT_TIMEOUT 5초와 같다
export const GIT_TIMEOUT = 5000;
export const R_KEYS = ['R1', 'R2', 'R3', 'R4'];

const ITEM = /^ {2}- path:(.*)$/;
const ITEM_KEY = /^ {4}(url|branch|role):(.*)$/;
const ROOT_KEY = /^ {2}(url|branch):(.*)$/;

const unquote = (value) => {
  const v = value.trim();
  return v.length >= 2 && v[0] === v.at(-1) && (v[0] === '"' || v[0] === "'") ? v.slice(1, -1) : v;
};

// 표식 본문 → { root, repos, error }. error 는 { line, text } 또는 null. 오류면 root·repos 는 비운다
export function parseMarker(text) {
  const root = {}, repos = [];
  let section = null, cur = null;
  const fail = (line, raw) => ({ root: {}, repos: [], error: { line, text: raw } });
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line === 'root:') { section = 'root'; cur = null; continue; }
    if (line === 'repos:') { section = 'repos'; cur = null; continue; }
    let m = line.match(ITEM);
    if (m && section === 'repos') {
      cur = { path: unquote(m[1]), url: '', branch: '', role: '' };
      if (!cur.path) return fail(i + 1, line);
      repos.push(cur);
      continue;
    }
    m = line.match(ITEM_KEY);
    if (m && cur) { cur[m[1]] = unquote(m[2]); continue; }
    m = line.match(ROOT_KEY);
    if (m && section === 'root') { root[m[1]] = unquote(m[2]); continue; }
    return fail(i + 1, line);
  }
  return { root, repos, error: null };
}

// git 출력(성공) / ''(git 이 실패) / null(git 을 돌리지 못함: 실행 파일 없음·시간 초과)
export function gitOut(args, cwd) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_TIMEOUT });
  } catch (e) {
    return typeof e.status === 'number' ? '' : null;
  }
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
// 워크트리의 .git 은 파일이다. 폴더와 파일 모두 저장소로 본다
const hasGit = (dir) => existsSync(join(dir, '.git'));
export const isLinkedWorktree = (dir) => { try { return statSync(join(dir, '.git')).isFile(); } catch { return false; } };

// 상위 루트의 표식(markerRel, 루트 기준)을 읽어 판정한다.
// → { R1, R2, R3, R4, error, worktree, root, repos }. error 는 { kind: 'missing'|'unreadable', line, text } 또는 null.
// 워크트리에서도 표식은 읽어 repos 를 채운다(부르는 쪽이 자식마다 건너뜀을 남긴다). 판정 항목 모양은 점검 스크립트의 --json 과 같다
export function auditRepos(rootDir, markerRel = MARKER) {
  const f = { R1: [], R2: [], R3: [], R4: [], error: null, worktree: isLinkedWorktree(rootDir), root: {}, repos: [] };
  let text;
  try { text = readFileSync(join(rootDir, markerRel), 'utf8'); }
  catch (e) { f.error = { kind: e.code === 'ENOENT' ? 'missing' : 'unreadable', line: 0, text: String(e.message) }; return f; }
  const parsed = parseMarker(text);
  if (parsed.error) { f.error = { kind: 'unreadable', ...parsed.error }; return f; }
  f.root = parsed.root;
  f.repos = parsed.repos;
  if (f.worktree) return f;

  const rootUrl = parsed.root.url || '';
  const rootIsRepo = hasGit(rootDir);
  if (rootUrl && !rootIsRepo) f.R1.push({ path: ROOT_PATH, why: 'no-git' });

  const present = [];
  for (const r of parsed.repos) {
    const p = join(rootDir, r.path);
    if (!isDir(p)) f.R1.push({ path: r.path, why: 'missing' });
    else if (!hasGit(p)) f.R1.push({ path: r.path, why: 'no-git' });
    else present.push(r);
  }

  const listed = new Set(parsed.repos.map((r) => r.path));
  for (const name of readdirSync(rootDir).sort()) {
    if (name.startsWith('.') || listed.has(name)) continue;
    const d = join(rootDir, name);
    if (isDir(d) && hasGit(d)) f.R2.push({ path: name });
  }

  // 색인 판정: ls-files 1회. -z 는 한글 경로가 따옴표로 싸여 나오는 것을 막는다. gitlink 항목은 경로 자체로 나온다
  const paths = parsed.repos.map((r) => r.path);
  if (rootIsRepo && paths.length) {
    const out = gitOut(['ls-files', '-z', '--', ...paths], rootDir);
    if (out) {
      const counts = new Map();
      const byLen = [...paths].sort((a, b) => b.length - a.length);
      for (const entry of out.split('\0')) {
        if (!entry) continue;
        const p = byLen.find((x) => entry === x || entry.startsWith(`${x}/`));
        if (p) counts.set(p, (counts.get(p) || 0) + 1);
      }
      for (const p of paths) if (counts.has(p)) f.R3.push({ path: p, files: counts.get(p) });
    }
  }

  // 원격 판정: 저장소마다 git 1회. git 을 돌리지 못했으면 건너뛰고, origin 이 없으면 빈 값이 목록 url 과 달라 R4 다
  const targets = [];
  if (rootUrl && rootIsRepo) targets.push([ROOT_PATH, rootUrl, rootDir]);
  for (const r of present) if (r.url) targets.push([r.path, r.url, join(rootDir, r.path)]);
  for (const [path, listedUrl, cwd] of targets) {
    const out = gitOut(['remote', 'get-url', 'origin'], cwd);
    if (out === null) continue;
    const actual = out.trim();
    if (actual !== listedUrl) f.R4.push({ path, listed: listedUrl, actual });
  }
  return f;
}
