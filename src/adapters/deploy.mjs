// 배포 어댑터: 배포 매니페스트의 이미지 태그(커밋 sha)를 읽어 main 대비 미배포 커밋 수(전체·런타임)를 센다.
// 배포 뒤 봇이 매니페스트만 바꾸는 커밋은 뒤처짐이 아니므로 behind는 매니페스트 경로를 뺀 경로 제외 rev-list 한 번으로 세고,
// 뺀 수는 behindManifestOnly(전체 커밋 수와의 차)로 따로 싣는다. 매니페스트 sha가 이력에 없으면 읽기 상태 behind는 unknown.
import { setReading } from '../lib/reading.mjs';

export default function deploy(g, fs, cfg) {
  const c = cfg.deploy;
  if (!fs.has(c.manifest)) return `매니페스트 없음: ${c.manifest}`;
  const text = fs.read(c.manifest);
  const sha = (text.match(new RegExp(c.imagePattern)) || [])[1] || null;
  if (!sha) return '이미지 태그를 못 읽음';
  let behind = null, behindRuntime = null, behindManifestOnly = null;
  const ref = fs.resolveRef(cfg.git?.branch || 'main');
  // 이미지 빌드 중(CI)에는 지금 커밋이 곧 배포본이다. 매니페스트 태그는 배포 뒤에야 바뀌므로 CI가 알려준 sha를 우선한다.
  const assumed = process.env.MAP_ASSUME_DEPLOYED_SHA || null;
  if (assumed && ref && fs.git('rev-parse', ref) === assumed) {
    const node = g.add('deploy', 'homelab', cfg.project.host, { host: cfg.project.host, sha: assumed.slice(0, 7), full: assumed, behind: 0, behindRuntime: 0, behindManifestOnly: 0, assumed: true }, { file: c.manifest, line: null, rule: 'deploy:MAP_ASSUME_DEPLOYED_SHA' });
    setReading(node, 'behind', 'rule');
    return null;
  }
  if (fs.hasGit() && ref) {
    const count = (...pathspec) => { const n = fs.git('rev-list', '--count', `${sha}..${ref}`, ...pathspec); return n === '' ? null : Number(n); };
    behind = count('--', '.', `:(exclude)${c.manifest}`);
    const all = count();
    behindManifestOnly = behind === null || all === null ? null : all - behind;
    behindRuntime = count('--', ...(cfg.git?.runtimePaths || []));
  }
  const node = g.add('deploy', 'homelab', cfg.project.host, { host: cfg.project.host, sha: sha.slice(0, 7), full: sha, behind, behindRuntime, behindManifestOnly }, { file: c.manifest, line: fs.lineOf(text, sha), rule: 'deploy:image tag' });
  if (behind === null) {
    setReading(node, 'behind', 'unknown', fs.hasGit() && ref ? `${c.manifest}의 배포 sha ${sha.slice(0, 7)}가 ${ref} 이력에 없음` : 'git 이력을 읽지 못함');
    return '배포 sha가 main 이력에 없음(뒤처짐 계산 불가)';
  }
  setReading(node, 'behind', 'rule');
  return null;
}
