# design-sync 기록(livemap)

- 동기화 대상은 저장소 루트 패키지가 아니라 `ui/package.json`(`@pghoya2956/livemap-ui`, private)이다. 루트 패키지에는 types가 없고 npm 배포 대상도 아니다.
- 빌드: `node scripts/build-ui.mjs` → `ui/dist-lib/index.js`(React 외부 ESM)와 `ui/fonts/`(site/fonts 사본). 변환기는 `--entry ./ui/dist-lib/index.js --node-modules ./node_modules`.
- `ui/index.d.ts`는 손으로 쓴 타입이다. 컴포넌트 props를 바꾸면 같이 고친다.
- `Icons`는 컴포넌트가 아니라 `componentSrcMap`에서 뺐다.
- 미리보기 자료는 `.design-sync/sample/monitor.ts`의 가상 제품(CampNote)이다. 공개 저장소라 실제 프로젝트 자료를 넣지 않는다.
- 카드 바탕이 흰색이라 작은 컴포넌트 미리보기는 `var(--panel)` 바탕 상자로 감쌌다.
- 플레이라이트는 `.ds-sync`에 `playwright@1.63.0`(chromium_headless_shell-1243 캐시와 일치).

## Known render warns

- `[RENDER_THIN] Sparkline`: 글자가 없는 선 그림이라 뜬다. 스크린샷으로 선이 그려진 것을 확인했다.

## Re-sync risks

- 컴포넌트와 스타일은 2026-09-17 원형이다. 설계 빈틈 검토와 스펙 재검토 뒤 props·자료 모양이 바뀔 수 있어 다음 동기화에서 `index.d.ts`와 미리보기가 함께 낡는다.
- `ui/styles.css`는 엔진 화면과 공유한다. 엔진 쪽 CSS 변경이 카드 모양을 바꾼다.
- 서체는 `site/fonts`에서 복사한다. 서체 교체 시 `ui/fonts` 재생성이 필요하다.
