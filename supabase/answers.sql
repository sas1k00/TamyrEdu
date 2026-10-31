-- Tamyr: журнал ответов — данные для моделей (FSRS, BKT, IRT) и для учителя.
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Одна строка — один ответ ученика. Пишут только вошедшие (при регистрации они отметили согласие).
-- Имени и почты здесь нет: только id аккаунта, по которому ученик может удалить свои ответы,
-- а при удалении аккаунта они удаляются сами (on delete cascade).

create table if not exists public.answers (
  id        bigint generated always as identity primary key,
  user_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  at        timestamptz not null default now(),          -- когда ответил (время устройства)
  mode      text        not null check (mode in ('diag', 'practice', 'check')),
  topic     text        not null check (length(topic) <= 32),
  question  text        not null check (length(question) <= 64), -- id вопроса банка; у сгенерированных — gen:<тема>
  choice    smallint    check (choice between 0 and 9), -- номер варианта в банке (не на экране); null — «Не знаю»
  correct   boolean     not null,
  mis       text        check (length(mis) <= 64),      -- метка типичной ошибки у выбранного варианта
  hints     smallint    not null default 0 check (hints between 0 and 3),
  ms        integer     check (ms between 0 and 3600000), -- сколько думал, миллисекунды
  lang      text        check (lang in ('ru', 'kk'))
);
-- прогноз модели FSRS «вспомнит ли тему» в момент повторения (только mode = 'check'): по нему проверяем калибровку
alter table public.answers add column if not exists recall real check (recall between 0 and 1);
-- случайная задача из другой темы (1 из 10 в практике): такие ответы не зависят от того, что выбирает движок
alter table public.answers add column if not exists explore boolean not null default false;
-- версия движка (T.ENGINE): отличать ответы до и после изменения алгоритма
alter table public.answers add column if not exists engine text check (length(engine) <= 16);
create index if not exists answers_user_at on public.answers (user_id, at);
create index if not exists answers_question on public.answers (question);

alter table public.answers enable row level security;
drop policy if exists "answers: insert own" on public.answers;
drop policy if exists "answers: read own"   on public.answers;
drop policy if exists "answers: delete own" on public.answers;
create policy "answers: insert own" on public.answers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "answers: read own"   on public.answers for select to authenticated using ((select auth.uid()) = user_id);
create policy "answers: delete own" on public.answers for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.answers from anon;
grant select, insert, delete on public.answers to authenticated;

-- Выгрузка для анализа: вместо id аккаунта — короткий псевдоним, дата без точного времени.
-- Читает только владелец проекта (SQL Editor / Table Editor), ученикам представление недоступно.
create or replace view public.answers_export with (security_invoker = true) as
select left(md5(user_id::text), 10) as student, date(at at time zone 'Asia/Almaty') as day,
       mode, topic, question, choice, correct, mis, hints, ms, lang, recall, explore, engine
from public.answers;
revoke all on public.answers_export from anon, authenticated;
