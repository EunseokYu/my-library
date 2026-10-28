# CODEMAP — 나의 서재

기준: 커밋 `7eea0d9` · `index.html` 1,788줄 / 196,736바이트 · 탭 제목 `나의 서재 v2.13.0`.
줄 번호는 참고용이에요. 바뀌면 함수명으로 찾아요(`rg -n "function 이름" index.html`).

## 파일
| 경로 | 역할 |
|---|---|
| `index.html` | 앱 전체(CSS ~1–130줄, JS IIFE 하나 ~132–1788줄). 외부 라이브러리 없음 |
| `docs/UX_PLAN.md` | 사용성 검토와 작업 명세(T0~T5) |
| `docs/HANDOFF.md` | 현재 상태·다음 작업 |
| `tests/` | 개발용 테스트(Playwright + node:test), 합성 fixture. 배포 앱과 무관 |

## 배포
- GitHub Pages: `main` 가지 루트 → https://eunseokyu.github.io/my-library/
- 인증 복귀 주소 `APP_URL`(~996)이 위 주소로 고정이에요. 로컬에서는 로그인 흐름을 실험하지 않아요.

## 저장 계약 (바꾸지 말 것)
- localStorage: `mnemosyne-library-v1`(책 배열), `my-library-{kakao,gemini}-key-v1`, `-theme-v1`, `-ai-pause-v1`, `-auth-v1`, `-sync-v1`, `-edition-map-v1`
- 백업 JSON: `{app:'Mnemosyne', version:2, displayName, exportedAt, books}` — `exportData`(~1766), `handleImport`(~1767), `restore(mode)`(~1768)
- 상태: `statuses={want,reading,done}`(~134). 서재·검색은 done만 보여 주고, 다른 상태도 저장·백업돼요.

## 데이터 흐름
```
normalize(b)  ~989   모든 책의 입구(필드 정리·기본값). 새 필드 → normalize + handleSave 둘 다
persist(list) ~1279  localStorage 쓰기 + 다시 읽어 검증 → trackChanges(list)(~1014, 동기화 대기열)
commit(list,msg) ~1290  persist 성공 → books=list → render() → flash(msg)
softRender()  ~581   뒤쪽 갱신용(AI·그리기·동기화). edit 창이나 #newQuote에 글이 있으면 건너뜀
render()      ~1475  #root 전체와 열린 창(showDialog ~1481)을 다시 그림 → 입력칸 DOM 교체
```
- `load/loadLocal`(~1271): 손상 데이터면 `loadProblem` → persist 차단, 원본 보관(raw-download / raw-reset)

## 화면 상태 (모듈 변수)
- `view`: library | insights | settings · `dialog`: null | detail | edit | restore · `editing`: 책 ID
- `search`, `tagFilter`, `sort`(최근·title·rating) → `getShown()`(~1473, done만 + 태그 + 문자열 검색 + 정렬)
- 책장: `packShelves`(~1418) / `layoutShelf`(~1429) / `fitSpineTitles`(~1373) / `spineHTML`(~1299)

## 이벤트 (끝부분 ~1775–1786)
- 문서 하나의 `click` 위임: `[data-tag]` → 색 → 테마 → 검색 결과 → `[data-book]`(상세 열기) → `[data-rate]`(commit) → `[data-action]` switch
- action: add, edit, delete, close, add-quote, del-quote, toggle-life, export, import, merge, replace, save-key, save-ai-key, sync-login/now/logout, ai-*, draw-all 등
- `keydown` Esc → `requestClose()`(~1774): **dialog==='edit'일 때만** 변경 확인 → `close()`(~1764)
- `storage` 이벤트: 다른 탭이 책을 바꾸면 창이 닫혀 있을 때만 다시 읽음

## T1 관련 지점 (U01·U02·U11)
- U01: 상세 창의 `[data-rate]`·`toggle-life` → `commit` → `render` → `#newQuote`·`#newQuotePage`가 지워짐. softRender 보호는 `#newQuote` 하나만 보고 쪽수 칸은 보지 않음
- U02: `requestClose`가 상세 창 초안을 검사하지 않음. ×(`close`)·배경 클릭(overlay + `downTarget`)·Esc는 requestClose를 거치지만, `[data-tag]` 이동은 dialog를 바로 비움
- U11: `showDialogInner`가 만드는 `.overlay`/모달에 role·aria-modal·초점 제한이 없음. 닫을 때 `lastSpine` 초점 복귀는 있음

## 클라우드 (Supabase, fetch 직접)
- `SB_URL`·`SB_KEY`(publishable, ~994) · `sbFetch`(~1059, 401이면 refresh)
- 로그인: `sendLoginLink`(~1088) → `handleAuthRedirect`(~1075) · `signedOut`(~1037)
- 동기화: `scheduleSync`(~1102, 1.5초) → `syncNow`(~1105). 받은 뒤 `softRender()`
- 키 보관: `syncKeys`(~1188, user_settings) · 상태 문구: `syncStatusText`(~1248)
- 공유 기록: `workKeyOf`(~1211) · `cacheLookup`/`putCache`/`shareMotif`(work_cache) · `loadEdMapShared`/`shareEdMap`(edition_map)

## 외부 API
- 카카오: `searchKakaoBooks`(~1696) · `fetchJson`(~1664) · `mapKakao`(~1680) · 결과 묶기 `groupWorks`/`mergeEditionGroups`/`rankedWorks`
- 작품 판별: `titleKey`·`workBaseTitle`(~1534)·`cleanAuthor`(~1513)·`canonicalWork`(~1558)·`edMapGet`(~1575)
- Gemini: `callGemini`(~350, 429 쉬기 `setPause`) · 소개 `analyzeBook`(~751)/`analyzeAll` · 상징 `queueDraw`(~675)/`runDrawQueue`(~692), `DRAW_BATCH=5`
- AI SVG는 `sanitizeMotifSvg`(~212)로만 넣음

## 저장 직전 검사
- `handleSave`(~1765): 제목 필수, Notion·표지 주소 검사, 손대지 않은 소개·상징은 최신값 유지(`formInit`), 작품 중복 검사
