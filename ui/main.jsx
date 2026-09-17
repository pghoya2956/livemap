// 엔진 화면 진입점: 같은 출처의 data/monitor.json을 읽어 첫 화면을 그린다.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Overview } from './Overview.jsx';

const root = createRoot(document.getElementById('root'));
fetch('data/monitor.json', { cache: 'no-store' })
  .then((r) => { if (!r.ok) throw new Error(`data/monitor.json ${r.status}`); return r.json(); })
  .then((data) => root.render(<Overview data={data} />))
  .catch((e) => root.render(<p className="boot-error">자료를 읽지 못했습니다: {String(e.message)}</p>));
