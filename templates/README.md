# 프로젝트 상황판

제품 오너가 코드를 읽지 않고 "어디까지 실제로 동작하나, 지금 무엇을 하나, 무엇이 바뀌었나"를 한 화면에서 보고, 여정 → 장면 → 화면·API·DB·검사·결정·작업으로 파고드는 뷰다. 엔진은 npm 패키지 `@pghoya2956/livemap`이고, 이 폴더에는 프로젝트 소유 파일만 둔다. 배포본 주소: `<배포 주소>/map/`. 실시간은 로컬 `npm run map:serve`.

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run map` | 저장소 스캔 → `map/.out/{graph,data,overview}.json` (git 제외) |
| `npm run map:check` | 정합 검사. 오류면 exit 1(CI 게이트): 어댑터 실패·바닥값 미달·장면이 가리키는 라우트 없음·상태 모순·참조 미해결 |
| `npm run map:serve` | `http://127.0.0.1:4180/map/` 로컬 뷰. 요청마다 재빌드(5초 캐시) |
| `npm run map:budget` | 화면 예산 Playwright 검사 + 개요 스크린샷 `map/.out/overview-1440.png` |
| `npm run map:export` | 배포용 한 폴더 `map/.out/site`(먼저 `npm run map`) |
| `npm run test:report` | 단위 검사를 JUnit으로 남겨 장면 등급 A(최신 커밋에서 통과) 판정에 쓴다 |

## 이 폴더

| 파일 | 내용 |
|---|---|
| `config.json` | 어댑터 입력 경로·바닥값·화면 예산. `engine`은 엔진 major |
| `semantic/journeys.json` | 여정 파일: 배우·목표·장면. 장면 상태가 바뀌는 병합은 같은 커밋에서 이 파일을 고친다. 사람이 적는 곳은 이 파일과 로드맵(`config.json`의 `roadmap.file`, 마일스톤 포함)·작업 장부·작업 폴더 문서다 |
| `captures/*.jpg` | 장면 캡처 |
| `adapters/<이름>.mjs` | 이 프로젝트만의 어댑터(선택). 참조 어댑터와 이름이 같으면 참조 어댑터를 가린다 |

작성 안내·어댑터 계약·서빙 방법은 `node_modules/@pghoya2956/livemap/docs/`에 있다.

## 업그레이드

`npm i -D -E @pghoya2956/livemap@<버전>`을 커밋한다. major가 바뀌면 `docs/migrate.md`를 따른다.
