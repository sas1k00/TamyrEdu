#!/bin/sh
# Прогон supabase/*.sql и проверок доступа на одноразовой базе локального PostgreSQL.
# Нужен psql и доступ к серверу, где можно создать базу: PGHOST/PGPORT/PGUSER — как обычно для psql.
#   sh tools/test_sql.sh            # создаст базу tamyr_rls_test, прогонит всё дважды и проверки
# Это не настоящий Supabase: tools/../supabase/test/shim.sql имитирует его роли и auth.uid().
set -e
cd "$(dirname "$0")/.."
DB=${DB:-tamyr_rls_test}
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
$P -d "$DB" -f supabase/test/shim.sql
for run in 1 2; do  # второй прогон проверяет, что файлы можно выполнять повторно
  for f in schema answers ai teachers classes; do $P -d "$DB" -f supabase/$f.sql >/dev/null 2>&1 || { echo "ОШИБКА в supabase/$f.sql"; $P -d "$DB" -f supabase/$f.sql; exit 1; }; done
done
echo "Все supabase/*.sql выполняются, повторно тоже."
$P -d "$DB" -f supabase/analysis.sql >/dev/null && echo "supabase/analysis.sql выполняется."
# Сценарии доступа сравниваем с эталоном. Новый эталон после осознанных изменений: UPDATE=1 sh tools/test_sql.sh
OUT=$($P -d "$DB" -f supabase/test/rls.sql 2>&1 | grep -v '^SET$\|^$\|^{')
if [ -n "$UPDATE" ]; then printf '%s\n' "$OUT" > supabase/test/rls.expected; echo "Эталон обновлён."; exit 0; fi
if printf '%s\n' "$OUT" | diff -u supabase/test/rls.expected -; then
  echo "Правила доступа: все сценарии совпали с эталоном (supabase/test/rls.expected)."
else
  echo "Правила доступа отличаются от эталона — см. разницу выше."; exit 1
fi
