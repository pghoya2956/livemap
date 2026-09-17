# livemap Monitor 사용 규칙

프로젝트 상황판(제품의 기능·단계·로드맵·변경을 한 화면에 보이는 다크 모니터)을 만드는 컴포넌트다. 모든 컴포넌트는 `window.Livemap`에서 꺼낸다.

## 설정

- 감싸는 Provider는 없다. `styles.css`를 읽으면 `body`가 다크 바탕(`--bg`)과 Pretendard 서체를 받는다.
- 바탕이 흰 곳에 작은 컴포넌트(Chip·Tag·Pill·Dot·Gauge·Sparkline·StatusBar·AreaChart)를 놓으면 흐린 글자가 안 보인다. 반드시 `Panel` 안이나 `var(--panel)` 바탕 위에 둔다.
- `FeatureMap`은 부모 높이를 채운다. 높이가 정해진 `Panel`이나 `div` 안에 둔다.
- 첫 화면 전체는 `Overview`에 `MonitorData` 하나를 넘기면 된다. 3열 격자(`.grid` > `.col.l`·`.col.c`·`.col.r`)가 뷰포트 높이를 채운다.

## 스타일 방식

CSS 변수 토큰과 짧은 클래스 이름을 쓴다. 새 색을 만들지 말고 토큰을 쓴다.

| 용도 | 토큰 |
|---|---|
| 바탕·패널·선 | `--bg` `--panel` `--panel2` `--line` `--line2` |
| 글자 | `--ink` 본문, `--muted` 보조, `--dim` 흐림 |
| 상태 | `--green` 동작·완료, `--amber` 목업·진행·경고, `--violet` 구상·다음, `--plan` 계획, `--red` 실패·LIVE |
| 강조·상호작용 | `--cyan`(선택, 링크, 차트 선) |
| 옅은 칠 | `--green-soft` `--amber-soft` `--violet-soft` `--cyan-soft` `--red-soft` |
| 서체 | `--sans`, 숫자는 `--mono` 또는 클래스 `num` |

패널 안 조립에 쓰는 클래스:

- 본문 여백 `pb`, 목록 `rows` > `row`(안에 `Tag` + `body` > `tt` 제목, `meta` 보조)
- 칩 줄 `chips`, 경보 상자 `alert`(`h` 머리, `p` 본문), 큰 숫자 칸 `sig` > `mag`(`hot`·`warm`)
- 상태 기록 `stat`·`stats3`, 좌우 값 목록 `kv`, 증감 글자 `up`·`dn`·`fl`

상태 단어는 동작(live)·목업(mock)·계획(planned)·구상(next)로 고정한다. `Tag kind`에는 이 영문 키나 로드맵 상태(완료·진행·다음·대기·이후), 변경 종류(기능·수정·화면·배포·문서·검사)를 넣는다.

## 참고할 원본

- `styles.css`와 그 안의 `_ds_bundle.css`: 토큰과 클래스 전체
- 컴포넌트별 `.d.ts`: `MonitorData`, `Journey`, `RoadmapItem` 자료 모양
- 컴포넌트별 `.prompt.md`: 쓰임과 예시

## 조립 예

```jsx
const { Panel, Icons, Tag, Sparkline } = window.Livemap;

<Panel icon={Icons.trend} title="이번 주 기능" sub="변경 많은 순" at="17:30 기준">
  <div className="pb">
    <div className="rows">
      <div className="row">
        <Tag kind="live">동작</Tag>
        <div className="body"><div className="tt">예약부터 결제까지</div><div className="meta">캠퍼 · 5/5 단계</div></div>
        <Sparkline series={[0, 2, 1, 4, 3, 6, 5]} color="var(--cyan)" />
      </div>
    </div>
  </div>
</Panel>
```
