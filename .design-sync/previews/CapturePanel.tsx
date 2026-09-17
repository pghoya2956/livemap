import React from 'react';
import { CapturePanel } from '@pghoya2956/livemap-ui';
import { captures, journeys } from '../sample/monitor';

export const Default = () => (<div style={{ width: 400 }}><CapturePanel captures={captures} journeys={journeys} interval={600000} /></div>);
export const Empty = () => (<div style={{ width: 400 }}><CapturePanel captures={[]} /></div>);
