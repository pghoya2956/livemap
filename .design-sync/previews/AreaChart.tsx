import React from 'react';
import { AreaChart } from '@pghoya2956/livemap-ui';
import { journeys, activity } from '../sample/monitor';

const days = activity.days.map((d) => d.date);
const all = activity.days.map((d) => d.commits);
export const FeatureVsAll = () => (<div className="panel" style={{ width: 380 }}><div className="detail" style={{ borderTop: 0 }}><AreaChart series={journeys[1].series} compare={all} days={days} /></div></div>);
export const SeriesOnly = () => (<div className="panel" style={{ width: 380 }}><div className="detail" style={{ borderTop: 0 }}><AreaChart series={all} days={days} /></div></div>);
