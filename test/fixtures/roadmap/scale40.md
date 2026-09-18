# 로드맵

40개 규모 합성 자료. 마일스톤 절이 0건이라 선행 깊이가 열이 되는 `layer` 모드로 읽힌다. 선행 깊이는 0부터 9까지 10단계이고, 깊이별 인원은 8·6·5·5·4·3·3·2·2·2다. 실제 프로젝트 자료가 아니다.

## 계정 스키마

사용자와 조직을 담을 표를 만든다.

- id: acct-schema
- 상태: 완료
- 진행 방식: 계획
- 장면: j1/s1

## 권한 모델

누가 무엇을 볼 수 있는지 정한다.

- id: perm-model
- 상태: 완료
- 진행 방식: 계획

## 감사 로그 골격

무슨 일이 있었는지 기록할 자리를 만든다.

- id: audit-base
- 상태: 완료
- 진행 방식: 계획

## 파일 저장소

올린 파일을 보관한다.

- id: file-store
- 상태: 완료
- 진행 방식: 계획

## 알림 큐

보낼 알림을 줄 세운다.

- id: notify-queue
- 상태: 완료
- 진행 방식: 계획

## 설정 서비스

조직마다 다른 값을 한 군데서 읽는다.

- id: config-svc
- 상태: 완료
- 진행 방식: 계획

## 검색 색인

목록을 검색할 수 있게 색인을 만든다.

- id: search-index
- 상태: 완료
- 진행 방식: 계획

## 보존 기간 정책

무엇을 얼마나 오래 두는지 정한다.

- id: retention
- 상태: 완료
- 진행 방식: 계획

## 로그인

계정으로 들어오고 나간다.

- id: signin
- 상태: 완료
- 진행 방식: 계획
- 장면: j1/s1
- 선행: acct-schema

## 초대

사람을 조직에 부른다.

- id: invite
- 상태: 완료
- 진행 방식: 계획
- 선행: perm-model

## 파일 올리기

파일을 골라 저장소에 넣는다.

- id: upload
- 상태: 완료
- 진행 방식: 계획
- 선행: file-store

## 알림 보내기

큐에 든 알림을 실제로 보낸다.

- id: notify-send
- 상태: 완료
- 진행 방식: 계획
- 선행: notify-queue

## 설정 화면

조직 설정을 사람이 고친다.

- id: config-ui
- 상태: 완료
- 진행 방식: 계획
- 장면: j1/s2
- 선행: config-svc

## 색인 재구축

자료가 바뀌면 색인을 다시 만든다.

- id: reindex
- 상태: 완료
- 진행 방식: 계획
- 선행: search-index

## 조직 관리

조직과 구성원을 관리한다.

- id: org-admin
- 상태: 진행
- 진행 방식: 스펙 주도
- 작업: 20260101-sample
- 장면: j1/s2
- 선행: signin, invite
- 완료 기준: 구성원을 부르고 내보내는 두 길이 끝까지 돈다

## 공유 링크

파일을 링크로 연다.

- id: share-link
- 상태: 진행
- 진행 방식: 스펙 주도
- 작업: 20260101-sample
- 선행: upload, retention

## 알림 구독

어떤 알림을 받을지 켜고 끈다.

- id: notify-sub
- 상태: 진행
- 진행 방식: 스펙 주도
- 작업: 20260101-sample
- 선행: notify-send

## 검색 화면

검색어로 목록을 좁힌다.

- id: search-ui
- 상태: 진행
- 진행 방식: 스펙 주도
- 작업: 20260101-sample
- 장면: j1/s2
- 선행: reindex

## 감사 조회

기록을 사람이 읽는다.

- id: audit-view
- 상태: 진행
- 진행 방식: 스펙 주도
- 작업: 20260101-sample
- 선행: audit-base, signin

## 팀 폴더

팀마다 쓰는 폴더를 나눈다.

- id: team-folder
- 상태: 다음
- 진행 방식: 계획
- 선행: org-admin

## 만료 링크

공유 링크에 기한을 건다.

- id: link-expiry
- 상태: 다음
- 진행 방식: 계획
- 선행: share-link

## 요약 메일

하루치 알림을 하나로 묶어 보낸다.

- id: digest-mail
- 상태: 다음
- 진행 방식: 계획
- 선행: notify-sub

## 검색 필터

검색 결과를 조건으로 더 좁힌다.

- id: search-filter
- 상태: 다음
- 진행 방식: 계획
- 장면: j1/s3
- 선행: search-ui

## 권한 감사 리포트

권한이 어떻게 쓰였는지 문서로 낸다.

- id: perm-report
- 상태: 다음
- 진행 방식: 계획
- 선행: audit-view, config-ui

## 작업 공간

여러 팀 폴더를 하나로 묶는다.

- id: workspace
- 상태: 대기
- 진행 방식: 계획
- 선행: team-folder
- 결정 대기: 사용자: 팀 폴더와 작업 공간을 따로 둘지

## 외부 공유 승인

바깥으로 나가는 공유를 사람이 승인한다.

- id: ext-approval
- 상태: 대기
- 진행 방식: 계획
- 선행: link-expiry

## 알림 규칙

어떤 일에 어떤 알림을 낼지 규칙으로 적는다.

- id: notify-rules
- 상태: 대기
- 진행 방식: 계획
- 선행: digest-mail

## 저장 검색

자주 쓰는 검색을 이름으로 저장한다.

- id: saved-search
- 상태: 대기
- 진행 방식: 계획
- 선행: search-filter

## 프로젝트 보드

일을 칸으로 옮기며 본다.

- id: project-board
- 상태: 이후
- 진행 방식: 계획
- 선행: workspace

## 공유 만료 알림

기한이 다가온 공유를 알린다.

- id: share-alert
- 상태: 이후
- 진행 방식: 계획
- 선행: ext-approval, notify-rules

## 저장 검색 공유

저장한 검색을 팀과 나눈다.

- id: search-share
- 상태: 이후
- 진행 방식: 계획
- 선행: saved-search, perm-report

## 보드 자동화

보드의 칸 이동을 규칙으로 자동화한다.

- id: board-automation
- 상태: 이후
- 진행 방식: 계획
- 선행: project-board

## 규정 준수 내보내기

감사에 낼 자료를 한 번에 내려받는다.

- id: compliance-export
- 상태: 이후
- 진행 방식: 계획
- 선행: share-alert

## 사용량 대시보드

누가 얼마나 썼는지 숫자로 본다.

- id: usage-dash
- 상태: 이후
- 진행 방식: 계획
- 선행: search-share

## 자동화 템플릿

자주 쓰는 자동화를 틀로 만든다.

- id: automation-template
- 상태: 이후
- 진행 방식: 계획
- 선행: board-automation

## 청구 연동

쓴 만큼을 청구 시스템에 넘긴다.

- id: billing-link
- 상태: 이후
- 진행 방식: 계획
- 선행: compliance-export, usage-dash

## 마켓플레이스

남이 만든 자동화를 골라 쓴다.

- id: marketplace
- 상태: 이후
- 진행 방식: 계획
- 선행: automation-template

## 사용량 기반 요금제

쓴 만큼 내는 요금제를 연다.

- id: usage-pricing
- 상태: 이후
- 진행 방식: 계획
- 선행: billing-link

## 파트너 API

바깥 도구가 붙을 길을 연다.

- id: partner-api
- 상태: 이후
- 진행 방식: 계획
- 선행: marketplace

## 셀프서비스 온보딩

영업 없이 혼자 시작한다.

- id: self-onboard
- 상태: 이후
- 진행 방식: 계획
- 선행: usage-pricing, marketplace
