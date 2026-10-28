-- 나의 서재 v2.15.0 관리자 검수 소개 — 되돌리기(필요할 때만, 실행 전 사용자 확인)
-- 검수 소개를 하나도 저장하기 전이면 ②만으로 충분합니다. 저장한 뒤라면 ①로 소개를 백업 시점으로 돌린 뒤 ②를 실행합니다.

-- ① 소개를 적용 전(백업) 상태로 되돌리기
update public.work_cache w set summary = b.summary
  from public.work_cache_backup_20261028 b where w.key = b.key and w.summary <> b.summary;
-- 백업 이후 관리자가 새로 만든 작품(백업에 없는 행)은 별도 확인 후 처리합니다(삭제는 따로 허락받음):
-- select key, title from public.work_cache where key not in (select key from public.work_cache_backup_20261028);

-- ② 구조 되돌리기
drop function if exists public.admin_restore_reviewed(bigint);
drop function if exists public.admin_upsert_reviewed(jsonb);
drop policy if exists "read reviewed (anon)" on public.work_cache;
revoke select on public.work_cache from anon;
drop policy if exists "add new" on public.work_cache;
create policy "add new" on public.work_cache for insert to authenticated with check ((select auth.uid()) = created_by);
alter table public.work_cache drop constraint if exists work_cache_summary_check;
alter table public.work_cache add constraint work_cache_summary_check check (char_length(summary) between 1 and 400);  -- 400자 넘는 행이 없을 때만 성공
alter table public.work_cache
  drop column if exists reviewed_by, drop column if exists reviewed_at, drop column if exists original_title,
  drop column if exists genre, drop column if exists ai_summary, drop column if exists rev, drop column if exists source;
-- 이력·관리자·백업 표는 확인 후 따로 지웁니다(삭제는 별도 허락):
-- drop table public.work_cache_history; drop function public.is_admin(); drop table public.admins; drop table public.work_cache_backup_20261028;
