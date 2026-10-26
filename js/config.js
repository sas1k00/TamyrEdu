/*
 * Настройки облака (аккаунты и синхронизация прогресса).
 *
 * Пока поля пустые, приложение работает как раньше: прогресс хранится только на устройстве, кнопки входа нет.
 * Чтобы включить аккаунты: создайте проект Supabase, выполните supabase/schema.sql и впишите сюда адрес проекта
 * и ПУБЛИЧНЫЙ ключ (publishable, sb_publishable_… или старый anon). Подробно — README → «Аккаунты».
 *
 * Секретный ключ (sb_secret_… / service_role) сюда писать НЕЛЬЗЯ: этот файл виден всем посетителям сайта.
 */
(function () {
  const T = window.Tamyr;
  T.CONFIG = {
    supabaseUrl: 'https://olijvvquxrliefgflckb.supabase.co',
    supabaseKey: 'sb_publishable_1taXe53GH0c2t87zJWbpuA_081tl5m_',
    // Кнопка «Объясни мою ошибку». Включать после того, как функция explain задеплоена (README → «ИИ-объяснения»).
    ai: false
  };

  // Локальная разработка: index.html?backend=http://127.0.0.1:8772 подключает tools/dev_backend.py.
  // Срабатывает, только если и страница, и сервер открыты на этом же компьютере, — чужой сервер так подставить нельзя.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const DEV = 'tamyr.dev.backend';
    const m = /[?&]backend=([^&#]*)/.exec(location.search);
    let url = null;
    try {
      if (m) sessionStorage.setItem(DEV, decodeURIComponent(m[1]));
      url = sessionStorage.getItem(DEV);
    } catch (e) { url = m ? decodeURIComponent(m[1]) : null; }
    if (url && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) T.CONFIG = { supabaseUrl: url, supabaseKey: 'dev', ai: true };
  }
})();
