// 결과 JSON: 러너가 낸 검사 결과를 파일별로 모은 livemap 소유 형식(필드 이름은 CTRF를 따른다).
//   { schema: 1, runs: [{ runner, source, sha, dirtyPaths, at, exit, outsideRoot?, stamped?, files: [{ filePath, tests, passed, failed, skipped, pending, tags }] }] }
// 경로는 tests.report와 같은 폴더의 test-results.json. 같은 러너·같은 출처의 실행은 바꾸고 나머지는 남긴다.
// 쓰기는 임시 파일에 쓴 뒤 이름을 바꿔, 두 실행이 동시에 써도 파일이 깨지지 않고 나중 실행이 남는다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const RESULTS_SCHEMA = 1;
export const RESULTS_NAME = 'test-results.json';
export const DEFAULT_REPORT = 'map/.out/junit.xml';

// 프로젝트 루트 기준 결과 JSON 경로
export const resultsPath = (cfg) => join(dirname(cfg?.tests?.report || DEFAULT_REPORT), RESULTS_NAME);

export const emptyResults = () => ({ schema: RESULTS_SCHEMA, runs: [] });

export function readResults(file) {
  if (!existsSync(file)) return emptyResults();
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`결과 JSON을 읽지 못함(${file}): ${e.message}`); }
  if (!doc || doc.schema !== RESULTS_SCHEMA || !Array.isArray(doc.runs)) throw new Error(`결과 JSON 형식이 아님(${file}): schema ${RESULTS_SCHEMA}·runs 배열 필요`);
  return doc;
}

const sameRun = (a, b) => a.runner === b.runner && a.source === b.source;

// 같은 러너·출처의 실행은 그 자리에서 바꾸고, 없으면 뒤에 붙인다
export function mergeRun(doc, run) {
  const runs = doc.runs.slice();
  const i = runs.findIndex((r) => sameRun(r, run));
  if (i >= 0) runs[i] = run; else runs.push(run);
  return { ...doc, schema: RESULTS_SCHEMA, runs };
}

export function writeResults(file, ...runs) {
  let doc = readResults(file);
  for (const run of runs) doc = mergeRun(doc, run);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  renameSync(tmp, file);
  return doc;
}

// 실행 시점 기준 커밋과 작업트리 변경 경로(루트 기준 상대). git이 없으면 sha null·빈 목록
export function gitStamp(root) {
  const run = (...a) => { try { return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const sha = run('rev-parse', 'HEAD')?.trim() || null;
  if (!sha) return { sha: null, dirtyPaths: [] };
  const prefix = run('rev-parse', '--show-prefix')?.trim() || '';
  // -z: 경로 인용 없음. 이름 바꾸기(R)·복사(C)는 새 경로 뒤에 원래 경로가 한 칸 더 온다
  const parts = (run('status', '--porcelain=v1', '-z', '--', '.') || '').split('\0');
  const paths = new Set();
  for (let i = 0; i < parts.length; i += 1) {
    const e = parts[i];
    if (e.length < 4) continue;
    paths.add(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C') { i += 1; if (parts[i]) paths.add(parts[i]); }
  }
  const dirtyPaths = [...paths].map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p)).sort();
  return { sha, dirtyPaths };
}

// 절대 경로(또는 file URL)를 루트 기준 상대 경로로. 루트 밖이면 null
export function toRootPath(root, p) {
  let file = String(p);
  if (file.startsWith('file://')) file = new URL(file).pathname;
  const abs = isAbsolute(file) ? file : resolve(root, file);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel.split('\\').join('/');
}

export const emptyFile = (filePath) => ({ filePath, tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, tags: [] });
export const sortFiles = (files) => files.slice().sort((a, b) => (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0));
