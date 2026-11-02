-- Tamyr: проверка на реальных учениках. Запросы для пилота — выполнять по одному в Supabase → SQL Editor.
-- Только чтение: ничего не меняют. Данные — из журнала ответов (supabase/answers.sql), обезличенные.
-- Цифры честные, только когда данных достаточно: в каждом запросе есть столбец n — смотрите на него.

-- 1. Активность: сколько учеников занимались и сколько задач решили по дням.
select date(at at time zone 'Asia/Almaty') as day,
       count(distinct user_id)              as students,
       count(*)                             as answers,
       round(avg(correct::int) * 100)       as correct_pct
from public.answers
group by 1 order by 1 desc;

-- 2. Калибровка модели забывания (FSRS): совпадает ли прогноз «вспомнит» с тем, что было на самом деле.
-- Хорошая модель: в каждой строке predicted ≈ actual. Если actual заметно ниже — модель слишком оптимистична
-- для наших учеников, и её параметры пора подбирать по журналу.
select case when recall < 0.8 then '< 80%' when recall < 0.9 then '80–90%' when recall < 0.95 then '90–95%' else '≥ 95%' end as predicted_bucket,
       count(*)                          as n,
       round(avg(recall)::numeric * 100) as predicted_pct,
       round(avg(correct::int) * 100)    as actual_pct
from public.answers
where mode = 'check' and recall is not null
group by 1 order by min(recall);

-- 3. Точность диагностики: если тема в диагностике решена без ошибок, справляется ли ученик с ней потом?
-- Для каждой пары «ученик — тема»: все ответы диагностики верны → доля верных в первых повторениях/практике.
-- Высокий процент — диагностика не завышает знания; низкий — засчитывает темы, которых ученик не знает.
with diag as (
  select user_id, topic, bool_and(correct) as all_right, max(at) as diag_end
  from public.answers where mode = 'diag' group by 1, 2
), later as (
  select a.user_id, a.topic, a.correct,
         row_number() over (partition by a.user_id, a.topic order by a.at) as k
  from public.answers a join diag d on d.user_id = a.user_id and d.topic = a.topic and a.at > d.diag_end
  where a.mode in ('practice', 'check')
)
select case when d.all_right then 'в диагностике — без ошибок' else 'в диагностике — с ошибками' end as diagnosis,
       count(*)                            as n,
       round(avg(l.correct::int) * 100)    as later_correct_pct
from diag d join later l on l.user_id = d.user_id and l.topic = d.topic and l.k <= 3
group by 1;

-- 4. Задачи, которые стоит пересмотреть: слишком лёгкие, слишком трудные или с «ловушкой», которая ловит всех.
-- Нужно хотя бы 20 ответов на задачу (n), иначе процент случайный.
select question, topic, count(*) as n, round(avg(correct::int) * 100) as correct_pct,
       round(avg((choice is null and typed is null)::int) * 100) as dont_know_pct,
       round(avg(ms) / 1000) as avg_seconds
from public.answers
where question not like 'gen:%'
group by 1, 2 having count(*) >= 20
order by correct_pct;

-- 5. Типичные ошибки мышления: какие ловушки срабатывают чаще всего (для разбора у доски).
select mis, count(*) as n, count(distinct user_id) as students
from public.answers where mis is not null
group by 1 order by n desc limit 15;

-- 6. Сколько повторений накоплено для подбора параметров FSRS (ориентир — от 1000).
select count(*) filter (where mode = 'check')                      as check_answers,
       count(*) filter (where mode = 'check') / 2                  as reviews_approx,
       count(distinct user_id) filter (where mode = 'check')       as students
from public.answers;

-- 7. Диагностика против пробного ЕНТ (нужен supabase/mock.sql и введённые учителем результаты).
-- Вердикт Tamyr — итог последней диагностики ученика (state.diag.status), ЕНТ — ошибся ли он хотя бы в одном вопросе темы.
-- Хорошая диагностика: у «gap» (пробел) доля ошибок на ЕНТ высокая, у «mastered» (знает) — низкая.
-- Сравнивать честно, когда диагностика и пробный ЕНТ прошли в одну неделю (неделя 0 пилота).
with d as (
  select p.user_id, s.key as topic, s.value as verdict
  from public.progress p, jsonb_each_text(p.state -> 'diag' -> 'status') s
), e as (
  select r.user_id, m.topics[i] as topic, bool_or(i = any (r.wrong)) as ent_wrong
  from public.mock_results r
  join public.mock_tests m on m.id = r.test_id
  cross join lateral generate_subscripts(m.topics, 1) as i
  where m.topics[i] <> ''
  group by 1, 2
)
select d.verdict, count(*) as n, round(avg(e.ent_wrong::int) * 100) as ent_wrong_pct
from d join e using (user_id, topic)
group by 1 order by 3 desc;

-- 8. Вписанный ответ против выбора из вариантов (практика). Формат выбирается случайно для каждой задачи,
-- поэтому сравниваются одни и те же ученики на одних и тех же темах. Разница choice_pct − typed_pct показывает,
-- сколько верных ответов в формате с вариантами — угадывание и узнавание, а не умение решить.
-- Только задачи, которые бывают в обоих форматах (у других тем typed_n = 0). Смотрите на n в обоих столбцах.
select topic,
       count(*) filter (where fmt = 'choice')                                    as choice_n,
       round(avg(correct::int) filter (where fmt = 'choice') * 100)            as choice_pct,
       count(*) filter (where fmt = 'typed')                                     as typed_n,
       round(avg(correct::int) filter (where fmt = 'typed') * 100)             as typed_pct,
       round(avg((typed is null)::int) filter (where fmt = 'typed') * 100)     as typed_dont_know_pct
from public.answers
where mode = 'practice' and not explore
group by 1 having count(*) filter (where fmt = 'typed') > 0
order by avg(correct::int) filter (where fmt = 'choice') - avg(correct::int) filter (where fmt = 'typed') desc nulls last;

-- 9. Новые ошибки: неверные вписанные ответы, которых нет среди известных ловушек (mis пустой и число не верное).
-- Если одно и то же неверное число на одной задаче пишут разные ученики — это кандидат в новую ошибку мышления:
-- разобрать с учителем, добавить вариант с меткой в банк или генератор. students ≥ 2 — уже не случайная описка.
select topic, coalesce(item, question) as task, typed, count(*) as n, count(distinct user_id) as students
from public.answers
where fmt = 'typed' and not correct and typed is not null and mis is null
group by 1, 2, 3 having count(distinct user_id) >= 2
order by students desc, n desc limit 50;

-- 10. Сравнение классов пилота (например, НИШ и обычная школа): активность, точность в обоих форматах, ловушки.
-- Класс — по названию, которое дал учитель (назовите классы понятно: «НИШ 10А», «Школа №12 10Б»).
-- Ученик в двух классах посчитается в обоих.
select c.name as class, count(distinct a.user_id) as students, count(*) as answers,
       round(avg(a.correct::int) filter (where a.mode = 'diag') * 100)                        as diag_pct,
       round(avg(a.correct::int) filter (where a.mode = 'practice' and a.fmt = 'choice') * 100) as practice_choice_pct,
       round(avg(a.correct::int) filter (where a.mode = 'practice' and a.fmt = 'typed') * 100)  as practice_typed_pct,
       round(avg((a.mis is not null)::int) filter (where not a.correct) * 100)                 as known_trap_pct
from public.classes c
join public.class_members m on m.class_id = c.id
join public.answers a on a.user_id = m.user_id and a.at >= m.joined_at
group by c.id, c.name order by c.name;
