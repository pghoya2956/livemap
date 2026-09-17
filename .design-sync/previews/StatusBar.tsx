import React from 'react';
import { StatusBar } from '@pghoya2956/livemap-ui';

const surface = { ...{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 8, alignItems: 'center' }, display: 'block', width: 300 };
export const Mixed = () => (<div style={surface}><StatusBar counts={{ live: 15, mock: 6, planned: 2, next: 3 }} /></div>);
export const EarlyStage = () => (<div style={surface}><StatusBar counts={{ live: 3, mock: 4, planned: 5, next: 12 }} /></div>);
