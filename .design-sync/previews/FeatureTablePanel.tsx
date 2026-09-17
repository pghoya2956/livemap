import React from 'react';
import { FeatureTablePanel } from '@pghoya2956/livemap-ui';
import { journeys, activity } from '../sample/monitor';

export const Default = () => {
  const [sel, setSel] = React.useState('review');
  return (<div className="col" style={{ width: 400, height: 520, display: 'grid' }}><FeatureTablePanel journeys={journeys} activity={activity} selected={sel} onSelect={setSel} /></div>);
};
