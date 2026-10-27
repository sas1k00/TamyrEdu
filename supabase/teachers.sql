-- Tamyr: учительские аккаунты.
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run. Повторный запуск безопасен.
--
-- Учитель — обычный аккаунт Tamyr с ролью teacher. Только у него в приложении есть вкладка «Учителю».
-- Роль хранится в app_metadata: её может менять только владелец проекта, ученик — нет
-- (в отличие от user_metadata, куда пишется имя при регистрации).
--
-- Как сделать учителя (сначала человек регистрируется на сайте как обычно):
--   select public.set_teacher('teacher@school.kz');
-- Снять роль:
--   select public.set_teacher('teacher@school.kz', false);
-- Список учителей:
--   select email from auth.users where raw_app_meta_data ->> 'role' = 'teacher';
-- Вкладка появится у учителя при следующем открытии сайта.

create or replace function public.set_teacher(teacher_email text, is_teacher boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', case when is_teacher then 'teacher' else 'student' end)
   where lower(email) = lower(trim(teacher_email));
  if not found then
    return 'Аккаунт ' || teacher_email || ' не найден: пусть человек сначала зарегистрируется на сайте';
  end if;
  return case when is_teacher then 'Готово: ' || teacher_email || ' — учитель'
              else 'Готово: ' || teacher_email || ' больше не учитель' end;
end;
$$;

-- Вызывать функцию может только владелец проекта (из SQL Editor). Иначе любой ученик сделал бы учителем себя.
revoke all on function public.set_teacher(text, boolean) from public, anon, authenticated;
