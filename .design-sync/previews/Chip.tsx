import React from 'react';
import { Chip } from '@pghoya2956/livemap-ui';

const surface = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, display: 'inline-flex', gap: 8, alignItems: 'center' };
export const FilterRow = () => {
  const [on, setOn] = React.useState('전체');
  return (
    <div style={surface}>
      {[['전체', 5], ['완료', 3], ['진행', 1], ['다음', 1]].map(([k, n]) => <Chip key={k} on={on === k} count={n} onClick={() => setOn(String(k))}>{k}</Chip>)}
    </div>
  );
};
export const Static = () => (<div style={surface}><Chip>스펙 주도</Chip><Chip count="12/21">작업 실행</Chip></div>);
