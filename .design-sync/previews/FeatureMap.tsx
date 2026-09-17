import React from 'react';
import { FeatureMap } from '@pghoya2956/livemap-ui';
import { data, journeys, links, steps } from '../sample/monitor';

const next = data.roadmapItems.find((r) => r.status !== '완료' && r.status !== '진행') || null;
export const Default = () => {
  const [sel, setSel] = React.useState('review');
  return (<div className="panel" style={{ height: 520 }}><FeatureMap journeys={journeys} links={links} selected={sel} onSelect={setSel} stepCounts={steps} next={next} /></div>);
};
export const Folded = () => (<div className="panel" style={{ height: 520 }}><FeatureMap journeys={journeys.slice(0, 5)} badgeJourneys={journeys} folded={2} links={links} stepCounts={steps} next={next} /></div>);
