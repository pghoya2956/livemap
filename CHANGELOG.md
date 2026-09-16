# Changelog

버전마다 `## [X.Y.Z] - YYYY-MM-DD` 절을 둔다. 릴리스 워크플로가 태그 버전의 절이 있는지 확인한다.

## [1.0.0] - 2026-09-17

첫 공개 판. 한 프로젝트 저장소 안에 있던 상황판 엔진을 패키지로 옮겼다.

- 명령 `livemap build | check | serve | export | init | test-report | --version`. npm bin 심링크로 불러도 실행된다.
- 기본 루트는 명령을 부른 폴더(`process.cwd()`), 설정은 `map/config.json`, 캡처는 `captures.site`(기본 `map/captures`).
- `config.json`의 `engine`(major)이 엔진과 다르면 exit 2. 키가 없으면 1로 본다.
- `export <dir>`: 화면·서체·캡처·생성물을 `/map/` 주소 배치 그대로 한 폴더에 모은다. `serve --static <dir>`이 같은 배치를 준다.
- 서체(Pretendard Variable, SIL OFL)를 `site/fonts/`에 번들하고 CSS는 상대 경로로 부른다.
- 화면 예산 검사 설정 `budget/playwright.config.mjs`는 프로젝트 루트 기준으로 산출물을 쓴다. `@playwright/test`는 선택적 peer다.
- 프로젝트 어댑터가 같은 이름의 참조 어댑터를 가리면 한 줄로 알린다.
