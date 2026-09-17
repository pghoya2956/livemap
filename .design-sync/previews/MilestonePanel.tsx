import React from 'react';
import { MilestonePanel } from '@pghoya2956/livemap-ui';
import { data, roadmapOnly, generatedAt } from '../sample/monitor';

const box = { width: 380, height: 320, display: 'grid' } as const;
export const WithMilestones = () => (<div className="col" style={box}><MilestonePanel roadmapItems={data.roadmapItems} milestones={data.milestones} currentMilestone={data.currentMilestone} generatedAt={generatedAt} at="17:30 기준" /></div>);
export const RoadmapOnly = () => (<div className="col" style={box}><MilestonePanel roadmapItems={roadmapOnly.roadmapItems} milestones={[]} currentMilestone={null} generatedAt={generatedAt} at="17:30 기준" /></div>);
export const NoRoadmap = () => (<div className="col" style={{ ...box, height: 160 }}><MilestonePanel roadmapItems={[]} milestones={[]} currentMilestone={null} generatedAt={generatedAt} tasksRunning={2} at="17:30 기준" /></div>);
