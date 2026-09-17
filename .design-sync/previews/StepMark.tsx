import React from 'react';
import { StepMark } from '@pghoya2956/livemap-ui';

const surface = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 16, alignItems: 'center', color: 'var(--ink)' };
const item = { display: 'inline-flex', gap: 6, alignItems: 'center' } as const;
export const Statuses = () => (
  <div style={surface}>
    {([['live', '동작'], ['mock', '목업'], ['planned', '계획'], ['next', '구상'], ['partial', '일부 동작']] as const).map(([k, w]) => <span key={k} style={item}><StepMark status={k} />{w}</span>)}
  </div>
);
export const Large = () => (<div style={surface}>{(['live', 'mock', 'planned', 'next'] as const).map((k) => <StepMark key={k} status={k} size={20} />)}</div>);
