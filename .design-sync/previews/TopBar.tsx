import React from 'react';
import { TopBar } from '@pghoya2956/livemap-ui';
import { project, generatedAt } from '../sample/monitor';

export const Healthy = () => <TopBar project={project} generatedAt={generatedAt} signals={{ deploy: 'ok', deployBehind: 0, warnings: 0 }} />;
export const NeedsAttention = () => <TopBar project={project} generatedAt={generatedAt} signals={{ deploy: 'behind', deployBehind: 3, warnings: 2 }} current={1} />;
