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
7. 확인: 전환 전(옛 설치)과 전환 뒤(패키지)를 같은 커밋에서 연속으로 돌려 비교한다.
   - 비교 대상은 `map/.out/`의 `graph.json`·`data.json`·`overview.json`과 `npm run map:check` 출력이다. 전환 전 결과를 다른 폴더에 복사해 두고 전환 뒤 같은 명령으로 다시 만든다.
   - 옛 설치와 같은 판의 엔진으로 옮기면 세 파일이 `generatedAt`을 빼면 같고 `check` 출력도 같다.
   - 전환하면서 엔진 판도 올리면 파일이 같지 않다. minor 판은 필드·노드를 더하기만 하므로, 전환 전 파일의 모든 경로·값이 전환 뒤 파일에 있는지(포함) 보고 새로 생긴 경로가 그 판의 CHANGELOG 항목인지 확인한다. `check`는 전환 전 출력에 CHANGELOG가 적은 새 줄만 더해져야 하고 오류 수는 같아야 한다.
   - 활동 숫자는 실행 시각 기준 14일 창(`git.sinceDays`)이라 두 실행 사이에 창 경계를 넘는 커밋이 있으면 달라진다. 차이가 경계 커밋뿐인지 보고 연속으로 다시 돌린다. `npm ci`와 설치 시간은 두 실행 사이가 아니라 앞에 둔다.
   - 끝으로 `npm run map:budget`이 통과하고 스크린샷 `map/.out/overview-1440.png`이 전환 전과 같은 정보를 보이는지 본다.

로컬에서 고친 엔진을 끼워 볼 때는 `npm install --no-save --install-links <엔진 저장소 경로>`를 쓴다. `--install-links` 없이 폴더를 설치하면 심링크가 되어 예산 설정이 `@playwright/test`를 엔진 저장소 쪽에서 찾다 실패한다.
