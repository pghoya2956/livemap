# design-sync 기록(livemap)

- 동기화 대상은 저장소 루트 패키지가 아니라 `ui/package.json`(`@pghoya2956/livemap-ui`, private)이다. 루트 패키지에는 types가 없고 npm 배포 대상도 아니다.
- 빌드: `node scripts/build-ui.mjs` → `ui/dist-lib/index.js`(React 외부 ESM)와 `ui/fonts/`(site/fonts 사본). 변환기는 `--entry ./ui/dist-lib/index.js --node-modules ./node_modules`.
- `ui/index.d.ts`는 손으로 쓴 타입이다. 컴포넌트 props를 바꾸면 같이 고친다.
- `Icons`는 컴포넌트가 아니라 `componentSrcMap`에서 뺐다.
- 미리보기 자료는 `.design-sync/sample/monitor.ts`의 가상 제품(CampNote)이다. 공개 저장소라 실제 프로젝트 자료를 넣지 않는다. 모양은 livemap 1.1.0 `overview.json`(`OverviewData`)이고, 마일스톤 있는 `data`와 마일스톤 없는 `roadmapOnly` 두 벌이다. 캡처만 같은 출처 파일 대신 `src`(data: 그림)를 쓴다.
- 카드 바탕이 흰색이라 작은 컴포넌트 미리보기는 `var(--panel)` 바탕 상자로 감쌌다.
- 플레이라이트는 `.ds-sync`에 `playwright@1.63.0`(chromium_headless_shell-1243 캐시와 일치).

## Known render warns

- `[RENDER_THIN] Sparkline`: 글자가 없는 선 그림이라 뜬다. 스크린샷으로 선이 그려진 것을 확인했다.

## Re-sync risks

- 컴포넌트와 스타일은 2026-09-17 원형 보정판(스펙 1.1.0 개요, Phase 1 P1-03)이다. 로드맵 패널 컴포넌트는 `MilestonePanel`로 이름이 바뀌었고 `StepMark` 미리보기가 새로 생겼다. Claude Design 프로젝트에 남은 옛 로드맵 패널 카드는 다음 동기화에서 지운다.
- 자료 모양은 1.1.0 `overview.json`이다. 엔진 Phase 2(`overviewSlice`)나 Phase 3(하위 화면 라우터) 뒤 필드·props가 바뀌면 `ui/index.d.ts`, `sample/monitor.ts`, 미리보기를 함께 고친다. 로컬 확인은 ts-morph(`.ds-sync/node_modules`)로 미리보기·자료를 `index.d.ts`에 대조하는 방법을 썼다.
- 이동 요소는 `a[href^="#/"]`다. Claude Design 카드 안에서 누르면 해시만 바뀌고 화면은 그대로다.
- 기능 지도 라벨은 SVG 글자가 아니라 절대 위치 HTML(`.jl`·`.zl`)이다. 카드 크기가 작으면 라벨이 말줄임된다.
- `ui/styles.css`는 엔진 화면과 공유한다. 엔진 쪽 CSS 변경이 카드 모양을 바꾼다.
- 서체는 `site/fonts`에서 복사한다. 서체 교체 시 `ui/fonts` 재생성이 필요하다.
