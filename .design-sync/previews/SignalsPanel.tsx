import React from 'react';
import { SignalsPanel } from '@pghoya2956/livemap-ui';
import { data } from '../sample/monitor';

export const Default = () => (<div className="col" style={{ width: 420, height: 520, display: 'grid' }}><SignalsPanel roadmap={data.roadmap} journeys={data.journeys} activity={data.activity} changes={data.changes as any} refIso={data.generatedAt} at="17:30 기준" /></div>);
