-- 나의 서재 v2.15.0 — 관리자 검수 소개. 2026-10-28 16:14(KST)에 Supabase 마이그레이션 v2_15_0_reviewed_summaries로 적용됨(기록용 사본).
-- 적용 뒤 권한·동작 시험 19가지를 트랜잭션 안에서 실행하고 취소해 모두 통과를 확인함. 되돌리기는 2026-10-28_v2_15_0_reviewed_rollback.sql.
-- 기존 행·기존 사용자 데이터는 지우거나 바꾸지 않습니다(새 칸은 기본값으로만 채워짐).

-- 0) 백업: 지금 work_cache 전체를 복사해 둡니다(되돌리기용).
create table if not exists public.work_cache_backup_20261028 as table public.work_cache;
alter table public.work_cache_backup_20261028 enable row level security;   -- 정책 없음 = 앱에서 접근 불가

-- 1) 관리자 목록. 정책이 없어 누구도 직접 읽거나 쓸 수 없고, 아래 함수만 확인합니다.
create table if not exists public.admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
insert into public.admins(user_id) values ('158e6a6d-e755-4199-a9d4-821402ff13b3') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2) work_cache 확장. 기존 행은 source='ai', rev=0으로 그대로 남습니다.
alter table public.work_cache
  add column if not exists source text not null default 'ai',
  add column if not exists rev integer not null default 0,
  add column if not exists ai_summary text not null default '',      -- 검수 소개로 바꾸기 전의 AI 소개(되돌리기·개인 수정 판별용)
  add column if not exists genre text not null default '',
  add column if not exists original_title text not null default '',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.work_cache
  add constraint work_cache_source_check check (source in ('ai','reviewed')),
  add constraint work_cache_ai_summary_check check (char_length(ai_summary) <= 400),
  add constraint work_cache_genre_check check (char_length(genre) <= 60),
  add constraint work_cache_original_title_check check (char_length(original_title) <= 200);
-- 소개 길이 상한 400 → 1000 (검수 소개 500~700자 수용. 500~700 규칙은 관리자 화면이 JavaScript 길이로 검사)
alter table public.work_cache drop constraint work_cache_summary_check;
alter table public.work_cache add constraint work_cache_summary_check check (char_length(summary) between 1 and 1000);

-- 일반 사용자는 지금처럼 AI 소개만 추가할 수 있습니다(검수 소개로 위장 불가). 새 칸에는 INSERT 권한도 주지 않습니다.
drop policy if exists "add new" on public.work_cache;
create policy "add new" on public.work_cache for insert to authenticated
  with check ((select auth.uid()) = created_by and source = 'ai' and rev = 0 and reviewed_at is null and reviewed_by is null);
-- 새 칸 읽기 권한(로그인 사용자). UPDATE 권한은 지금처럼 custom_motif 한 칸뿐입니다.
grant select (source, rev, ai_summary, genre, original_title, reviewed_at) on public.work_cache to authenticated;

-- (결정 2 — 추천) 로그아웃 상태에서도 검수 소개만 읽기 허용. 원하지 않으면 아래 두 줄을 빼면 됩니다.
grant select (key, title, author, summary, tags, motif_idea, custom_motif, source, rev, genre, original_title, reviewed_at) on public.work_cache to anon;
create policy "read reviewed (anon)" on public.work_cache for select to anon using (source = 'reviewed');

-- 3) 변경 이력: 바꾸기 전 행 전체를 남깁니다. 관리자만 읽을 수 있고, 쓰기는 아래 함수만 합니다.
create table if not exists public.work_cache_history(
  id bigserial primary key,
  key text not null,
  action text not null check (action in ('insert','update','restore')),
  old_row jsonb,                 -- 바꾸기 전 work_cache 행 전체(insert면 null)
  new_summary text not null,
  new_rev integer not null,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
alter table public.work_cache_history enable row level security;
create policy "admins read" on public.work_cache_history for select to authenticated using ((select public.is_admin()));
-- 새 표에 Supabase가 기본으로 주는 권한을 명시적으로 막습니다(쓰기는 아래 관리자 함수만).
revoke all on public.work_cache_history, public.admins, public.work_cache_backup_20261028 from anon, authenticated;
revoke all on sequence public.work_cache_history_id_seq from anon, authenticated;
grant select on public.work_cache_history to authenticated;

-- 4) 관리자 저장: 서버에서 관리자 확인 → 같으면 건너뜀 → 이전 값을 이력에 남김 → 저장. 한 번에 최대 100건, 항목별 결과를 돌려줍니다.
create or replace function public.admin_upsert_reviewed(items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb; k text; s text; g text; o text; t text; a text; exp int;
  r public.work_cache%rowtype; res jsonb := '[]'::jsonb; st text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 100 then raise exception 'bad_batch'; end if;
  for it in select value from jsonb_array_elements(items) loop
    k := it->>'key'; s := it->>'summary'; g := coalesce(it->>'genre',''); o := coalesce(it->>'originalTitle','');
    t := coalesce(it->>'title',''); a := coalesce(it->>'author',''); exp := (it->>'expectRev')::int;
    begin
      if k is null or char_length(k) > 200 or position('|' in k) < 2 then raise exception 'bad_key'; end if;
      if s is null or char_length(s) not between 1 and 1000 then raise exception 'bad_summary'; end if;
      if char_length(t) > 150 or char_length(a) > 120 or char_length(g) > 60 or char_length(o) > 200 then raise exception 'too_long'; end if;
      select * into r from public.work_cache where key = k for update;
      if found and r.source = 'reviewed' and r.summary = s and r.genre = g and r.original_title = o then
        st := 'same';
      elsif found then
        if exp is not null and r.rev <> exp then raise exception 'stale'; end if;   -- 미리보기 뒤 다른 곳에서 바뀌었으면 저장하지 않음
        insert into public.work_cache_history(key, action, old_row, new_summary, new_rev, changed_by)
          values (k, 'update', to_jsonb(r), s, r.rev + 1, auth.uid());
        update public.work_cache set
          summary = s, source = 'reviewed', rev = r.rev + 1, genre = g, original_title = o,
          ai_summary = case when r.source = 'ai' then left(r.summary, 400) else r.ai_summary end,
          reviewed_at = now(), reviewed_by = auth.uid()
        where key = k;                                   -- 태그·상징 이름·상징 그림·created_by(발견자)는 그대로
        st := 'updated';
      else
        insert into public.work_cache(key, title, author, summary, tags, motif_idea, custom_motif, created_by,
                                      source, rev, genre, original_title, reviewed_at, reviewed_by)
          values (k, t, a, s, '[]'::jsonb, '', '', null,  -- 관리자가 만든 작품은 created_by를 비워 둠
                  'reviewed', 1, g, o, now(), auth.uid());
        insert into public.work_cache_history(key, action, old_row, new_summary, new_rev, changed_by)
          values (k, 'insert', null, s, 1, auth.uid());
        st := 'inserted';
      end if;
      res := res || jsonb_build_object('key', k, 'status', st);
    exception when others then
      res := res || jsonb_build_object('key', k, 'status', 'error', 'error', sqlerrm);
    end;
  end loop;
  return res;
end $$;
revoke all on function public.admin_upsert_reviewed(jsonb) from public, anon;
grant execute on function public.admin_upsert_reviewed(jsonb) to authenticated;

-- 5) 되돌리기: 이력 한 줄을 골라 그 직전 상태로 돌립니다. 되돌린 것도 이력에 남고 rev가 올라 각 서재가 다음 동기화 때 받습니다.
--    새로 만든 작품(insert)을 되돌리면 그 작품의 검수 소개를 지울 이전 값이 없으므로, 소개 대신 '검수 해제'만 합니다(행은 삭제하지 않음).
create or replace function public.admin_restore_reviewed(history_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h public.work_cache_history%rowtype; r public.work_cache%rowtype;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into h from public.work_cache_history where id = history_id;
  if not found then raise exception 'no_history'; end if;
  select * into r from public.work_cache where key = h.key for update;
  if not found then raise exception 'no_row'; end if;
  if h.old_row is null then
    update public.work_cache set source = 'ai', rev = r.rev + 1, reviewed_at = now(), reviewed_by = auth.uid() where key = h.key;
  else
    update public.work_cache set
      summary = h.old_row->>'summary', source = coalesce(h.old_row->>'source','ai'),
      genre = coalesce(h.old_row->>'genre',''), original_title = coalesce(h.old_row->>'original_title',''),
      ai_summary = coalesce(h.old_row->>'ai_summary',''),
      rev = r.rev + 1, reviewed_at = now(), reviewed_by = auth.uid()
    where key = h.key;
  end if;
  insert into public.work_cache_history(key, action, old_row, new_summary, new_rev, changed_by)
    values (h.key, 'restore', to_jsonb(r), coalesce(h.old_row->>'summary', r.summary), r.rev + 1, auth.uid());
  return jsonb_build_object('key', h.key, 'status', 'restored', 'rev', r.rev + 1);
end $$;
revoke all on function public.admin_restore_reviewed(bigint) from public, anon;
grant execute on function public.admin_restore_reviewed(bigint) to authenticated;

-- 6) 확인 쿼리
-- select count(*), count(*) filter (where source='ai') from public.work_cache;            -- 기존 7행, 모두 ai
-- select public.is_admin();   -- (SQL 편집기에서는 로그인 사용자가 없어 false가 정상)
