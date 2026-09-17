import React from 'react';
import { ProgressPanel } from '@pghoya2956/livemap-ui';
import { data } from '../sample/monitor';

export const Default = () => (<div style={{ width: 380 }}><ProgressPanel steps={data.steps} total={data.stepsTotal} journeysLive={data.journeysLive} journeysTotal={data.journeysTotal} at="17:30 기준" /></div>);
