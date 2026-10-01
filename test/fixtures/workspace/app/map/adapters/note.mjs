// 검사 픽스처의 프로젝트 어댑터. 자식 배지·경고가 상위로 합쳐지지 않는지 본다.
// WS_FIXTURE_LOG 가 있으면 빌드마다 그 파일에 이 저장소 루트를 한 줄 덧붙인다(검사가 자식 빌드 횟수를 센다)
import { appendFileSync } from 'node:fs';

export default function note(g, fs) {
  if (process.env.WS_FIXTURE_LOG) appendFileSync(process.env.WS_FIXTURE_LOG, `${fs.ROOT}\n`);
  g.badge('앱 메모', '자식 배지');
  g.issue('warn', '앱 메모', '자식 경고');
  return null;
}
