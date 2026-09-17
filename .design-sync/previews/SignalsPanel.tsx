import React from 'react';
import { SignalsPanel } from '@pghoya2956/livemap-ui';
import { data, quietSignals } from '../sample/monitor';

const box = { width: 300, height: 290, display: 'grid' } as const;
export const Default = () => (<div className="col" style={box}><SignalsPanel roadmapItems={data.roadmapItems} milestones={data.milestones} signals={data.signals} generatedAt={data.generatedAt} at="17:30 기준" /></div>);
export const Quiet = () => (<div className="col" style={box}><SignalsPanel roadmapItems={[]} milestones={[]} signals={quietSignals} generatedAt={data.generatedAt} at="17:30 기준" /></div>);
