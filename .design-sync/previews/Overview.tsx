import React from 'react';
import { Overview } from '@pghoya2956/livemap-ui';
import { data } from '../sample/monitor';

export const FullScreen = () => (<div style={{ width: 1440, height: 900, overflow: 'hidden' }}><Overview data={data as any} /></div>);
