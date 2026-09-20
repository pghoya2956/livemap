// Mermaid flowchart 부분집합 파서 검사(스펙 PN-14, DEC-21): flowchart LR·TD 한 줄, subgraph 중첩, 라벨 있는/없는 노드, 화살표만 읽고
// 그 밖의 문법은 경고 없이 무시한다. 첫 줄을 못 찾으면 못 읽음(architecture.diagram-unreadable 의 근거). 외부 파서 없이 정규식으로 읽는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlowchart } from '../src/lib/mermaid-subset.mjs';

const README = [
  '# 시스템 그림', '', '부품과 바깥 상대.', '', '```mermaid', 'flowchart LR',
  '  subgraph browser["브라우저"]', '    web["웹 화면"]', '  end',
  '  subgraph server["서버"]', '    bff["BFF 서버"]', '    subgraph data["자료"]', '      db["데이터베이스"]', '    end', '  end',
  '  subgraph outside["바깥"]', '    pay', '  end',
  '  web --> bff', '  bff --> db', '  bff --> pay', '  web -->|자료| bff', '  classDef x fill:#fff', '  style web stroke:#333', '  db -.-> log',
  '```', '', '| 부품 | 파일 | 이름 | 종류 |', '|---|---|---|---|', '| web | [web.md](web.md) | 웹 화면 | 우리 코드 |',
].join('\n');

test('SC-5 flowchart LR: subgraph 중첩·라벨 있는 노드·라벨 없는 노드·화살표를 읽고 나머지 문법은 무시한다', () => {
  const d = parseFlowchart(README);
  assert.equal(d.ok, true);
  assert.equal(d.direction, 'LR');
  assert.deepEqual(d.boundaries, [{ id: 'browser', label: '브라우저', parent: null }, { id: 'server', label: '서버', parent: null }, { id: 'data', label: '자료', parent: 'server' }, { id: 'outside', label: '바깥', parent: null }]);
  assert.deepEqual(d.nodes, [
    { id: 'web', label: '웹 화면', boundary: 'browser' }, { id: 'bff', label: 'BFF 서버', boundary: 'server' }, { id: 'db', label: '데이터베이스', boundary: 'data' }, { id: 'pay', label: 'pay', boundary: 'outside' },
  ]);
  // |자료| 라벨 화살표·점선 화살표·classDef·style 은 무시한다. 무시한 줄 수만 남긴다
  assert.deepEqual(d.edges, [{ from: 'web', to: 'bff' }, { from: 'bff', to: 'db' }, { from: 'bff', to: 'pay' }]);
  assert.equal(d.ignored, 4);
});

test('SC-5 flowchart TD 와 md 펜스 없는 원문도 읽고, 경계 밖 노드는 boundary null, 화살표에만 나온 id 도 노드다', () => {
  const d = parseFlowchart('flowchart TD\nweb["웹"]\nweb --> api\napi --> db\n');
  assert.deepEqual([d.ok, d.direction], [true, 'TD']);
  assert.deepEqual(d.nodes, [{ id: 'web', label: '웹', boundary: null }, { id: 'api', label: 'api', boundary: null }, { id: 'db', label: 'db', boundary: null }]);
  assert.deepEqual(d.edges, [{ from: 'web', to: 'api' }, { from: 'api', to: 'db' }]);
  assert.deepEqual(d.boundaries, []);
});

test('SC-5 못 읽음: flowchart LR·TD 첫 줄이 없으면(graph LR·sequenceDiagram·펜스 없음) ok false 와 까닭', () => {
  for (const text of ['graph LR\na --> b', 'sequenceDiagram\nA->>B: x', '# 그림만 없는 README\n\n| 부품 | 파일 |\n|---|---|\n', '```mermaid\nflowchart RL\na --> b\n```', '']) {
    const d = parseFlowchart(text);
    assert.equal(d.ok, false, text);
    assert.equal(d.reason, 'no-flowchart', text);
  }
  // 첫 mermaid 펜스만 읽는다. 뒤의 다른 그림은 보지 않는다
  const two = parseFlowchart('```mermaid\nflowchart LR\na --> b\n```\n\n```mermaid\nflowchart TD\nc --> d\n```\n');
  assert.deepEqual(two.edges, [{ from: 'a', to: 'b' }]);
});

test('SC-5 같은 노드를 두 번 선언하면 라벨은 처음 것, 같은 화살표는 한 번, subgraph 없는 end 는 무시', () => {
  const d = parseFlowchart('flowchart LR\nweb["웹"]\nweb["다른 이름"]\nweb --> bff\nweb --> bff\nend\n');
  assert.deepEqual(d.nodes, [{ id: 'web', label: '웹', boundary: null }, { id: 'bff', label: 'bff', boundary: null }]);
  assert.deepEqual(d.edges, [{ from: 'web', to: 'bff' }]);
});
