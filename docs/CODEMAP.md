# CODEMAP — 나의 서재

기준: T2 이후 · 탭 제목 `나의 서재 v2.14.0`. 원 기준 커밋 `7eea0d9`(v2.13.0, 단일 index.html 1,788줄).
아래 `~줄`은 예전 index.html 기준이에요. `js/app.js`에서는 대략 132를 빼고, 정확한 위치는 함수명으로 찾아요(`rg -n "function 이름" js/app.js`).

## 파일
| 경로 | 역할 |
|---|---|
| `index.html` | 서재 뼈대(#fatal-error, #root). `styles/app.css?v=`·`js/app.js?v=`(type=module)를 상대 경로로 불러요 |
| `js/workkey.js` | 원작 판별 공용 모듈(titleKey·workBaseTitle·cleanAuthor·canonicalWork·workKeyOf). 서재·관리자가 함께 import |
| `admin.html`·`js/admin.js`·`styles/admin.css` | 관리자 검수 소개 페이지(v2.15.0) |
| `db/` | 적용한 DB 변경 기록 사본과 되돌리기 SQL |
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

## 찾기와 저장 상태 (T4, `// v2.14.0 찾기와 저장 상태` 묶음)
- 공통 selector: `getShown()` = 완독 + 태그 + `shelfFilters{life,notes,unrated}`(AND) + 검색(제목·작가·작품명·책등명·출판사·소개·AI 소개·문장·감상) + 정렬. 책장(`layoutShelf`)과 목록(`renderList`, `.booklist .listrow[data-book]`)이 같은 결과를 써요.
- `updateShelf()`(검색 입력)는 보이는 보기만 다시 그리고, 개수와 `#filterSummary`를 갱신해요. 필터·보기 전환은 별도 click 리스너(`data-filter-toggle`, `data-shelf-view`)가 맡고, `clear-filters`는 action으로 처리해요.
- UI 선호: `my-library-ui-v1` = `{shelfView}`만 저장해요. 검색·필터는 세션 변수라 새로 열면 비어 있어요. 책 데이터·백업과는 무관해요.
- 빈 상태: `emptyShelfHTML`이 빈 서재 / 이전 기록만 있음 / 검색 결과 없음(`filtersActive`)을 나눠서 보여 줘요.
- 상단 상태: `.topsync[data-sync-status="top"]` ← `syncTopText()`·`syncTone()`(local/ok/pending/warn). `offline`·`online` 이벤트로 갱신하고, `syncNow`는 오프라인이면 보내지 않아요. 키 보관 실패(`keySyncError`)는 책 동기화와 따로 표시해요.
- 통계(insights)는 완독 기준이에요. 예전 reading/want는 `archivedBooks()`로 따로 세고, 설정의 `archiveHTML()`이 읽기 전용 목록을 보여 줘요(상태는 바꾸지 않아요).

## 실수 복구 (T5, `// v2.14.0 실수 복구` 묶음)
- `lastDeleted`: 이번 접속 중 가장 최근에 지운 것 하나({kind:'book',book,index} 또는 {kind:'quote',bookId,quote,index})예요. 새로 지우면 바뀌고, 새로고침하면 사라져요.
- `undoBarHTML()`: 서재에서는 필터 줄 아래, 다른 화면에서는 main 맨 위, 문장이면 그 책 상세의 "모은 문장" 아래에 보여요(토스트와 별개로 계속 보여요).
- `undoDelete()`: 버퍼를 빼 두고 commit하고, 실패하면 되돌려요. 책은 원래 index에, 문장은 부모의 최신 필드 위에 원래 위치로 넣어요. 부모가 없으면 되살리지 않고 이유를 알려요.
- 동기화 경쟁: 되살리면 `trackChanges`가 dirty로 옮기고 removed에서 빼요. 동기화는 직렬(`syncBusy`/`syncAgain`)이라, 전송 중인 PATCH(deleted:true) 뒤에 다음 회차 upsert(deleted:false)가 와서 최종 상태가 맞춰져요(t5 테스트로 확인).

## AI 호출 정책 (v2.14.1)
- 모델: 소개·상징 이름·상징 SVG 모두 `AI_FAST_MODEL`(Flash-Lite, `AI_DRAW_MODEL`)이에요. `AI_MODEL`(3.8 Flash)은 상수만 남아 있고 부르지 않아요. `callGemini`는 막혀도 다른 모델로 넘기지 않아요.
- 자동 호출은 새 책 저장(`handleSave` → `analyzeBook(id,{quiet:true})`) 때만, 소개 1회 + 상징 1회예요. 공유 기록(work_cache)이 있으면 0회예요. 책 열기·앱 시작은 `queueDraw(...,{instantOnly:true})`(AI 없음)만 해요.
- 자동 반복 없음: 문체 재요청·thinking 단계 올리기·묶음 실패 뒤 한 권씩·분당 한도 대기·하루 한도 뒤 이어 그리기를 모두 없앴어요. 남은 것은 `callGemini`의 400 설정 호환 재전송(thinking 설정을 모델이 거절할 때)뿐이에요.
- 실패: `drawFail` Map(세션 메모리, 책ID→{kind,msg}). 오류 종류는 `err.kind`(quota-daily·quota-minute·auth·model·format·timeout·network·server)이고, 이름은 `FAIL_LABEL`이에요. 한도·키·모델 오류(`STOP_KINDS`)면 큐 전체를 멈춰요.
- 상세: `motifStatusHTML(b)` — 그릴 상징은 있는데 그림이 없을 때만 상태와 `retry-motif` 버튼을 보여 줘요(그림이 있으면 버튼 없음). `ai-analyze`는 `draw:false`예요.
- 상징 이름 고정: `analyzeBook`·`analyzeAll`은 `x.motifIdea||r.motifIdea`이고, `applyCache`는 내 상징 이름·그림이 있으면 덮지 않아요. 문체 검사(styleOk)를 통과한 소개만 공유 기록에 올려요.
- 그리기 규칙(v2.14.2): `MOTIF_DRAW_RULES` = 좋은 상징 조건(도형 1~4개·큰 윤곽 + 특징 하나·작은 점/격자/반복 금지) + 잘 그린 예(도끼·알·티백 실제 SVG) + 출력 규칙(최대 4개, transform 금지). 예전 규칙은 `MOTIF_DRAW_RULES_V1`(비교 시험 전용)이에요. `motifPrompt(...,rules)`. 상징 이름 규칙(`MOTIF_IDEA_RULES`)에는 '작게 새겨도 윤곽으로 알아볼 사물'을 넣었어요.
- 비교 시험: `runMotifCompare`/`compareHTML`. `COMPARE_SET` 5권 × `COMPARE_RULES`(예전·새) = 10회. 결과는 `compareState`(메모리)에만 있어요.

## 검수 소개 (v2.15.0)
- DB: work_cache에 `source`(ai|reviewed)·`rev`·`ai_summary`(검수 전 AI 소개)·`genre`·`original_title`·`reviewed_at`·`reviewed_by`가 있어요. 쓰기는 `admin_upsert_reviewed(items)`(최대 100건, 항목별 결과 inserted/updated/same/error, `expectRev`로 미리보기 뒤 변경 차단)와 `admin_restore_reviewed(history_id)`만 해요. 이력은 `work_cache_history`(관리자만 읽기), 관리자는 `admins` + `is_admin()`이에요. 로그아웃(anon)은 source=reviewed 행만 읽을 수 있어요.
- 서재: 책 `aiSrc`/`aiRev`, `cleanAiSummary`(검수 소개는 그대로, 나머지는 공백 정리 + 줄바꿈 보존, 1000자). `analyzeBook`은 공유 기록(검수 포함)을 먼저 찾고, 키가 없어도 붙여요. Gemini 응답이 오는 사이 소개가 바뀌었으면 버려요. `applyCache`는 user 소개를 두고, 태그가 빈 검수 행이면 내 태그를 유지해요. `putCache`는 reviewed·user 소개를 공유하지 않아요.
- 반영: `refreshReviewed()`(syncNow 끝, 로그아웃이면 앱 시작 3초 뒤) — `syncMeta.reviewPull` 이후 바뀐 행의 키·번호만 받고, 내 책에 해당하는 행만 전문을 받아 `reviewedUpdate` 규칙으로 바꿔요(예전 기록은 `ai_summary`와 글자까지 같을 때만 자동). 상세를 열면 `checkReviewOffer` → `reviewOfferHTML`('검수된 소개로 바꾸기', `use-reviewed`)을 보여 줘요.
- 관리자 페이지: `loadExisting`(work_cache·edition_map 전체) → `checkFile`(형식·JS 길이 500~700·중복) → `classify`(신규/변경/동일/충돌/오류, 같은 제목 다른 저자·판본 묶기 불일치 = 충돌) → `save`(50건씩 차례로, network/auth/server 구분, auth면 멈춤) → `retryList` → 이력 `findHistory`/`restore`.

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
