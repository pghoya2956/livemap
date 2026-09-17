import React from 'react';
import { ChangesPanel } from '@pghoya2956/livemap-ui';
import { data } from '../sample/monitor';

export const Default = () => (<div className="col" style={{ width: 380, height: 440, display: 'grid' }}><ChangesPanel changes={data.changes as any} total={data.activity.sum} refIso={data.generatedAt} at="17:30 기준" /></div>);
