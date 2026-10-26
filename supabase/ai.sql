-- Tamyr: лимит объяснений ИИ («Объясни мою ошибку»).
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- Нужна функция supabase/functions/explain (как её включить — README → «ИИ-объяснения»).

-- Сколько объяснений ученик запросил за день. День считается по времени Казахстана.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
-- Напрямую таблицу не читает и не меняет никто: только функция ai_take ниже.
revoke all on public.ai_usage from anon, authenticated;

-- Списывает одно объяснение у вошедшего ученика. true — можно объяснять, false — дневной лимит исчерпан.
create or replace function public.ai_take(daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  today date := (now() at time zone 'Asia/Almaty')::date;
  n     int;
begin
  if uid is null then return false; end if;
  insert into public.ai_usage as u (user_id, day, count) values (uid, today, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;
  return n <= least(daily_limit, 100);
end;
$$;
revoke all on function public.ai_take(int) from public, anon;
grant execute on function public.ai_take(int) to authenticated;
