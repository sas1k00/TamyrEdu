-- Tamyr: статистика пилота для учителя и админ-панель для владельца проекта.
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- Нужны supabase/answers.sql, supabase/teachers.sql и supabase/classes.sql.
--
-- Учитель видит статистику только своего класса и только сводными числами (ответы учеников напрямую ему недоступны).
-- Админ видит все классы, всех учеников и статистику по всему проекту.
--
-- Как сделать себя админом (сначала зарегистрируйтесь на сайте как обычно):
--   select public.set_admin('you@mail.kz');
-- Снять:
--   select public.set_admin('you@mail.kz', false);
-- Список админов:
--   select email from auth.users where raw_app_meta_data ->> 'admin' = 'true';
-- Ссылка «Админ-панель» появится на странице аккаунта при следующем открытии сайта; адрес — …/#admin.

-- Столбцы журнала, которые добавились позже (те же строки есть в answers.sql). Если answers.sql выполняли
-- до их появления, без них журнал теряет версию движка и пометку случайной задачи — здесь они добавятся.
alter table public.answers add column if not exists recall real check (recall between 0 and 1);
alter table public.answers add column if not exists explore boolean not null default false;
alter table public.answers add column if not exists engine text check (length(engine) <= 16);

-- Админ ли тот, кто спрашивает. Флаг admin отдельно от роли: админ может быть и учителем.
-- Читаем из базы, а не из токена: снятый флаг действует сразу.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select raw_app_meta_data ->> 'admin' from auth.users where id = auth.uid()) = 'true', false)
$$;

create or replace function public.set_admin(admin_email text, is_admin boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('admin', is_admin)
   where lower(email) = lower(trim(admin_email));
  if not found then
    return 'Аккаунт ' || admin_email || ' не найден: сначала зарегистрируйтесь на сайте';
  end if;
  return case when is_admin then 'Готово: ' || admin_email || ' — админ' else 'Готово: ' || admin_email || ' больше не админ' end;
end;
$$;

-- Статистика пилота: те же цифры, что запросы 1, 4 и 6 из analysis.sql, но без SQL Editor.
-- p_class = класс (учитель этого класса или админ); null — весь проект (только админ).
create or replace function public.pilot_stats(p_class uuid default null)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  ids uuid[];
  res json;
begin
  if p_class is null then
    if not public.is_admin() then raise exception 'admins only'; end if;
  else
    if not (public.is_admin() or (public.is_teacher() and exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid()))) then
      raise exception 'not your class';
    end if;
    select coalesce(array_agg(user_id), '{}') into ids from public.class_members where class_id = p_class;
  end if;

  with a as (select * from public.answers where p_class is null or user_id = any (ids))
  select json_build_object(
    'students',       case when p_class is null then (select count(distinct user_id) from a) else cardinality(ids) end,
    'active7',        (select count(distinct user_id) from a where at > now() - interval '7 days'),
    'answers',        (select count(*) from a),
    'answers7',       (select count(*) from a where at > now() - interval '7 days'),
    'checks',         (select count(*) from a where mode = 'check'),
    'check_students', (select count(distinct user_id) from a where mode = 'check'),
    'explore',        (select count(*) from a where explore),
    'no_engine7',     (select count(*) from a where engine is null and at > now() - interval '7 days'),
    -- 1. активность за 14 дней
    'days', (select coalesce(json_agg(d order by d.day desc), '[]'::json) from (
        select date(at at time zone 'Asia/Almaty') as day, count(distinct user_id) as students, count(*) as answers,
               round(avg(correct::int) * 100) as correct_pct
        from a where at > now() - interval '14 days' group by 1) d),
    -- 4. самые трудные задачи банка (от 10 ответов; меньше — случайность)
    'questions', (select coalesce(json_agg(q order by q.correct_pct, q.n desc), '[]'::json) from (
        select question, topic, count(*) as n, round(avg(correct::int) * 100) as correct_pct,
               round(avg((choice is null)::int) * 100) as dont_know_pct, round(avg(ms) / 1000) as avg_seconds
        from a where question not like 'gen:%'
        group by 1, 2 having count(*) >= 10 order by 4, 3 desc limit 8) q)
  ) into res;
  return res;
end;
$$;

-- Админ-панель: все классы и все ученики (имя, классы, прогресс, сводка по журналу ответов). Только админ.
-- Почты учеников сюда не попадают: панели хватает имени.
create or replace function public.admin_overview()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return json_build_object(
    'classes', (select coalesce(json_agg(c order by c.created_at), '[]'::json) from (
        select k.id, k.name, k.created_at,
               coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), u.email) as teacher,
               (select count(*) from public.class_members m where m.class_id = k.id) as students
        from public.classes k join auth.users u on u.id = k.teacher_id) c),
    'students', (select coalesce(json_agg(s order by s.last_at desc nulls last), '[]'::json) from (
        select u.id as user_id,
               coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), p.state ->> 'name', '') as name,
               (select coalesce(json_agg(m.class_id), '[]'::json) from public.class_members m where m.user_id = u.id) as classes,
               p.state, p.updated_at,
               coalesce(a.n, 0) as answers, coalesce(a.n7, 0) as answers7, a.correct_pct, coalesce(a.checks, 0) as checks,
               greatest(a.last_at, p.updated_at) as last_at
        from auth.users u
        left join public.progress p on p.user_id = u.id
        left join (select user_id, count(*) as n, count(*) filter (where at > now() - interval '7 days') as n7,
                          round(avg(correct::int) * 100) as correct_pct, count(*) filter (where mode = 'check') as checks, max(at) as last_at
                   from public.answers group by 1) a on a.user_id = u.id
        where coalesce(u.raw_app_meta_data ->> 'role', '') <> 'teacher'
          and (p.user_id is not null or a.user_id is not null or exists (select 1 from public.class_members m where m.user_id = u.id))) s)
  );
end;
$$;

-- set_admin вызывает только владелец проекта (из SQL Editor). Иначе любой ученик сделал бы админом себя.
revoke all on function public.set_admin(text, boolean) from public, anon, authenticated;
revoke all on function public.is_admin(), public.pilot_stats(uuid), public.admin_overview() from public, anon;
grant execute on function public.is_admin(), public.pilot_stats(uuid), public.admin_overview() to authenticated;
