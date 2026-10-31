-- Tamyr: результаты пробных ЕНТ — «правильные ответы», с которыми сверяется диагностика (и будущие модели).
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- Нужен supabase/classes.sql (классы и роль учителя).
--
-- Учитель один раз на вариант указывает тему Tamyr для каждого вопроса пробного ЕНТ, а для каждого ученика —
-- номера вопросов, где тот ошибся. Видит и меняет это только учитель класса и только пока у него роль teacher.
-- Ученикам таблицы недоступны. Удаление аккаунта ученика или класса удаляет и результаты (on delete cascade).

create table if not exists public.mock_tests (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  taken_on   date not null,
  topics     text[] not null check (cardinality(topics) between 1 and 80), -- topics[i] — тема вопроса № i; '' — темы нет в Tamyr
  created_at timestamptz not null default now()
);
create index if not exists mock_tests_class on public.mock_tests (class_id);

create table if not exists public.mock_results (
  test_id uuid not null references public.mock_tests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  wrong   smallint[] not null default '{}', -- номера вопросов с ошибкой (с 1); пусто — без ошибок
  primary key (test_id, user_id)
);

alter table public.mock_tests enable row level security;
alter table public.mock_results enable row level security;

drop policy if exists "mock: teacher reads"         on public.mock_tests;
drop policy if exists "mock: teacher deletes"       on public.mock_tests;
drop policy if exists "mock results: teacher reads" on public.mock_results;
create policy "mock: teacher reads" on public.mock_tests for select to authenticated
  using (class_id in (select public.taught_class_ids()) and (select public.is_teacher()));
create policy "mock: teacher deletes" on public.mock_tests for delete to authenticated
  using (class_id in (select public.taught_class_ids()) and (select public.is_teacher()));
-- результаты видны тому, кому видна сама работа (правило mock_tests применяется и здесь)
create policy "mock results: teacher reads" on public.mock_results for select to authenticated
  using (test_id in (select id from public.mock_tests));

-- Пишутся работы и результаты только через save_mock_test, напрямую — нельзя.
revoke all on public.mock_tests, public.mock_results from anon, authenticated;
grant select, delete on public.mock_tests to authenticated;
grant select on public.mock_results to authenticated;

-- Сохранить пробный ЕНТ целиком: новый (p_id = null) или исправленный (результаты заменяются).
-- p_results: {"<id ученика>": [номера вопросов с ошибкой]}. Ученики не из этого класса пропускаются.
create or replace function public.save_mock_test(p_id uuid, p_class uuid, p_name text, p_taken date, p_topics text[], p_results jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  n   int := cardinality(p_topics);
  tid uuid := p_id;
  k   text;
  v   jsonb;
begin
  if not public.is_teacher() or not exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = auth.uid()) then
    raise exception 'not your class';
  end if;
  if n is null or n < 1 or n > 80 or exists (select 1 from unnest(p_topics) x where x is null or x !~ '^([a-z0-9_]{1,32})?$') then
    raise exception 'bad topics';
  end if;
  if jsonb_typeof(p_results) is distinct from 'object' then raise exception 'bad results'; end if;
  if tid is null then
    if (select count(*) from public.mock_tests m where m.class_id = p_class) >= 20 then raise exception 'too many tests'; end if;
    insert into public.mock_tests (class_id, name, taken_on, topics) values (p_class, left(trim(p_name), 60), p_taken, p_topics) returning id into tid;
  else
    update public.mock_tests m set name = left(trim(p_name), 60), taken_on = p_taken, topics = p_topics where m.id = tid and m.class_id = p_class;
    if not found then raise exception 'no such test'; end if;
    delete from public.mock_results r where r.test_id = tid;
  end if;
  for k, v in select * from jsonb_each(p_results) loop
    continue when not exists (select 1 from public.class_members cm where cm.class_id = p_class and cm.user_id::text = k);
    if jsonb_typeof(v) is distinct from 'array' then raise exception 'bad results'; end if;
    insert into public.mock_results (test_id, user_id, wrong)
    select tid, k::uuid, coalesce(array_agg(distinct x::smallint order by x::smallint), '{}')
    from jsonb_array_elements_text(v) x where x ~ '^[0-9]{1,2}$' and x::int between 1 and n;
  end loop;
  return tid;
end;
$$;
revoke all on function public.save_mock_test(uuid, uuid, text, date, text[], jsonb) from public, anon;
grant execute on function public.save_mock_test(uuid, uuid, text, date, text[], jsonb) to authenticated;

-- Выгрузка для анализа: ученик — тот же псевдоним, что в answers_export; по каждой теме — сколько вопросов и ошибок.
-- Читает только владелец проекта (SQL Editor / Table Editor).
create or replace view public.mock_export with (security_invoker = true) as
select left(md5(r.user_id::text), 10) as student, m.taken_on as day, m.name as test, m.topics[i] as topic,
       count(*) as questions, count(*) filter (where i = any (r.wrong)) as wrong
from public.mock_results r
join public.mock_tests m on m.id = r.test_id
cross join lateral generate_subscripts(m.topics, 1) as i
where m.topics[i] <> ''
group by r.user_id, m.id, m.taken_on, m.name, m.topics[i];
revoke all on public.mock_export from anon, authenticated;
