// React 화면을 같은 출처 정적 파일(map.js·map.css)로 번들한다. 인라인 스크립트·스타일 없이 CSP default-src 'self'에서 뜬다.
// 사용: node scripts/build-ui.mjs [출력 폴더, 기본 ui/dist]
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(ROOT, 'ui/dist'));
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(ROOT, 'ui/main.jsx')], bundle: true, minify: true, format: 'iife', target: 'es2020',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, outfile: join(out, 'map.js'), legalComments: 'none',
});
cpSync(join(ROOT, 'ui/styles.css'), join(out, 'map.css'));
cpSync(join(ROOT, 'ui/index.html'), join(out, 'index.html'));
cpSync(join(ROOT, 'site/fonts'), join(out, 'fonts'), { recursive: true });
console.log(`ui build → ${out}`);

// Claude Design 동기화용 라이브러리 판: React를 밖에 둔 ESM(ui/dist-lib)과 서체 사본(ui/fonts).
await build({
  entryPoints: [join(ROOT, 'ui/index.js')], bundle: true, format: 'esm', target: 'es2020', jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'], outfile: join(ROOT, 'ui/dist-lib/index.js'), legalComments: 'none',
});
cpSync(join(ROOT, 'site/fonts'), join(ROOT, 'ui/fonts'), { recursive: true });
console.log('ui lib → ui/dist-lib/index.js');
