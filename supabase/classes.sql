-- Tamyr: классы и коды классов.
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
-- Нужны supabase/schema.sql (таблица progress) и supabase/teachers.sql (роль учителя).
--
-- Учитель создаёт класс и получает код из 6 символов. Ученик вводит код — и учитель видит его карту тем.
-- Читать прогресс ученика может только учитель его класса и только пока у него есть роль teacher.
-- Ученик может выйти из класса, учитель — убрать ученика или удалить класс; после этого доступа нет.

-- Учитель ли тот, кто спрашивает. Роль читаем из базы, а не из токена: снятая роль действует сразу.
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select raw_app_meta_data ->> 'role' from auth.users where id = auth.uid()) = 'teacher', false)
$$;

create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  code       text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now()
);
create index if not exists classes_teacher on public.classes (teacher_id);

create table if not exists public.class_members (
  class_id     uuid not null references public.classes (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  student_name text check (length(student_name) <= 40), -- имя из аккаунта: видно учителю, даже пока ученик не начал
  joined_at    timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists class_members_user on public.class_members (user_id);

-- Вспомогательные множества. security definer — чтобы правила таблиц не ссылались друг на друга по кругу.
create or replace function public.taught_class_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.classes where teacher_id = auth.uid()
$$;
create or replace function public.joined_class_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select class_id from public.class_members where user_id = auth.uid()
$$;
create or replace function public.my_students()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.user_id from public.class_members m join public.classes c on c.id = m.class_id
  where c.teacher_id = auth.uid() and public.is_teacher()
$$;

alter table public.classes enable row level security;
alter table public.class_members enable row level security;

drop policy if exists "classes: teacher or member reads" on public.classes;
drop policy if exists "classes: teacher deletes own"     on public.classes;
drop policy if exists "members: self or teacher reads"   on public.class_members;
drop policy if exists "members: self or teacher deletes" on public.class_members;
create policy "classes: teacher or member reads" on public.classes for select to authenticated
  using (teacher_id = (select auth.uid()) or id in (select public.joined_class_ids()));
create policy "classes: teacher deletes own" on public.classes for delete to authenticated
  using (teacher_id = (select auth.uid()));
create policy "members: self or teacher reads" on public.class_members for select to authenticated
  using (user_id = (select auth.uid()) or class_id in (select public.taught_class_ids()));
create policy "members: self or teacher deletes" on public.class_members for delete to authenticated
  using (user_id = (select auth.uid()) or class_id in (select public.taught_class_ids()));

-- Создаются и пополняются классы только через функции ниже, напрямую — нельзя.
revoke all on public.classes, public.class_members from anon, authenticated;
grant select, delete on public.classes, public.class_members to authenticated;

-- Прогресс учеников своих классов учитель может читать (менять — нет).
drop policy if exists "progress: teacher reads class" on public.progress;
create policy "progress: teacher reads class" on public.progress for select to authenticated
  using (user_id in (select public.my_students()));

-- Новый класс. Только для учителей; код — 6 знаков без похожих (0/O, 1/I/L).
create or replace function public.create_class(class_name text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  new_code text;
  rec public.classes;
begin
  if not public.is_teacher() then raise exception 'only teachers can create classes'; end if;
  if (select count(*) from public.classes where teacher_id = auth.uid()) >= 30 then raise exception 'too many classes'; end if;
  loop
    new_code := '';
    for i in 1..6 loop new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.classes where code = new_code);
  end loop;
  insert into public.classes (teacher_id, name, code) values (auth.uid(), left(trim(class_name), 60), new_code) returning * into rec;
  return json_build_object('id', rec.id, 'name', rec.name, 'code', rec.code);
end;
$$;

-- Вступить в класс по коду. null — такого кода нет.
create or replace function public.join_class(class_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  cls public.classes;
  uname text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into cls from public.classes where code = upper(regexp_replace(class_code, '[^A-Za-z0-9]', '', 'g'));
  if not found then return null; end if;
  select left(raw_user_meta_data ->> 'name', 40) into uname from auth.users where id = auth.uid();
  insert into public.class_members (class_id, user_id, student_name) values (cls.id, auth.uid(), uname)
  on conflict (class_id, user_id) do nothing;
  return json_build_object('id', cls.id, 'name', cls.name);
end;
$$;

revoke all on function public.is_teacher(), public.taught_class_ids(), public.joined_class_ids(), public.my_students(),
  public.create_class(text), public.join_class(text) from public, anon;
grant execute on function public.is_teacher(), public.taught_class_ids(), public.joined_class_ids(), public.my_students(),
  public.create_class(text), public.join_class(text) to authenticated;
