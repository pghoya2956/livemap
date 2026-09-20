# 웹 화면

사용자가 브라우저에서 보는 화면 전부. 자료는 BFF 에서만 받는다.

- id: web
- 폴더: web/src

## 층: 화면

라우트 하나에 대응하는 페이지. 자료 받기와 목업을 가져다 조립한다.

- id: pages
- 폴더: web/src/pages
- 가져올 수 있는 층: lib, mock

## 층: 자료 받기

BFF 호출과 형 변환. 화면을 가져오지 않는다.

- id: lib
- 폴더: web/src/lib
- 가져올 수 있는 층: —

## 층: 목업

실데이터가 아직 없는 화면이 쓰는 고정 자료.

- id: mock
- 폴더: web/src/mock
- 가져올 수 있는 층: —

## 흐름: 동작 장면

사용자가 동작 화면에서 목록을 본다.

- id: live-flow
- 단계: j1/s1
- 지나는 곳: 화면 /live → 함수 web/src/pages/Live.tsx:Live → API GET /api/resorts → DB 함수 list_resorts → 테이블 app.resorts
