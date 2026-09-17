import React from 'react';
import { RoadmapPanel } from '@pghoya2956/livemap-ui';
import { roadmap, tasks } from '../sample/monitor';

export const Default = () => (<div className="col" style={{ width: 380, height: 460, display: 'grid' }}><RoadmapPanel roadmap={roadmap} tasks={tasks} at="17:30 기준" /></div>);
