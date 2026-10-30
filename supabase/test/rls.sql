-- Сценарии: ученик, учитель, другой учитель, гость. Ожидаемый результат — в строках после каждого \echo (ok/denied, числа).
-- Запуск: см. README → «Проверка правил базы». Выполнять ПОСЛЕ shim.sql и всех файлов supabase/*.sql.
\set T '00000000-0000-0000-0000-00000000000a'
\set A '00000000-0000-0000-0000-00000000000b'
\set N '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
-- вспомогательное: попробовать запрос и напечатать ok/denied
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return 'denied: ' || sqlerrm; end $$;
grant execute on function public._try(text) to anon, authenticated;
\pset tuples_only on
\pset format unaligned

\echo '1. ученик пытается сделать себя учителем'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
select public._try($$select public.set_teacher('aigerim@x.kz')$$);
reset role;

\echo '2. до выдачи роли учитель не может создать класс'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select public._try($$select public.create_class('11 А')$$);
reset role;
select public.set_teacher('teacher@school.kz'); select public.set_teacher('other.teacher@school.kz'); select public.set_teacher('nobody@x.kz');

\echo '3. учитель создаёт класс'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select (public.create_class('11 «А»') ->> 'code') ~ '^[A-HJ-NP-Z2-9]{6}$' as code_ok;
reset role;
select code from public.classes limit 1 \gset

\echo '4. ученики сохраняют прогресс'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
insert into public.progress (user_id, state) values (:'A', '{"v":1,"name":"Айгерим"}'); reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false); set role authenticated;
insert into public.progress (user_id, state) values (:'N', '{"v":1,"name":"Нурлан"}'); reset role;

\echo '5. до вступления учитель не видит ничьего прогресса (ожидаем 0)'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select count(*) from public.progress; reset role;

\echo '6. Айгерим вступает: код строчными с дефисом; неверный код → null'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
select public.join_class(lower(left(:'code',3)) || '-' || lower(right(:'code',3))) ->> 'name';
select coalesce(public.join_class('ZZZZZZ')::text, 'null');
select 'Айгерим видит свои классы: ' || string_agg(name, ',') from public.classes;
select 'Айгерим видит участников: ' || count(*) from public.class_members;
reset role;

\echo '7. учитель видит прогресс только Айгерим; изменить его не может'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select string_agg(state ->> 'name', ',') from public.progress;
select 'имя в классе: ' || student_name from public.class_members;
update public.progress set state = '{"v":1,"name":"взлом"}' where user_id = :'A';
select public._try($$insert into public.class_members (class_id, user_id) select id, '00000000-0000-0000-0000-00000000000c' from public.classes$$);
reset role;
select 'прогресс Айгерим не изменён: ' || (state ->> 'name') from public.progress where user_id = :'A';

\echo '8. Нурлан: не видит классов, чужого прогресса, не может вступить напрямую'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false); set role authenticated;
select 'классы: ' || count(*) from public.classes;
select 'прогресс: ' || string_agg(state ->> 'name', ',') from public.progress;
select public._try($$insert into public.class_members (class_id, user_id) select id, '00000000-0000-0000-0000-00000000000c' from public.classes$$);
reset role;

\echo '9. другой учитель не видит ни класса, ни Айгерим'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false); set role authenticated;
select 'классы: ' || count(*) || ', прогресс: ' || (select count(*) from public.progress) from public.classes;
select public._try($$delete from public.classes$$) || ' (удалить чужой класс)';
reset role;
select 'класс на месте: ' || count(*) from public.classes;

\echo '10. роль снята — доступ к прогрессу пропал сразу'
select public.set_teacher('teacher@school.kz', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","app_metadata":{"role":"teacher"}}', false); set role authenticated;
select 'прогресс: ' || count(*) from public.progress; reset role;
select public.set_teacher('teacher@school.kz');

\echo '11. Айгерим выходит из класса — учитель больше не видит'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
delete from public.class_members where user_id = :'A'; reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select 'прогресс: ' || count(*) from public.progress; reset role;

\echo '12. учитель убирает ученика и удаляет класс'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false); set role authenticated;
select public.join_class(:'code') ->> 'name'; reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
with d as (delete from public.class_members where user_id = :'N' returning 1) select 'убран: ' || count(*) from d;
with d as (delete from public.classes returning 1) select 'удалён класс: ' || count(*) from d;
reset role;

\echo '13. гость (anon) ничего не может'
select set_config('request.jwt.claims', '', false); set role anon;
select public._try($$select public.join_class('ABCDEF')$$);
select public._try($$select public.create_class('x')$$);
select public._try($$select * from public.progress$$);
select public._try($$select * from public.classes$$);
reset role;

\echo '14. лимит ИИ (лимит 2): true, true, false'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
select public.ai_take(2); select public.ai_take(2); select public.ai_take(2);
select public._try($$select * from public.ai_usage$$) || ' (таблицу лимита читать нельзя)';
reset role;

\echo '15. журнал ответов: свой пишется, чужой не виден, гостю нельзя'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
insert into public.answers (mode, topic, question, correct) values ('practice', 'frac', 'frac1', false); reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false); set role authenticated;
select 'Нурлан видит ответов: ' || count(*) from public.answers;
select public._try($$insert into public.answers (user_id, mode, topic, question, correct) values ('00000000-0000-0000-0000-00000000000b', 'diag', 'x', 'y', true)$$) || ' (записать за другого)';
reset role; set role anon;
select public._try($$insert into public.answers (mode, topic, question, correct) values ('diag', 'x', 'y', true)$$) || ' (гость)';
reset role;
select 'выгрузка: ' || student || ' ' || topic from public.answers_export;

\echo '16. пробный ЕНТ: учитель сохраняет результаты своего класса; чужие ученики и неверные номера отбрасываются'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select public.create_class('11 «Б»') ->> 'name'; reset role;
select id as cls, code as code2 from public.classes where name = '11 «Б»' \gset
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
select public.join_class(:'code2') ->> 'name'; reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select public.save_mock_test(null, :'cls', 'Пробный ЕНТ 1', '2026-11-16', array['frac','frac','pct',''],
  jsonb_build_object(:'A', jsonb_build_array(2, 2, 3, 9, 'x'), :'N', jsonb_build_array(1))) is not null as saved;
select 'ученики в результатах: ' || count(*) || ', ошибки Айгерим: ' || (select wrong::text from public.mock_results) from public.mock_results;
select public._try($$insert into public.mock_results (test_id, user_id) select id, '00000000-0000-0000-0000-00000000000c' from public.mock_tests$$) || ' (писать напрямую)';
reset role;
select 'выгрузка: ' || string_agg(topic || ' ' || wrong || '/' || questions, ', ' order by topic) from public.mock_export;

\echo '17. пробный ЕНТ: ученик, другой учитель и гость не видят; чужой класс сохранить нельзя'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false); set role authenticated;
select 'Айгерим: работ ' || (select count(*) from public.mock_tests) || ', результатов ' || count(*) from public.mock_results; reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', false); set role authenticated;
select 'другой учитель: работ ' || (select count(*) from public.mock_tests) || ', результатов ' || count(*) from public.mock_results;
select public._try(format($$select public.save_mock_test(null, %L, 'x', '2026-11-16', array['frac'], '{}')$$, :'cls')) || ' (чужой класс)';
reset role; set role anon;
select public._try($$select * from public.mock_tests$$) || ' (гость)';
reset role;

\echo '18. роль учителя снята — пробные ЕНТ скрыты сразу'
select public.set_teacher('teacher@school.kz', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false); set role authenticated;
select 'работ: ' || count(*) from public.mock_tests; reset role;
select public.set_teacher('teacher@school.kz');
