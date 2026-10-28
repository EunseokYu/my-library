# CLAUDE.md — 나의 서재 (eunseokyu/my-library)

개인 독서 서재 웹앱. GitHub Pages 정적 파일 3개 — `index.html`(뼈대) · `styles/app.css` · `js/app.js`(IIFE 하나) — 외부 라이브러리 없음 + Supabase(REST·Auth를 fetch로 직접 호출). T2(v2.14.0)부터 CSS·JS가 분리됐어요.

## 문서
- `docs/UX_PLAN.md` — 사용성 개선 명세와 작업 순서(T0~T5). 작업은 ID로 요청받음
- `docs/CODEMAP.md` — 함수·데이터 흐름 지도. 코드부터 읽기 전에 여기서 위치 확인
- `docs/HANDOFF.md` — 현재 커밋·완료/미완료·다음 작업·검증 명령. 작업이 끝날 때마다 갱신

## 작업 방식 (사용자 규칙)
- 한국어로 대화해요. 순서는 제안 → 허락 → 구현·테스트 → (허락 후) 올리기예요. "아이디어만/제안만"이면 구현하지 않아요.
- 한 번에 지정된 작업(또는 밀접한 두 기능)만 해요. 최소 변경, 전체 리팩터링 금지. 코드 이동과 동작 변경은 다른 커밋으로 나눠요.
- 작업 전에 `git status`로 사용자 작업을 확인하고 작업 브랜치에서 커밋해요. **push·배포·DB 변경은 별도 허락 전까지 하지 않아요.** DB SQL은 실행 전에 보여 주고, drop·delete는 따로 허락받아요.
- 고친 뒤에는 JS 문법 검사 + 관련 테스트를 해요. 실행하지 않은 검증을 "통과"라고 쓰지 않아요. 실제 기기·서버에서 못 본 것은 밝혀요.
- 결과 보고: A. 결과물 / B. 바뀐 것 / C. 유지한 기능 / D. 사용자가 확인할 것 / E. 남은 문제 (짧게, 전체 코드 출력 금지)
- 사용자의 아이디어에도 제품 관점에서 객관적으로 판단해요.
- 버전: 배포하는 변경은 `<title>나의 서재 vX.Y.Z</title>`를 올려요. 파일로 전달할 때는 `나의서재_vX.Y.Z_기능이름.html`.

## 불변 조건
- localStorage 키 이름은 절대 바꾸지 않아요: `mnemosyne-library-v1`, `my-library-kakao-key-v1`, `my-library-gemini-key-v1`, `my-library-theme-v1`, `my-library-ai-pause-v1`, `my-library-auth-v1`, `my-library-sync-v1`, `my-library-edition-map-v1`
- 백업 JSON 계약 `{app:'Mnemosyne', version:2, books:[...]}`을 유지해요. 키·로그인 정보는 넣지 않아요.
- 모든 책은 `normalize()`를 거쳐요. 새 필드는 normalize·handleSave·백업 왕복·동기화 보존을 함께 확인해요.
- 저장은 `persist()` 한 경로로 해요. 뒤에서 고칠 때는 `softRender()`를 써요. 저장 실패 때 초안을 지우거나 성공 표시를 하지 않아요.
- 데이터 구조를 바꾸면 기존 데이터 손실이 없어야 해요. 필요하면 먼저 자동 백업을 받아요.
- 완독 중심 정책과 작품당 한 기록 정책을 유지해요. reading/want 데이터는 지우거나 done으로 바꾸지 않아요.
- 기존 서재 미감·책등 디자인(6유형·30색·인생책)·ID·색·상징·문장·감상을 보존해요. 화려한 효과는 쓰지 않아요.
- `SB_URL`·publishable `SB_KEY`·인증 흐름·`APP_URL`은 임의로 바꾸지 않아요. 비밀 키·토큰을 출력하거나 커밋하지 않아요. API 키를 채팅에 붙여 넣으라고 하지 않아요.
- 명문장 AI 기능은 다시 넣지 않아요. 한 번 만든 AI 소개·상징은 고정이에요(다시 만들기 버튼 없음).
- 프레임워크 전환·전면 재작성은 하지 않아요. 의존성은 개발용만 최소로 써요.

## 코드 운영 규칙 (T2)
- 화면 코드는 외부 API를 직접 부르지 않고 기능 함수(`searchKakaoBooks`, `callGemini`, `sbFetch`…)에 맡겨요.
- 저장은 `persist`/`commit` 공통 경로로만 해요. 파생 목록(서재·목록 보기·개수)은 공통 selector(`getShown`)에서 계산해요.
- 미저장 편집은 draft 경로(`drafts`·`dialogDirty`·`confirmLeave`)를 써요. 전체 render를 막아서 입력을 지키지 않아요.
- 자산은 상대 경로 + `?v=버전` 쿼리로 불러요. 버전을 올릴 때 `<title>`과 두 쿼리를 함께 바꿔요.
- 미래 기능용 빈 파일이나 모듈을 미리 만들지 않아요. 새 모듈은 두 번째 사용처가 생길 때 만들어요.

## 테스트
- 실행: `npm test` (= `node --test tests/*.test.js`). 브라우저는 Playwright Chromium.
- 바깥 주소(Supabase·카카오·Gemini·글꼴)는 테스트에서 모두 막혀요. 실제 계정·책 데이터·공유 기록(work_cache, edition_map)을 테스트로 바꾸지 않아요.
- 데이터는 `tests/fixtures/books.json`(합성)만 써요. 개인 데이터·실제 키는 넣지 않아요.
- `{ todo }` 테스트는 알려진 결함 재현이에요. 고친 단계에서 todo를 지워 일반 테스트로 바꿔요.

## 저장소에 올리는 범위 (사용자 확인 필요)
- 예전 규칙은 "저장소에는 `index.html`만 올린다"였어요. T2부터 앱이 작동하려면 `index.html`·`styles/app.css`·`js/app.js` 셋이 모두 필요해요.
- UX_PLAN은 `docs/`·`tests/`·`CLAUDE.md`도 저장소에 두는 방식이에요.
- 이 파일들을 `main`에 올릴지는 push 전에 사용자에게 다시 확인해요. 공개 저장소라 Pages에서도 보이게 돼요(합성 데이터뿐이에요).
