/*
 * Аккаунт и синхронизация прогресса с облаком (Supabase: вход — /auth/v1, данные — /rest/v1).
 * Запросы идут обычным fetch, без SDK: приложение остаётся без сторонних библиотек и работает офлайн.
 *
 * Приложение по-прежнему «сначала локальное»: всё пишется в localStorage, а облако — копия.
 *   • вошёл → сравниваем прогресс на устройстве и в аккаунте (decide) и берём более свежий;
 *   • каждое сохранение через 1,5 с уходит в облако; нет сети — уйдёт при следующем сохранении или запуске;
 *   • прогресс гостя и прогресс аккаунта молча не затирают друг друга — приложение спрашивает, какой оставить.
 * В таблице одна строка на ученика, целиком: при работе с двух устройств одновременно побеждает последняя запись.
 */
(function () {
  const T = window.Tamyr;
  const KEY = 'tamyr.session';
  const cfg = T.CONFIG || {};
  const base = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  const enabled = !!(base && cfg.supabaseKey);

  let session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }
  if (!session || typeof session.access_token !== 'string' || !session.user || typeof session.user.id !== 'string') session = null;

  function store(s) {
    session = s;
    try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* нет хранилища — сессия живёт до закрытия вкладки */ }
  }

  /* Содержимое JWT (без проверки подписи — её проверяет сервер; нам нужны только id и почта). */
  function claims(token) {
    try {
      const b = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b + '='.repeat((4 - b.length % 4) % 4)))));
    } catch (e) { return null; }
  }

  /* Сессия из ответа /token, /signup или из адреса после перехода по ссылке в письме. */
  function fromTokens(r) {
    const c = r && claims(r.access_token);
    if (!c || typeof c.sub !== 'string') return null;
    const meta = (r.user && r.user.user_metadata) || c.user_metadata || {};
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token || null,
      expires_at: Date.now() + (Number(r.expires_in) || 3600) * 1000,
      user: { id: c.sub, email: String((r.user && r.user.email) || c.email || ''), name: typeof meta.name === 'string' ? meta.name.slice(0, 40) : '' }
    };
  }

  /* Ошибка запроса. kind — что показать человеку: credentials, exists, weak, unconfirmed, email, mailrate, rate, network, auth, server. */
  class ApiError extends Error {
    constructor(kind, status) { super(kind); this.kind = kind; this.status = status; }
  }
  function kindOf(status, body) {
    const code = String((body && (body.error_code || body.error || body.code)) || '');
    const msg = String((body && (body.msg || body.error_description || body.message)) || '').toLowerCase();
    if (/invalid_credentials|invalid_grant/.test(code) || /invalid login/.test(msg)) return 'credentials';
    if (/user_already_exists|email_exists/.test(code) || /already registered/.test(msg)) return 'exists';
    if (/weak_password/.test(code) || /password should/.test(msg)) return 'weak';
    if (/email_not_confirmed/.test(code) || /not confirmed/.test(msg)) return 'unconfirmed';
    if (/email_address_invalid|validation_failed/.test(code) || /valid email|invalid email/.test(msg)) return 'email';
    // лимит писем (встроенная почта Supabase шлёт лишь несколько писем в час) — это не «подожди минуту»
    if (/over_email_send_rate_limit/.test(code) || /email rate limit/.test(msg)) return 'mailrate';
    if (status === 429 || /rate_limit/.test(code)) return 'rate';
    if (status === 401 || status === 403) return 'auth';
    return 'server';
  }

  async function call(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ apikey: cfg.supabaseKey, 'Content-Type': 'application/json' }, opts.headers || {});
    if (opts.auth) headers.Authorization = 'Bearer ' + session.access_token;
    // На плохой связи запрос может висеть минутами — обрываем сами и считаем, что сети нет.
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 12000);
    let res;
    try {
      res = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: ctl.signal });
    } catch (e) { throw new ApiError('network', 0); }
    finally { clearTimeout(timeout); }
    const text = await res.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch (e) { body = null; } }
    if (!res.ok) throw new ApiError(kindOf(res.status, body), res.status);
    return body;
  }

  /* Токен живёт около часа: обновляем заранее. Если сервер отказал — сессия закончилась, выходим. */
  let refreshing = null;
  function fresh() {
    if (!session) return Promise.reject(new ApiError('auth', 401));
    if (session.expires_at - Date.now() > 60000) return Promise.resolve();
    if (!session.refresh_token) { store(null); changed(); return Promise.reject(new ApiError('auth', 401)); }
    if (!refreshing) {
      const old = session;
      refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: old.refresh_token } })
        .then(r => {
          const s = fromTokens(r);
          if (!s) throw new ApiError('auth', 401);
          if (!s.user.name) s.user.name = old.user.name;
          store(s);
        })
        .catch(e => { if (e.kind !== 'network') { store(null); changed(); } throw e; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function authed(path, opts) {
    await fresh();
    try { return await call(path, Object.assign({ auth: true }, opts)); }
    catch (e) { if (e.kind === 'auth') { store(null); changed(); } throw e; }
  }

  let status = { state: 'idle', at: 0 }; // idle | syncing | ok | offline | error | ask
  let pendingRemote = null;              // прогресс из аккаунта, пока человек выбирает, что оставить
  function setStatus(state) { status = { state, at: Date.now() }; if (A.onStatus) A.onStatus(status); }
  function changed() { if (A.onChange) A.onChange(session ? session.user : null); }

  /* Возврат по ссылке из письма: …#access_token=…&refresh_token=…&expires_in=…&type=signup|recovery.
     Разбираем до запуска роутера: иначе он примет этот хвост за название экрана. */
  function takeUrlTokens() {
    const h = location.hash.slice(1);
    if (!/(^|&)(access_token|error|error_code|error_description)=/.test(h)) return null;
    const p = new URLSearchParams(h);
    history.replaceState(null, '', location.pathname + location.search + '#account');
    if (!enabled || !p.get('access_token')) return 'link-error';
    const s = fromTokens({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') });
    if (!s) return 'link-error';
    store(s);
    return p.get('type') === 'recovery' ? 'recovery' : 'confirmed';
  }

  const here = () => location.origin + location.pathname;
  const rowUrl = () => '/rest/v1/progress?user_id=eq.' + encodeURIComponent(session.user.id);
  async function pull() {
    const rows = await authed(rowUrl() + '&select=state,updated_at');
    return Array.isArray(rows) && rows[0] && rows[0].state ? rows[0] : null;
  }
  function push(state) {
    return authed('/rest/v1/progress?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: session.user.id, state, updated_at: new Date().toISOString() }
    });
  }

  /* Что делать с прогрессом. local — состояние на устройстве, remote — строка из базы, userId — кто вошёл. */
  function decide(local, remote, userId) {
    if (!remote && !local) return 'none';
    if (!remote) return 'push';
    if (!local) return 'pull';
    if (local.owner !== userId) return 'ask'; // прогресс гостя или другого аккаунта — молча не затираем
    const r = Number(remote.state.updated) || 0, l = Number(local.updated) || 0;
    return r > l ? 'pull' : l > r ? 'push' : 'none';
  }

  let timer = null;
  const mine = () => !!session && T.learner.exists() && T.learner.owner() === session.user.id;
  async function pushNow() {
    setStatus('syncing');
    try { await push(T.learner.get()); setStatus('ok'); return true; }
    catch (e) { setStatus(e.kind === 'network' ? 'offline' : 'error'); return false; }
  }

  const A = {
    enabled,
    user: () => (session ? session.user : null),
    status: () => status,
    pending: () => pendingRemote,
    arrival: takeUrlTokens(), // 'confirmed' | 'recovery' | 'link-error' | null
    onChange: null,           // вошёл / вышел
    onStatus: null,           // изменилось состояние синхронизации

    /* 'signed-in' — сразу вошёл; 'confirm' — нужно подтвердить почту по ссылке из письма.
       consent_at — когда отмечено согласие на хранение данных (видно в Supabase: Authentication → Users). */
    async signUp(name, email, password) {
      const r = await call('/auth/v1/signup?redirect_to=' + encodeURIComponent(here()), { method: 'POST', body: { email, password, data: { name, consent_at: new Date().toISOString() } } });
      if (!r || !r.access_token) return 'confirm';
      const s = fromTokens(r);
      if (!s) throw new ApiError('server', 0);
      if (!s.user.name) s.user.name = name;
      store(s); changed();
      return 'signed-in';
    },
    async signIn(email, password) {
      const s = fromTokens(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
      if (!s) throw new ApiError('server', 0);
      store(s); changed();
    },
    async signOut() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (session) { try { await call('/auth/v1/logout', { method: 'POST', auth: true }); } catch (e) { /* токен всё равно забываем */ } }
      pendingRemote = null; status = { state: 'idle', at: 0 };
      store(null); changed();
    },
    recover(email) { return call('/auth/v1/recover?redirect_to=' + encodeURIComponent(here()), { method: 'POST', body: { email } }); },
    setPassword(password) { return authed('/auth/v1/user', { method: 'PUT', body: { password } }); },

    /* Сверка с облаком. choice ('local' | 'remote') — ответ на вопрос «какой прогресс оставить».
       Возвращает: 'pull', 'push', 'none', 'ask' (нужен выбор), 'error' или 'off'. */
    async sync(choice) {
      if (!enabled || !session) return 'off';
      if (timer) { clearTimeout(timer); timer = null; }
      const L = T.learner, uid = session.user.id;
      setStatus('syncing');
      try {
        const remote = choice && pendingRemote ? pendingRemote : await pull();
        if (L.exists() && L.get().demo) L.reset(); // демо — не прогресс ученика: в аккаунт его не переносим
        let action = decide(L.exists() ? L.get() : null, remote, uid);
        if (action === 'ask') {
          if (!choice) { pendingRemote = remote; setStatus('ask'); return 'ask'; }
          action = choice === 'remote' ? 'pull' : 'push';
        }
        pendingRemote = null;
        if (action === 'pull' && !L.adopt(remote.state, uid)) action = L.exists() ? 'push' : 'none'; // в облаке мусор — не берём
        // Дальше прогресс на устройстве — этого аккаунта, в том числе тот, что появится позже (первая диагностика после входа).
        L.setOwner(uid);
        if (action === 'push') await push(L.get());
        setStatus('ok');
        return action;
      } catch (e) {
        setStatus(e.kind === 'network' ? 'offline' : 'error');
        return 'error';
      }
    },
    /* Дослать несохранённое прямо сейчас (перед выходом). true — в облаке актуальная копия. */
    async flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      return mine() ? pushNow() : true;
    },
    async clearRemote() { if (enabled && session) await authed(rowUrl(), { method: 'DELETE' }); },

    _decide: decide, _claims: claims, _fromTokens: fromTokens, _kindOf: kindOf
  };

  // Каждое сохранение прогресса уходит в облако с небольшой задержкой — чтобы не слать запрос на каждый ответ.
  if (enabled && T.learner) {
    T.learner.onSave = function () {
      if (!mine()) return;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; if (mine()) pushNow(); }, 1500);
    };
  }

  T.account = A;
})();
