# 이행 문서

`map/config.json`의 `engine`은 그 설정이 따르는 엔진 major다. 엔진은 자기 major와 다르면 멈추고 이 문서를 가리킨다. major가 바뀌는 릴리스마다 아래에 절을 더한다.

## 옛 설치 방식 → 1.x

프로젝트 `map/` 안에 엔진 파일을 복사해 쓰던 설치에서 옮길 때.

1. `npm i -D -E @pghoya2956/livemap@<버전>`(예산 검사를 쓰면 `@playwright/test`도 프로젝트 devDependency로 둔다).
2. `map/`에서 엔진 파일을 지운다: `cli.mjs`·`check.mjs`·`derive.mjs`·`serve.mjs`·`lib/`·`site/`의 `index.html`·`map.css`·`map.js`·`tests/`·`scripts/`·`semantic/schema.md`, 그리고 참조 어댑터 사본(`map/adapters/`에서 프로젝트가 직접 쓴 어댑터만 남긴다).
3. 캡처를 옛 화면 폴더(`map/site`) 아래 captures 폴더에서 `map/captures/`로 옮기고 `config.json`의 `captures.site`를 `map/captures`로 바꾼다.
4. `config.json`에 `"engine": 1`을 더한다.
5. npm 스크립트를 `livemap` 명령으로 바꾼다(`livemap init`이 없는 스크립트만 넣고 값이 다른 스크립트는 보고한다). 어댑터 단위 검사 스크립트는 지운다. 참조 어댑터 검사는 엔진 저장소 CI가 돈다.
6. 배포: 이미지 빌드 전에 `npm run map` → `npm run map:export`, 서버는 export 폴더 한 루트를 `/map/`로 준다(`hosting-and-csp.md`).
7. 확인: 전환 전후 `data.json`이 `generatedAt`을 빼면 같고 `check` 출력이 같은지, `npm run map:budget`이 통과하는지 본다.

로컬에서 고친 엔진을 끼워 볼 때는 `npm install --no-save --install-links <엔진 저장소 경로>`를 쓴다. `--install-links` 없이 폴더를 설치하면 심링크가 되어 예산 설정이 `@playwright/test`를 엔진 저장소 쪽에서 찾다 실패한다.
