// React 화면을 같은 출처 정적 파일(map.js·map.css·index.html)로 번들한다. 인라인 스크립트·스타일 없이 CSP default-src 'self'에서 뜬다.
// 사용: node scripts/build-ui.mjs [출력 폴더, 기본 site/]   화면 번들(출력이 site/면 서체 복사 생략)
//       node scripts/build-ui.mjs --lib                   Claude Design 동기화용 ui/dist-lib/index.js(React 외부 ESM)와 ui/fonts/
// site/ 산출물은 커밋한다. CI가 `node scripts/build-ui.mjs && git diff --exit-code site/`로 소스와 같은지 본다.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const args = process.argv.slice(2);

if (args.includes('--lib')) {
  await build({
    entryPoints: [join(ROOT, 'ui/index.js')], bundle: true, format: 'esm', target: 'es2020', jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'], outfile: join(ROOT, 'ui/dist-lib/index.js'), legalComments: 'none',
  });
  cpSync(join(SITE, 'fonts'), join(ROOT, 'ui/fonts'), { recursive: true });
  console.log('ui lib → ui/dist-lib/index.js');
} else {
  const out = resolve(args.find((a) => !a.startsWith('--')) || SITE);
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [join(ROOT, 'ui/main.jsx')], bundle: true, minify: true, format: 'iife', target: 'es2020',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, outfile: join(out, 'map.js'), legalComments: 'eof',
  });
  cpSync(join(ROOT, 'ui/styles.css'), join(out, 'map.css'));
  cpSync(join(ROOT, 'ui/index.html'), join(out, 'index.html'));
  if (out !== SITE) cpSync(join(SITE, 'fonts'), join(out, 'fonts'), { recursive: true });
  console.log(`ui build → ${out}`);
}
