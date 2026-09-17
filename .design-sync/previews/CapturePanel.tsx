import React from 'react';
import { CapturePanel } from '@pghoya2956/livemap-ui';
import { captures } from '../sample/monitor';

export const Default = () => (<div style={{ width: 400 }}><CapturePanel captures={captures} interval={600000} /></div>);
export const Empty = () => (<div style={{ width: 400 }}><CapturePanel captures={[]} /></div>);
