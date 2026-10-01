# 워크스페이스 검사 픽스처

상위 폴더 하나와 자식 저장소 둘(`app`, `svc`)로 이루어진 여러 저장소 프로젝트다. `test/helpers/workspace-fixture.mjs`의 `makeWorkspace`가 임시 폴더로 복사한 뒤 자식부터 `git init`·커밋하고 상위를 `git init`·커밋한다. 저장소 안에 `.git`을 넣을 수 없어서다.

- 상위: `map/config.json`의 `workspace` 키가 `.agent/repos.yaml`을 가리킨다. `_gitignore`는 복사할 때 `.gitignore`로 바뀐다(첫 줄 `/*`와 화이트리스트라 엔진 저장소 안에서는 이 이름을 쓸 수 없다).
- `app`: 자기 `map/config.json`과 `tasks/`, 위키, 프로젝트 어댑터 `note`(자식 배지·경고, `WS_FIXTURE_LOG`가 있으면 빌드 횟수 기록)를 가진다. 설정 갈래 `child`.
- `svc`: 설정·`tasks/`가 없다. 설정 갈래 `auto`, 어댑터는 `git` 하나.
- 상위와 `app`에 같은 작업 폴더 `20260101-shared`가 있고 둘 다 `DEC-1`을 정의한다.
