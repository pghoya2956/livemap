import React from 'react';
import { TopBar } from '@pghoya2956/livemap-ui';
import { project } from '../sample/monitor';

export const Healthy = () => <TopBar project={project} signals={{ deploy: 'ok', deployBehind: 0, warnings: 0 }} />;
export const NeedsAttention = () => <TopBar project={project} signals={{ deploy: 'behind', deployBehind: 3, warnings: 2 }} current={1} />;
