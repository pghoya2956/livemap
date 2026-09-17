import React from 'react';
import { AreaChart } from '@pghoya2956/livemap-ui';
import { journeys, activity } from '../sample/monitor';

export const FeatureVsAll = () => (<div className="panel" style={{ width: 380 }}><div className="detail" style={{ borderTop: 0 }}><AreaChart series={journeys[1].series} compare={activity.total} days={activity.days} /></div></div>);
export const SeriesOnly = () => (<div className="panel" style={{ width: 380 }}><div className="detail" style={{ borderTop: 0 }}><AreaChart series={activity.total} days={activity.days} /></div></div>);
