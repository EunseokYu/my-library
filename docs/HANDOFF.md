# HANDOFF — 나의 서재

갱신: 2026-10-28 · 작업 가지: `ux-t2-t5` (t0-baseline → t1-input-guard 위). 로컬 커밋만, push·배포·main 병합 안 함.
사용자 지시(2026-10-28 13:25): T2~T5를 확인 없이 순차 진행. 단계마다 구현 → 검증 → 커밋 → HANDOFF 갱신.

## 기준점
- 배포 중: `main` = `7eea0d9` · `나의 서재 v2.13.0` (단일 index.html)
- Supabase(2026-10-28 확인): books 5, user_settings 1, work_cache 5, edition_map 0, books_old 0. DB는 바꾸지 않았어요.

## 단계 상태
| 단계 | 상태 | 커밋 |
|---|---|---|
| T0 기준점 | 완료 | 54da946 |
| T1 입력 보호(U01·U02·U11) | 완료 | 7d3dc56 |
| T2 구조 분리 | 완료 | (이 커밋) |
| T3 등록·기록(U03·U04·U07·U10) | 다음 | — |
| T4 탐색·저장 상태(U05·U06·U08·U12) | 대기 | — |
| T5 삭제 복구(U09) | 대기 | — |

## T2 내용
- `index.html`(뼈대) / `styles/app.css` / `js/app.js`로 나눴어요. 내용은 바이트 단위로 같고(diff 확인), 실행 순서(body 끝 동기 스크립트, IIFE)도 같아요.
- 자산은 상대 경로 + `?v=2.14.0`로 불러요(Pages 캐시 10분 때문에 새 index와 옛 js가 섞이는 걸 막으려고).
- 운영 규칙을 CLAUDE.md에 적었어요.
- 하지 않은 것(선택 항목): 클릭 핸들러 action→dispatch 전환, domain 모듈 추출. 실행 순서를 바꿀 위험에 비해 지금 얻는 이득이 작아서 미뤘어요. T4 selector 작업 때 필요하면 다시 판단해요.

## 검증 (실행한 것)
- `node --check js/app.js` 통과
- `npm test` → tests 16 / pass 16 / fail 0 (기존 12 + T2 4: 상대 경로 404 없음, APP_URL·SB_URL·저장 키 유지, 예전 v1 백업 왕복, 등록·평점·문장·검색·테마)
- 분리 전후 비교: 1440·390px에서 서재·상세 4권·추가 폼·통계·설정·테마 2개의 #root DOM과 계산된 스타일, 내보내기 JSON까지 39항목이 모두 같았어요. (테마 직후 0.18초 전환 중 값 차이는 대기 후 사라짐)

## 미검증
- 실제 GitHub Pages에서 `/my-library/styles/app.css` 응답(로컬 서버로 같은 경로 구조만 확인)
- 실제 휴대폰, 실제 로그인·API(모두 mock)

## 배포 전 필요한 것 (누적)
- 이제 `index.html`·`styles/app.css`·`js/app.js` 세 파일을 함께 올려야 해요. 예전 규칙(index.html만)과 달라요 → 사용자 확인 필요.
- `docs/`·`tests/`·`CLAUDE.md`·`package.json`을 main에 함께 올릴지 사용자 확인 필요.
- `claude-push-test` 가지 삭제 여부 확인 필요.

## 정확한 다음 행동
T3: UX_PLAN 5장 T3를 따라 등록 폼 접기(U03), 상세 감상·문장 수정(U04), 조기 중복 안내(U07), 검색 연결 상태·설정 왕복 초안(U10).
