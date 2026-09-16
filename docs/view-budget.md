# 화면 예산

상황판이 복잡해지면 안 보게 된다. 그래서 단순함을 의지가 아니라 검사로 묶는다. 패키지의 `budget/view-budget.spec.mjs`가 개요를 열어 잰다. 프로젝트 루트에서 `npx --no playwright test --config node_modules/@pghoya2956/livemap/budget/playwright.config.mjs`(보통 `npm run map:budget`)로 부른다. `@playwright/test`는 프로젝트 의존성이다(엔진의 선택적 peer).

- 설정은 프로젝트 `map/config.json`의 `budget`을 읽는다.
- 산출물은 프로젝트 `map/.out/overview-1440.png`와 `map/.out/budget-results/`다.
- 대상은 엔진 `serve`(포트 `MAP_PORT`, 기본 4181)다. `LIVEMAP_BUDGET_STATIC=<export 폴더>`면 `serve --static`을 잰다.

## 규칙과 이유

| 규칙 | 값(`config.budget`) | 이유 |
|---|---|---|
| 첫 화면은 세 질문만 | 어디까지 됐나 · 지금 무엇을 하나 · 무엇이 바뀌었나 | 이 셋에 답하지 않는 패널은 첫 화면에 못 들어온다 |
| 스크롤 0 | viewport 1440×900 | 한 눈에 전체 상태. 한국 상황판 문법 |
| 패널 수 | ≤ 8 | 지금 5. 더하려면 하나를 뺀다 |
| 목록 패널 행 수 | ≤ 6 (목록이 둘이면 각각) | 훑어 읽을 수 있는 한계 |
| 여정 매트릭스 행 | ≤ 12 | 여정이 그보다 많으면 레인을 합친다 |
| 시스템 식별자 | 0 | 첫 화면은 사용자 어휘만. 경로·파일명·sha는 상세 층 |
| 내비 | ≤ 5 | 개요·여정·작업·변화·더보기 |
| 깊이 | 3 | 개요 → 목록 → 상세. 화면·API·DB 표는 장면 상세에서만 도달 |
| CSP 아래 렌더 | 콘솔 오류 0, 사이드바 배경 적용 | 인라인 의존 회귀 방지 |

## 개요 조각

개요는 `overview.json`만 읽는다. `derive.mjs`의 `overviewSlice()`가 경로·파일명·sha를 뺀 조각을 만들고, 검사는 개요 본문에서 `/api/`·`.tsx`·`.mjs`·`.sql`·`web/src`·7자 이상 16진수를 찾아 하나라도 있으면 실패한다. 개요에 무언가를 더할 때 이 조각을 거치지 않으면 식별자가 새어 들어온다.

## 다시 보게 만드는 것

- 마지막 방문 시각을 브라우저 안에 기억해(밖으로 보내지 않는다) 그 뒤 바뀐 커밋·장면에 빨간 점을 찍는다.
- 상단 띠 한 줄: 동작 장면 수·실데이터 화면 수·14일 커밋·미배포·경고·다음 한 걸음. 들어오자마자 읽을 한 문장.
- 2주 뒤 실제로 연 뷰만 남긴다. 안 연 패널은 지운다.

## 패널을 바꾸는 절차

화면 파일은 엔진 소유다. 패널을 바꾸는 일은 엔진 저장소에서 하고 릴리스로 내보낸다.

1. 답하려는 질문이 세 질문 중 무엇인지 적는다. 없으면 상세 층으로 간다.
2. 뺄 패널을 정한다.
3. 엔진 저장소 `site/map.js`의 `overview()`에서 `<section class="panel" data-budget="list|matrix">`로 만든다. 인라인 style 금지, 폭은 `data-w`.
4. 엔진 CI의 tarball 스모크(픽스처)와, 쓰는 프로젝트에 `npm install --no-save --install-links <엔진 저장소>`로 끼운 `npm run map:budget`으로 스크롤·행·식별자를 잰다. 스크린샷 `map/.out/overview-1440.png`을 사용자에게 보인다.
