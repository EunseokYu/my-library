# HANDOFF — 나의 서재

갱신: 2026-10-28 · 작업 가지: `t0-baseline` → `t1-input-guard` (로컬 커밋만, push·배포 안 함)

## 기준점
- 배포 중: `main` = `7eea0d9` · `나의 서재 v2.13.0` (UX_PLAN 기준 커밋과 같음)
- 로컬: `t0-baseline`(문서·테스트 기반) 위에 `t1-input-guard`(T1) 커밋. `index.html` 탭 제목은 `v2.14.0`
- 원격 가지: `main`, `claude-push-test`(main과 같은 커밋, 삭제 여부 사용자 확인 대기)
- Supabase(2026-10-28 확인): books 5, user_settings 1, work_cache 5, edition_map 0, books_old 0. T1에서 DB는 바꾸지 않았어요.

## 완료
- T0: UX_PLAN·CLAUDE·CODEMAP·HANDOFF, 합성 fixture, 테스트 도구
- T1 (U01·U02·U11), `index.html`만 수정(+38/−9줄)
  - 상세 창 초안(책 ID별)을 render 뒤에도 되살려요. 초점·선택 범위·창 스크롤도 함께 되살려요.
  - softRender가 상세 창을 더 이상 건너뛰지 않아요(AI·동기화 갱신이 화면에 반영돼요).
  - 문장은 저장에 성공했을 때만 초안을 지워요. 실패하면 초안이 남아요.
  - Esc·×·배경·태그 이동·상세→정보 수정: 초안이 있으면 확인을 물어요. "취소"면 그대로, "확인"이면 초안을 버려요. 편집 폼의 기존 경고는 유지돼요.
  - beforeunload: 초안이나 편집 변경이 있을 때만 경고해요.
  - 모달: role=dialog, aria-modal, 제목 연결, 처음 초점은 창, Tab/Shift+Tab 순환, 배경 inert. 닫으면 책등이나 여는 버튼으로 초점이 돌아가요.
  - 창 자체의 초점 테두리만 숨겼어요(`#dialog .modal:focus`).

## 검증 명령과 결과 (2026-10-28 실행)
```
node -e "<index.html의 <script> 본문을 new Function으로 파싱>"   # 통과
npm test      # tests 12 → pass 12 / fail 0
```
- `tests/app.test.js` 2개: 기본 로드, 백업 왕복
- `tests/t1.test.js` 10개: U01(1440·390px, 평점·인생책, 커서·선택 범위), 모달 스크롤, 저장 성공·실패, 닫기 5경로(취소·확인), 공백 초안, 편집 폼 경고, beforeunload, AI 상징 응답 mock, Supabase 동기화 응답 mock, U11 키보드
- 대조 실험: 수정 전 index.html로 t1 테스트를 돌리면 10개 중 8개가 실패했어요(결함을 실제로 잡음). 통과한 2개는 저장 성공·실패와 공백·편집 폼 경고예요(원래 동작 유지 확인).
- 화면 확인: 헤드리스 Chromium 390px·1440px 스크린숏에서 상세 창이 정상이고 콘솔 오류는 0이에요.
- 이 환경은 npm 레지스트리에 접속할 수 없어 `/opt/npm-tools`의 Playwright 1.63.0을 써요. 다른 PC에서는 `npm install` 후 `npx playwright install chromium`이 필요해요.

## 미검증
- 실제 휴대폰(iOS Safari·안드로이드 Chrome)의 가상 키보드, 실제 탭·포인터 동작
- 실제 로그인 계정으로 동기화, 실제 Gemini·카카오 응답(테스트는 모두 mock)
- 스크린리더 실제 낭독(속성만 확인), 엣지·사파리에서 inert 동작
- 모바일 브라우저의 beforeunload(보장하지 않음. 세션 중 보호만 해요)

## 남은 문제 / 메모
- 초안은 메모리에만 있어 새로고침하면 사라져요(설계상 이번 범위 밖).
- 상세 창의 "인생책으로 간직하기" 링크에 브라우저 기본 버튼 테두리가 보여요. 예전부터 있던 스타일이고 T1과 무관해요.
- 인수인계 문서에서 v2.14.0으로 계획했던 "발견 기능"은 다음 번호(v2.15.0 이상)로 밀려요.

## 다음 작업
- 사용자 확인 후: T1을 배포할지(`main`에 index.html을 올릴지, 문서·테스트도 함께 올릴지), `claude-push-test` 삭제 여부
- T2(구조 분리) — 시작 전 UX_PLAN 5장 T2 지시를 확인해요.

## 결정 대기 (사용자)
- `docs/`·`tests/`·`CLAUDE.md`·`package.json`을 `main`에 올릴지(예전 규칙: index.html만 올림)
- `claude-push-test` 가지 삭제 여부
