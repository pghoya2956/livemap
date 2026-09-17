// 기능 화면(#/journeys). 뼈대: 화면 루트와 제목만. 내용은 Phase 3 하위 화면 이식(P3-04~P3-07)이 채운다.
import React from 'react';
import { Screen } from './common.jsx';

/** ov: overview.json, data: data.json, params: parseRoute 결과의 params */
export function Journeys({ ov, data, params }) {
  return <Screen ov={ov} screen="journeys" nav={1} title="기능" />;
}
