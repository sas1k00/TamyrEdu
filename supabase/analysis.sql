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
       round(avg((choice is null)::int) * 100) as dont_know_pct,
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
