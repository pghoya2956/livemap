import React from 'react';
import { ProgressPanel } from '@pghoya2956/livemap-ui';
import { data } from '../sample/monitor';

const c = data.counts;
export const AllSteps = () => (<div style={{ width: 380 }}><ProgressPanel steps={c.steps} journeysLive={c.journeysLive} journeysTotal={c.journeys} at="17:30 기준" /></div>);
export const CurrentMilestone = () => (<div style={{ width: 380 }}><ProgressPanel steps={c.steps} journeysLive={c.journeysLive} journeysTotal={c.journeys} milestone={data.milestones.find((m) => m.id === data.currentMilestone)} at="17:30 기준" /></div>);
