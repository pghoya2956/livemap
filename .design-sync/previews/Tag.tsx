import React from 'react';
import { Tag } from '@pghoya2956/livemap-ui';

const surface = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 8, alignItems: 'center' };
export const StepStatus = () => (<div style={surface}><Tag kind="live">동작</Tag><Tag kind="mock">목업</Tag><Tag kind="planned">계획</Tag><Tag kind="next">구상</Tag></div>);
export const RoadmapStatus = () => (<div style={surface}><Tag kind="완료">완료</Tag><Tag kind="진행">진행</Tag><Tag kind="다음">다음</Tag><Tag kind="대기">대기</Tag></div>);
export const ChangeKind = () => (<div style={surface}>{['기능', '수정', '화면', '배포', '문서', '검사'].map((k) => <Tag key={k} kind={k}>{k}</Tag>)}</div>);
