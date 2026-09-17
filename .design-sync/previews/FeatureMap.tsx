import React from 'react';
import { FeatureMap } from '@pghoya2956/livemap-ui';
import { journeys, links, steps } from '../sample/monitor';

export const Default = () => {
  const [sel, setSel] = React.useState('review');
  return (<div className="panel" style={{ height: 520 }}><FeatureMap journeys={journeys} links={links} selected={sel} onSelect={setSel} stepCounts={steps} nextNote="다음 · 후기와 평판 · 결정 대기 ›" /></div>);
};
