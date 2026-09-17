import React from 'react';
import { Gauge } from '@pghoya2956/livemap-ui';

const surface = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 8, alignItems: 'center' };
export const High = () => (<div style={surface} className="gauge"><Gauge value={77} caption="동작 단계" /></div>);
export const Low = () => (<div style={surface} className="gauge"><Gauge value={23} caption="동작 단계" /></div>);
