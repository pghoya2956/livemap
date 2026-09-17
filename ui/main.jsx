// 엔진 화면 진입점: 같은 출처의 data/overview.json을 읽어 첫 화면을 그린다. 하위 화면 라우터는 Phase 3에서 더한다.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Overview } from './Overview.jsx';

const root = createRoot(document.getElementById('root'));
root.render(<p className="boot">불러오는 중…</p>);
fetch('data/overview.json', { cache: 'no-store' })
  .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then((data) => root.render(<Overview data={data} />))
  .catch(() => root.render(<p className="boot boot-error">불러오지 못했습니다. 생성물이 없으면 npm run map 을 먼저 실행하세요.</p>));
