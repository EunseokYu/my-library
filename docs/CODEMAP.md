# CODEMAP — 나의 서재

기준: T2 이후 · 탭 제목 `나의 서재 v2.14.0`. 원 기준 커밋 `7eea0d9`(v2.13.0, 단일 index.html 1,788줄).
아래 `~줄`은 예전 index.html 기준이에요. `js/app.js`에서는 대략 132를 빼고, 정확한 위치는 함수명으로 찾아요(`rg -n "function 이름" js/app.js`).

## 파일
| 경로 | 역할 |
|---|---|
| `index.html` | 뼈대만(#fatal-error, #root). `styles/app.css?v=`·`js/app.js?v=`를 상대 경로로 불러요 |
| `styles/app.css` | 스타일 전체(예전 `<style>` 두 블록을 순서대로) |
| `js/app.js` | 앱 코드 전체. `'use strict'` IIFE 하나이고, body 끝에서 동기 실행해요 |
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
softRender()  ~581   뒤쪽 갱신용(AI·그리기·동기화). edit 창일 때만 건너뜀(상세 창은 다시 그림)
render()      ~1475  captureDialogUI → #root 전체 교체 → showDialog(+a11yDialog) → restoreDialogUI
```
- `load/loadLocal`(~1271): 손상 데이터면 `loadProblem` → persist 차단, 원본 보관(raw-download / raw-reset)

## 화면 상태 (모듈 변수)
- `view`: library | insights | settings · `dialog`: null | detail | edit | restore · `editing`: 책 ID
- `search`, `tagFilter`, `sort`(최근·title·rating) → `getShown()`(~1473, done만 + 태그 + 문자열 검색 + 정렬)
- 책장: `packShelves`(~1418) / `layoutShelf`(~1429) / `fitSpineTitles`(~1373) / `spineHTML`(~1299)

## 이벤트 (끝부분 ~1775–1786)
- 문서 하나의 `click` 위임: `[data-tag]` → 색 → 테마 → 검색 결과 → `[data-book]`(상세 열기) → `[data-rate]`(commit) → `[data-action]` switch
- action: add, edit, delete, close, add-quote, del-quote, toggle-life, export, import, merge, replace, save-key, save-ai-key, sync-login/now/logout, ai-*, draw-all 등
- `keydown` Esc / × / 배경 → `requestClose()` → `confirmLeave()` → `close()`(~1764). `[data-tag]` 이동·상세→`edit`도 confirmLeave를 거침
- `keydown` Tab: 열린 창 안에서 순환 · `beforeunload`: dialogDirty일 때만
- `storage` 이벤트: 다른 탭이 책을 바꾸면 창이 닫혀 있을 때만 다시 읽음

## 입력 보호와 창 접근성 (T1, `// v2.14.0 입력 보호` 묶음, requestClose 바로 앞)
- 초안: `drafts` Map, 키 `책ID|quote`, 칸 `DRAFT_FIELDS=['newQuote','newQuotePage']`. 문서 `input` 이벤트에서 갱신해요. 저장된 books와는 분리돼요.
- `dialogDirty()`: edit는 `formSnapshot` 비교, detail은 초안에 공백이 아닌 글이 있는지로 판단 · `confirmLeave()`: 묻고 승인되면 true
- `add-quote`: 초안을 빼 두고 commit을 시도하고, 실패하면 되돌려요. `close()`·태그 이동·`edit` 전환은 `dropDrafts(책ID)`를 불러요.
- `captureDialogUI`/`restoreDialogUI`: 같은 창(dialog|editing)일 때 초점(id·data- 선택자 `selFor`), 선택 범위, `.modal`·`.overlay` 스크롤을 되살려요.
- `a11yDialog()`(showDialog 끝): `.modal`에 role=dialog·aria-modal·aria-labelledby(h2)를 달고, `.app`·`.mobile-nav`를 inert로 만들어요. 새 창일 때만(`dialogShownKey`) 창으로 초점을 옮겨요.
- 초점 복귀: 책등은 `lastSpine`, 그 밖에는 여는 클릭 때 기록한 `dialogOpener` 선택자로 돌아가요.
- 새 편집 종류를 보호하려면 `draftKey`·`DRAFT_FIELDS`·`dialogDirty`를 넓혀요. 전체 render를 막는 방식은 쓰지 않아요.

## 등록·기록 (T3, `// v2.14.0 등록·기록` 묶음)
- 폼 순서: 검색(+`searchStatusHTML` 미연결 안내) → 제목·저자 → `#dupNotice` → 평점·감상(새 책만)·Notion → `<details class="formsection">` 판본 정보 / 소개와 태그 / 책등 꾸미기 → `.formactions`(sticky)
- 접힌 칸도 폼 안이라 FormData에 그대로 들어가요(숨은 값 포함). 값 오류가 나면 `afterFormRender`의 invalid 처리가 그 칸을 열어요. `updateSectionHints`가 칸 요약을 써요.
- 기존 책 수정 폼에는 감상 칸이 없어요. 대신 `handleSave`가 `fd.has('notes')`가 아니면 기존 감상을 지켜요.
- 중복: `findDuplicateWork(cand)` 하나를 저장 직전 검사와 `checkDupNotice`(판본 선택 직후, 제목·저자 change)가 함께 써요. `open-existing`은 confirmLeave를 거쳐요.
- 설정 왕복: `connect-search`가 `pendingAdd={editing,fields,query}`를 보관하고, 설정의 `resume-add`나 `+ 책 추가`가 `resumeAddFields()`로 되살려요(세션 중에만, beforeunload 경고).
- 상세 편집: `notesBlockHTML`(초안 키 `책ID|notes`), `quoteHTML`(초안 키 `책ID|q|문장ID`). 입력칸의 `data-dk/data-df`로 초안을 갱신해요. 판정은 `detailDirty()`, 저장 액션은 `save-notes`/`save-quote`(최신 books 기준으로 그 필드만 바꿔요).
- 새 책 AI 정리는 저장 뒤 따로 돌고, 실패해도 "책은 저장됐어요…"로 알려요.

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
