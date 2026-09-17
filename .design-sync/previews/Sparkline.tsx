import React from 'react';
import { Sparkline } from '@pghoya2956/livemap-ui';

const surface = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 8, alignItems: 'center' };
export const Rising = () => (<div style={surface}><Sparkline series={[0, 1, 0, 2, 4, 2, 3, 5, 6, 3, 8, 4, 7, 9]} color="#2FD3E6" width={160} height={40} /></div>);
export const Quiet = () => (<div style={surface}><Sparkline series={new Array(14).fill(0)} color="#222B36" width={160} height={40} /></div>);
