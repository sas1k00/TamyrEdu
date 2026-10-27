-- Проверка правил доступа на локальном PostgreSQL (НЕ на настоящем проекте!). Как запустить — README → «Проверка правил базы».
-- Минимальная имитация Supabase: роли, схема auth, auth.uid()/auth.jwt(), права по умолчанию.
do $$ begin  -- роли общие для всего сервера: при повторном запуске уже есть
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to postgres;
create schema auth;
create table auth.users (id uuid primary key, email text unique, raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'teacher@school.kz', '{"name":"Олжас"}'),
 ('00000000-0000-0000-0000-00000000000b', 'aigerim@x.kz', '{"name":"Айгерим"}'),
 ('00000000-0000-0000-0000-00000000000c', 'nurlan@x.kz', '{"name":"Нурлан"}'),
 ('00000000-0000-0000-0000-00000000000d', 'other.teacher@school.kz', '{"name":"Дана"}');
