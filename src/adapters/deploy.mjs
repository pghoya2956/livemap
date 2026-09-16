// 배포 어댑터: 배포 매니페스트의 이미지 태그(커밋 sha)를 읽어 main 대비 미배포 커밋 수(전체·런타임)를 센다.
export default function deploy(g, fs, cfg) {
  const c = cfg.deploy;
  if (!fs.has(c.manifest)) return `매니페스트 없음: ${c.manifest}`;
  const text = fs.read(c.manifest);
  const sha = (text.match(new RegExp(c.imagePattern)) || [])[1] || null;
  if (!sha) return '이미지 태그를 못 읽음';
  let behind = null, behindRuntime = null;
  const ref = fs.resolveRef(cfg.git?.branch || 'main');
  // 이미지 빌드 중(CI)에는 지금 커밋이 곧 배포본이다. 매니페스트 태그는 배포 뒤에야 바뀌므로 CI가 알려준 sha를 우선한다.
  const assumed = process.env.MAP_ASSUME_DEPLOYED_SHA || null;
  if (assumed && ref && fs.git('rev-parse', ref) === assumed) {
    g.add('deploy', 'homelab', cfg.project.host, { host: cfg.project.host, sha: assumed.slice(0, 7), full: assumed, behind: 0, behindRuntime: 0, assumed: true }, { file: c.manifest, line: null, rule: 'deploy:MAP_ASSUME_DEPLOYED_SHA' });
    return null;
  }
  if (fs.hasGit() && ref) {
    const b = fs.git('rev-list', '--count', `${sha}..${ref}`);
    behind = b === '' ? null : Number(b);
    const r = fs.git('rev-list', '--count', `${sha}..${ref}`, '--', ...(cfg.git?.runtimePaths || []));
    behindRuntime = r === '' ? null : Number(r);
  }
  g.add('deploy', 'homelab', cfg.project.host, { host: cfg.project.host, sha: sha.slice(0, 7), full: sha, behind, behindRuntime }, { file: c.manifest, line: fs.lineOf(text, sha), rule: 'deploy:image tag' });
  return behind === null ? '배포 sha가 main 이력에 없음(뒤처짐 계산 불가)' : null;
}
