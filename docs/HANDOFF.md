# HANDOFF — 나의 서재

갱신: 2026-10-28 · 작업 가지: `t0-baseline` (로컬 커밋만, push 안 함)

## 기준점
- 배포 중: `main` = `7eea0d9c38166d9c74f89297aca79103ccfbd15b` · `index.html` 1,788줄 / 196,736바이트 · `나의 서재 v2.13.0`
- UX_PLAN 기준 커밋과 같아요. 차이 없음 → U01~U12는 이 코드 그대로 유효해요.
- 원격 가지: `main`, `claude-push-test`(main과 같은 커밋, 삭제 여부 사용자 확인 대기)
- Supabase(2026-10-28 확인): books 5(삭제 표시 0), user_settings 1, work_cache 5, edition_map 0, books_old 0

## T0 완료
- `docs/UX_PLAN.md` 저장(첨부 원본과 바이트 동일)
- `CLAUDE.md`(불변 조건·작업 규칙·문서 경로), `docs/CODEMAP.md`(함수·흐름 지도)
- `tests/fixtures/books.json`: 합성 6권 — 완독·평점/감상/문장 2개, 같은 작품 다른 ID(`가상의 강 1` / `(리커버 에디션)`), 긴 한글 제목·미평가, 긴 영문 제목·인생책·C유형·auto 색, reading, want(저자 없음)
- `tests/helpers.js`: `/my-library/` 경로 정적 서버 + 바깥 요청 전부 차단·기록
- `tests/app.test.js` (node:test + Playwright Chromium)
- 앱(`index.html`)은 바꾸지 않았어요.

## 검증 명령과 현재 결과
```
node -e "<index.html의 <script> 본문을 new Function으로 파싱>"   # JS 문법: 통과
npm test                                                     # pass 2 / fail 0 / todo 3
```
- 통과: 기본 로드(오류 없음, 완독 4권만 책장, reading/want 저장 유지, 바깥 API 호출 0)
- 통과: 백업 왕복(내보내기 → 빈 서재에 병합 → 저장 데이터가 백업과 동일, 문장 id·createdAt 유지)
- todo(재현됨): U01 평점 변경 시 문장·쪽수 사라짐 / U01 인생책 토글 시 사라짐 / U02 Esc 시 확인 없이 닫힘
- 이 환경은 npm 레지스트리에 접속할 수 없어 `/opt/npm-tools`의 Playwright 1.63.0을 대신 써요(`helpers.js`가 자동으로 찾음). 다른 PC에서는 `npm install` 후 `npx playwright install chromium`이 필요해요.

## 미검증
- 실제 로그인·동기화·카카오·Gemini 호출(테스트에서 모두 차단)
- 390px 모바일 폭, 실제 휴대폰, 키보드 Tab 순환(U11은 아직 테스트 없음)
- 교체 복원(`replace`)과 손상 데이터 경로

## 다음 작업: T1 (U01·U02·U11)
1. `{ todo }` 3개를 일반 테스트로 바꾸고, U11 키보드 테스트·저장 실패 시 초안 유지·다른 책 초안 섞임 테스트를 추가해요.
2. 상세 창 초안(책 ID별)을 input 이벤트로 기억하고, `render()` 뒤 `showDialogInner`에서 되살려요(값·선택 범위·초점·모달 스크롤).
3. `requestClose`가 상세 초안도 검사하게 하고, `[data-tag]` 이동도 같은 경로를 거치게 해요.
4. 모달 role="dialog"·aria-modal·aria-labelledby, 초기 초점, Tab 순환, 닫을 때 초점 복귀를 넣어요.
- 시작 지점: `softRender`(~581), `commit`(~1290), `showDialogInner`(~1482), `requestClose`(~1774), click 위임의 `[data-rate]`·`toggle-life`·`[data-tag]`.

## 결정 대기 (사용자)
- `docs/`·`tests/`·`CLAUDE.md`·`package.json`을 `main`에 올릴지(예전 규칙: index.html만 올림)
- `claude-push-test` 가지 삭제 여부
