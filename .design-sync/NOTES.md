# design-sync 기록(livemap)

- 동기화 대상은 저장소 루트 패키지가 아니라 `ui/package.json`(`@pghoya2956/livemap-ui`, private)이다. 루트 패키지에는 types가 없고 npm 배포 대상도 아니다.
- 빌드: `node scripts/build-ui.mjs --lib` → `ui/dist-lib/index.js`(React 외부 ESM)와 `ui/fonts/`(site/fonts 사본). 변환기는 `--entry ./ui/dist-lib/index.js --node-modules ./node_modules`.
- `ui/index.d.ts`는 손으로 쓴 타입이다. 컴포넌트 props를 바꾸면 같이 고친다.
- `Icons`는 컴포넌트가 아니라 `componentSrcMap`에서 뺐다.
- 미리보기 자료는 `.design-sync/sample/monitor.ts`의 가상 제품(CampNote)이다. 공개 저장소라 실제 프로젝트 자료를 넣지 않는다. 모양은 livemap 1.1.0 `overview.json`(`OverviewData`)이고, 마일스톤 있는 `data`와 마일스톤 없는 `roadmapOnly` 두 벌이다. 캡처만 같은 출처 파일 대신 `src`(data: 그림)를 쓴다.
- 카드 바탕이 흰색이라 작은 컴포넌트 미리보기는 `var(--panel)` 바탕 상자로 감쌌다.
- 플레이라이트는 `.ds-sync`에 `playwright@1.63.0`(chromium_headless_shell-1243 캐시와 일치).

## 하위 화면은 올리지 않음(2026-09-17 결정)

- Phase 3에서 이식한 하위 화면(`ui/routes/` 기능·로드맵·작업·더보기와 공통 조각)과 해시 라우터(`ui/main.jsx`)는 `ui/index.js` export에 넣지 않아 Claude Design에 올리지 않는다. 컴포넌트 공유 대상은 개요(DEC-13)이고, 하위 화면은 1.0.1 정보·배치를 옮긴 것이라 디자인 대상이 아니다. 올리게 되면 `data.json` 모양의 가상 자료와 하위 화면 타입부터 더한다.

## Known render warns

- `[RENDER_THIN] Sparkline`: 글자가 없는 선 그림이라 뜬다. 스크린샷으로 선이 그려진 것을 확인했다.
- `[FONT_MISSING] "Apple SD Gothic Neo"`: `--sans` 서체 목록의 운영체제 한글 대체 서체라 싣지 않는다. 브랜드 서체 Pretendard Variable은 `fonts/`로 실린다(2026-09-17 재동기화에서 확인).

## Re-sync risks

- 컴포넌트와 스타일은 2026-09-17 원형 보정판(스펙 1.1.0 개요, Phase 1 P1-03)이다. 로드맵 패널 컴포넌트는 `MilestonePanel`로 이름이 바뀌었고 `StepMark` 미리보기가 새로 생겼다. Claude Design 프로젝트에 남은 옛 로드맵 패널 카드는 다음 동기화에서 지운다.
- 자료 모양은 1.1.0 `overview.json`이다. 엔진 Phase 2(`overviewSlice`)나 Phase 3(하위 화면 라우터) 뒤 필드·props가 바뀌면 `ui/index.d.ts`, `sample/monitor.ts`, 미리보기를 함께 고친다. 로컬 확인은 ts-morph(`.ds-sync/node_modules`)로 미리보기·자료를 `index.d.ts`에 대조하는 방법을 썼다.
- 이동 요소는 `a[href^="#/"]`다. 엔진 화면에서는 `ui/main.jsx` 라우터가 하위 화면을 그리지만, Claude Design 카드에는 라우터가 없어 누르면 해시만 바뀐다.
- `Overview`의 `current`(내비 선택)와 특보 행 순서(이상 신호 먼저)는 이식판 기준이다. 개요 컴포넌트 props가 바뀌면 `index.d.ts`·미리보기를 함께 고친다.
- 기능 지도 라벨은 SVG 글자가 아니라 절대 위치 HTML(`.jl`·`.zl`)이다. 카드 크기가 작으면 라벨이 말줄임된다.
- `ui/styles.css`는 엔진 화면과 공유한다. 엔진 쪽 CSS 변경이 카드 모양을 바꾼다.
- 서체는 `site/fonts`에서 복사한다. 서체 교체 시 `ui/fonts` 재생성이 필요하다.

## 2026-09-18 재동기화(1.2.0)

- 엔진 1.2.0의 읽기 상태·판정 표시가 들어간 뒤 드라이버 판정은 렌더 21개 모두 unchanged였다. 미리보기 자료(`sample/monitor.ts`)에 "?"·판정이 들어간 개요가 없어 그림이 그대로이고, 바뀐 것은 컴포넌트 소스·타입·설명이다. 업로드 대상은 12개 컴포넌트와 번들·스타일이었고 삭제는 없었다.
- 다음 재동기화에서 "?"·판정 표시를 카드로 보이려면 `sample/monitor.ts`에 `counts.openQuestions`가 partial이고 `reading`이 붙은 한 벌을 더한다.
- 하위 화면(더보기 검사 탭의 읽기 이유 문장 등)은 여전히 올리지 않는다.

## 2026-09-19 재동기화(1.3.0)

- 1.3.0이 `ui/styles.css`에 로드맵 트리 규칙 55줄을 더하고 `Overview`·`CapturePanel`을 고쳤다. 드라이버 판정은 렌더 churn 12개(`AreaChart`·`CapturePanel`·`ChangesPanel`·`FeatureMap`·`FeatureTablePanel`·`FeatureTrendPanel`·`MilestonePanel`·`Overview`·`ProgressPanel`·`SignalsPanel`·`Ticker`·`TopBar`)였고 등급 재판정 대상은 0건이었다. 표본 다섯을 다시 찍어 통과했다. 업로드는 컴포넌트 12개와 번들·스타일이고 삭제는 없었다.
- **`npm ci`가 `node_modules/@pghoya2956/livemap-ui` 링크를 지운다.** 이 저장소는 workspaces를 안 쓰고 그 링크가 수동이라, 릴리스 선행 검사로 `npm ci`를 돌린 뒤 재동기화를 하면 드라이버가 `livemap-ui/package.json`을 못 찾아 빌드 단계에서 멈춘다. `mkdir -p node_modules/@pghoya2956 && ln -sfn ../../ui node_modules/@pghoya2956/livemap-ui`로 되살린 뒤 `--node-modules node_modules`로 돌린다. `--node-modules`를 `.ds-sync/node_modules`로 주면 react를 못 찾고, 임시 폴더에 심볼릭 링크를 모아 주면 esbuild가 react를 못 푼다. 저장소의 진짜 `node_modules`를 써야 한다.
- `RoadmapTree`는 `ui/index.js` 공개 목록에 없어 디자인 시스템 컴포넌트가 아니다. 트리 화면은 카드로 올라가지 않는다. 다음에 올릴지는 별도 판단이다.
