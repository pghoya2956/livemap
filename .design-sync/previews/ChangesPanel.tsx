import React from 'react';
import { ChangesPanel } from '@pghoya2956/livemap-ui';
import { data } from '../sample/monitor';

export const Default = () => (<div className="col" style={{ width: 380, height: 300, display: 'grid' }}><ChangesPanel changes={data.changes} activity={data.activity} generatedAt={data.generatedAt} lastVisit="2026-09-17T06:00:00.000Z" at="17:30 기준" /></div>);
export const NoChanges = () => (<div className="col" style={{ width: 380, height: 160, display: 'grid' }}><ChangesPanel changes={[]} activity={{ ...data.activity, total: 0, bots: 0 }} generatedAt={data.generatedAt} at="17:30 기준" /></div>);
