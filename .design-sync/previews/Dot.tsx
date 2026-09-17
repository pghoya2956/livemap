import React from 'react';
import { Dot } from '@pghoya2956/livemap-ui';

const surface = { ...{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 8, alignItems: 'center' }, gap: 16, color: 'var(--ink)' };
const item = { display: 'inline-flex', gap: 6, alignItems: 'center' } as const;
export const Colors = () => (
  <div style={surface}>
    <span style={item}><Dot color="var(--green)" pulse />배포 최신</span>
    <span style={item}><Dot color="var(--amber)" />진행 중</span>
    <span style={item}><Dot color="var(--red)" />LIVE</span>
    <span style={item}><Dot color="var(--cyan)" />연결</span>
  </div>
);
