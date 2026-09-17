import React from 'react';
import { FeatureTrendPanel } from '@pghoya2956/livemap-ui';
import { journeys } from '../sample/monitor';

export const Default = () => {
  const [sel, setSel] = React.useState('book');
  return (<div className="col" style={{ width: 460, height: 420, display: 'grid' }}><FeatureTrendPanel journeys={journeys} selected={sel} onSelect={setSel} at="17:30 기준" /></div>);
};
