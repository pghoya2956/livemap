import React from 'react';
import { Pill, Dot } from '@pghoya2956/livemap-ui';

const surface = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 8, alignItems: 'center' };
export const Tones = () => (
  <div style={surface}>
    <Pill tone="good"><Dot pulse />배포 최신</Pill>
    <Pill tone="warn">미배포 3</Pill>
    <Pill>경고 0</Pill>
    <Pill href="https://campnote.example">campnote.example ↗</Pill>
  </div>
);
