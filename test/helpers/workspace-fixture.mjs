// 워크스페이스 픽스처(test/fixtures/workspace)를 임시 폴더에 펼쳐 실제 git 저장소 셋으로 만든다.
// 저장소 안에 .git 을 넣을 수 없어서 자식(app·svc)부터 git init·커밋하고 상위를 git init·커밋한다.
// _gitignore 는 .gitignore 로 바꿔 놓는다(상위 것은 첫 줄이 /* 라 엔진 저장소 안에 그 이름으로 두면 픽스처가 추적되지 않는다).
// 사용자·시스템 git 설정(훅·서명·템플릿)이 픽스처에 섞이지 않게 GIT_CONFIG_GLOBAL 을 빈 파일로, GIT_CONFIG_NOSYSTEM 을 1로 둔다.
import { cpSync, mkdtempSync, readdirSync, renameSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { devNull, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'workspace');
export const CHILDREN = ['app', 'svc'];
export const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };

export const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] });

// 폴더 아래 _gitignore 를 모두 .gitignore 로 바꾼다
function dotGitignore(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) dotGitignore(p);
    else if (name === '_gitignore') renameSync(p, join(dir, '.gitignore'));
  }
}

function commitAll(dir, message) {
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
}

// dir 아래에 새 임시 폴더를 만들어 픽스처를 펼치고 상위 경로를 돌려준다
export async function makeWorkspace({ dir = tmpdir() } = {}) {
  const root = mkdtempSync(join(dir, 'livemap-ws-'));
  cpSync(FIXTURE, root, { recursive: true });
  dotGitignore(root);
  for (const child of CHILDREN) commitAll(join(root, child), `feat: ${child} 시작`);
  commitAll(root, 'docs: 상위 장부 시작');
  return root;
}
