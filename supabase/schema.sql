-- Tamyr: облачное хранение прогресса.
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Учётные записи (почта, хеш пароля) Supabase хранит сам — в схеме auth. Здесь только прогресс:
-- одна строка на ученика, в state лежит то же, что приложение хранит в localStorage.

create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now(),
  -- защита от мусора: настоящий прогресс занимает единицы килобайт
  constraint progress_state_size check (pg_column_size(state) < 200000)
);

-- Row Level Security: без неё публичный ключ из js/config.js давал бы доступ ко всем строкам.
-- С ней каждый вошедший видит и меняет только свою строку, а невошедший не видит ничего.
alter table public.progress enable row level security;

drop policy if exists "progress: read own"   on public.progress;
drop policy if exists "progress: insert own" on public.progress;
drop policy if exists "progress: update own" on public.progress;
drop policy if exists "progress: delete own" on public.progress;

create policy "progress: read own"   on public.progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress: insert own" on public.progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "progress: update own" on public.progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "progress: delete own" on public.progress for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.progress from anon;
grant select, insert, update, delete on public.progress to authenticated;
