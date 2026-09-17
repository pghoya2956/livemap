import React from 'react';
import { Panel, Icons, Tag } from '@pghoya2956/livemap-ui';

export const WithList = () => (
  <div style={{ width: 380 }}>
    <Panel icon={Icons.list} title="로드맵" sub="3/6 완료" at="17:30 기준" budget="list" more={{ n: 2, href: '#/roadmap' }}>
      <div className="pb">
        <div className="rows">
          <a className="row" href="#/roadmap"><Tag kind="진행">진행</Tag><div className="body"><div className="tt">예약 변경</div><div className="meta">스펙 주도 · 연결 단계 1</div></div></a>
          <a className="row" href="#/roadmap"><Tag kind="다음">다음</Tag><div className="body"><div className="tt">후기와 평판</div><div className="meta">후기 노출 기준 결정 대기</div></div></a>
          <a className="row" href="#/roadmap"><Tag kind="완료">완료</Tag><div className="body"><div className="tt">운영 오늘 화면</div><div className="meta">바로 구현</div></div></a>
        </div>
      </div>
    </Panel>
  </div>
);

export const WithBadge = () => (
  <div style={{ width: 380 }}>
    <Panel icon={Icons.alert} title="특보" badge={<Tag kind="mock">1</Tag>} at="17:30 기준">
      <div className="pb"><div className="rows"><a className="row al wait" href="#/roadmap/reviews"><span className="mag warm">대기</span><div className="body"><div className="tt">운영팀 결정 대기 · 후기와 평판</div><div className="meta">3일째 · 후기 노출 기준 결정</div></div></a></div></div>
    </Panel>
  </div>
);
