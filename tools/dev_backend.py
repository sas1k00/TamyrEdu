"""
Локальный сервер для разработки аккаунтов: повторяет ту часть Supabase, которой пользуется js/account.js.

    py tools/dev_backend.py                 # вход сразу после регистрации
    py tools/dev_backend.py --confirm       # как в Supabase по умолчанию: сначала подтвердить почту
    py tools/dev_backend.py --ttl 5         # токен живёт 5 секунд — проверить обновление токена

Потом открыть приложение так: http://localhost:8771/index.html?backend=http://127.0.0.1:8772

Это НЕ настоящий бэкенд: всё хранится в памяти и пропадает при остановке, писем он не шлёт
(ссылки из «писем» печатает в консоль). Для сайта нужен проект Supabase и supabase/schema.sql.
"""
import argparse, base64, hashlib, json, secrets, sys, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, quote

p = argparse.ArgumentParser()
p.add_argument('--port', type=int, default=8772)
p.add_argument('--confirm', action='store_true', help='требовать подтверждение почты')
p.add_argument('--ttl', type=int, default=3600, help='срок жизни токена, секунды')
ARGS = p.parse_args()

USERS = {}      # email -> {id, email, salt, hash, name, confirmed}
ACCESS = {}     # access_token -> (user_id, expires)
REFRESH = {}    # refresh_token -> user_id
PROGRESS = {}   # user_id -> {user_id, state, updated_at}
AI_USED = {}    # (user_id, день) -> сколько объяснений ИИ запрошено
ANSWERS = []    # журнал ответов: как public.answers, но в памяти
AI_LIMIT = 20
VERIFY = {}     # одноразовый токен из письма -> (user_id, kind, redirect)


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj, ensure_ascii=False).encode()).rstrip(b'=').decode()


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100_000).hex()


def session_for(user):
    exp = time.time() + ARGS.ttl
    # Токен выглядит как JWT (приложение читает из него id и почту), но не подписан: проверка — по таблице ACCESS.
    token = '.'.join([b64({'alg': 'none', 'typ': 'JWT'}),
                      b64({'sub': user['id'], 'email': user['email'], 'exp': int(exp), 'user_metadata': {'name': user['name']}}),
                      secrets.token_urlsafe(16)])
    refresh = secrets.token_urlsafe(24)
    ACCESS[token] = (user['id'], exp)
    REFRESH[refresh] = user['id']
    return {'access_token': token, 'token_type': 'bearer', 'expires_in': ARGS.ttl, 'refresh_token': refresh,
            'user': {'id': user['id'], 'email': user['email'], 'user_metadata': {'name': user['name']}}}


def by_id(uid):
    return next((u for u in USERS.values() if u['id'] == uid), None)


def mail_link(redirect, user, kind):
    """Ссылка из «письма». Как в Supabase, она ведёт на сервер (/verify), а тот уже возвращает человека на сайт с токенами."""
    token = secrets.token_urlsafe(16)
    VERIFY[token] = (user['id'], kind, redirect or 'http://localhost:8771/index.html')
    return 'http://127.0.0.1:%d/auth/v1/verify?token=%s&type=%s' % (ARGS.port, token, kind)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stdout.write('%s %s\n' % (self.command, self.path.split('#')[0][:90]))
        sys.stdout.flush()

    def send(self, status, body=None):
        data = b'' if body is None else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(n) or b'{}')
        except ValueError:
            return {}

    def user(self):
        """Кто пришёл: по токену из Authorization. None — токена нет, он чужой или истёк."""
        token = (self.headers.get('Authorization') or '').replace('Bearer ', '', 1)
        entry = ACCESS.get(token)
        if not entry or entry[1] < time.time():
            return None
        return by_id(entry[0])

    def do_OPTIONS(self):
        self.send(204)

    def do_GET(self):
        self.route('GET')

    def do_POST(self):
        self.route('POST')

    def do_PUT(self):
        self.route('PUT')

    def do_DELETE(self):
        self.route('DELETE')

    def verify(self, q):
        entry = VERIFY.pop(q.get('token', ''), None)
        user = by_id(entry[0]) if entry else None
        if not user:
            target = 'http://localhost:8771/index.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
        else:
            user['confirmed'] = True
            t = session_for(user)
            target = '%s#access_token=%s&token_type=bearer&expires_in=%d&refresh_token=%s&type=%s' % (
                entry[2], quote(t['access_token']), ARGS.ttl, quote(t['refresh_token']), entry[1])
        self.send_response(303)
        self.send_header('Location', target)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def route(self, method):
        if method == 'GET' and urlparse(self.path).path == '/auth/v1/verify':
            return self.verify({k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()})
        if not self.headers.get('apikey'):
            return self.send(401, {'message': 'No API key found in request'})
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        path = url.path

        if path == '/auth/v1/signup' and method == 'POST':
            b = self.body()
            email, password = str(b.get('email', '')).strip().lower(), str(b.get('password', ''))
            if '@' not in email:
                return self.send(400, {'code': 400, 'error_code': 'validation_failed', 'msg': 'Unable to validate email address: invalid format'})
            if len(password) < 6:
                return self.send(422, {'code': 422, 'error_code': 'weak_password', 'msg': 'Password should be at least 6 characters.'})
            if email in USERS:
                return self.send(422, {'code': 422, 'error_code': 'user_already_exists', 'msg': 'User already registered'})
            salt = secrets.token_bytes(16)
            user = {'id': str(uuid.uuid4()), 'email': email, 'salt': salt, 'hash': hash_password(password, salt),
                    'name': str((b.get('data') or {}).get('name', ''))[:40], 'confirmed': not ARGS.confirm}
            USERS[email] = user
            if ARGS.confirm:
                print('[mail] confirm %s -> %s' % (email, mail_link(q.get('redirect_to'), user, 'signup')), flush=True)
                return self.send(200, {'id': user['id'], 'email': email, 'confirmation_sent_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
            return self.send(200, session_for(user))

        if path == '/auth/v1/token' and method == 'POST':
            b = self.body()
            if q.get('grant_type') == 'password':
                user = USERS.get(str(b.get('email', '')).strip().lower())
                if not user or hash_password(str(b.get('password', '')), user['salt']) != user['hash']:
                    return self.send(400, {'code': 400, 'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
                if not user['confirmed']:
                    return self.send(400, {'code': 400, 'error_code': 'email_not_confirmed', 'msg': 'Email not confirmed'})
                return self.send(200, session_for(user))
            if q.get('grant_type') == 'refresh_token':
                uid = REFRESH.pop(str(b.get('refresh_token', '')), None)   # одноразовый, как в Supabase
                user = by_id(uid) if uid else None
                if not user:
                    return self.send(400, {'code': 400, 'error_code': 'refresh_token_not_found', 'msg': 'Invalid Refresh Token'})
                return self.send(200, session_for(user))
            return self.send(400, {'code': 400, 'error_code': 'unsupported_grant_type', 'msg': 'unsupported grant type'})

        if path == '/auth/v1/recover' and method == 'POST':
            user = USERS.get(str(self.body().get('email', '')).strip().lower())
            if user:
                print('[mail] recovery %s -> %s' % (user['email'], mail_link(q.get('redirect_to'), user, 'recovery')), flush=True)
            return self.send(200, {})   # одинаковый ответ, есть такой аккаунт или нет

        # всё, что ниже, — только для вошедших
        user = self.user()
        if path.startswith('/auth/v1/') or path.startswith('/rest/v1/') or path.startswith('/functions/v1/'):
            if not user:
                return self.send(401, {'code': 401, 'error_code': 'bad_jwt', 'msg': 'invalid JWT'})

        if path == '/auth/v1/logout' and method == 'POST':
            token = self.headers['Authorization'].replace('Bearer ', '', 1)
            ACCESS.pop(token, None)
            return self.send(204)

        if path == '/auth/v1/user':
            if method == 'PUT':
                b = self.body()
                if 'password' in b:
                    if len(str(b['password'])) < 6:
                        return self.send(422, {'code': 422, 'error_code': 'weak_password', 'msg': 'Password should be at least 6 characters.'})
                    user['salt'] = secrets.token_bytes(16)
                    user['hash'] = hash_password(str(b['password']), user['salt'])
                    user['confirmed'] = True
            return self.send(200, {'id': user['id'], 'email': user['email'], 'user_metadata': {'name': user['name']}})

        if path == '/rest/v1/progress':
            wanted = q.get('user_id', '').replace('eq.', '', 1)
            if method == 'GET':
                # как Row Level Security: чужую строку не видно, даже если попросить её по id
                row = PROGRESS.get(user['id']) if wanted in ('', user['id']) else None
                return self.send(200, [{'state': row['state'], 'updated_at': row['updated_at']}] if row else [])
            if method == 'POST':
                b = self.body()
                if b.get('user_id') != user['id']:
                    return self.send(403, {'code': '42501', 'message': 'new row violates row-level security policy for table "progress"'})
                if not isinstance(b.get('state'), dict) or len(json.dumps(b['state'])) > 200000:
                    return self.send(400, {'code': '23514', 'message': 'new row violates check constraint'})
                PROGRESS[user['id']] = {'user_id': user['id'], 'state': b['state'], 'updated_at': b.get('updated_at')}
                return self.send(201)
            if method == 'DELETE':
                if wanted == user['id']:
                    PROGRESS.pop(user['id'], None)
                return self.send(204)

        if path == '/rest/v1/answers':
            if method == 'POST':
                rows = self.body()
                if not isinstance(rows, list) or any(not isinstance(r, dict) or r.get('mode') not in ('diag', 'practice', 'check') for r in rows):
                    return self.send(400, {'code': '23514', 'message': 'new row violates check constraint'})
                ANSWERS.extend(dict(r, user_id=user['id']) for r in rows)
                print('[answers] +%d (всего %d)' % (len(rows), len(ANSWERS)), flush=True)
                return self.send(201)
            if method == 'GET':   # как RLS: только свои
                return self.send(200, [r for r in ANSWERS if r['user_id'] == user['id']])
            if method == 'DELETE':
                ANSWERS[:] = [r for r in ANSWERS if r['user_id'] != user['id']]
                return self.send(204)

        if path == '/functions/v1/explain' and method == 'POST':
            # Заглушка supabase/functions/explain: тот же вход и лимит, но вместо Claude — готовый текст.
            b = self.body()
            if not b.get('question') or not b.get('correct'):
                return self.send(400, {'error': 'bad'})
            key = (user['id'], time.strftime('%Y-%m-%d'))
            AI_USED[key] = AI_USED.get(key, 0) + 1
            if AI_USED[key] > AI_LIMIT:
                return self.send(429, {'error': 'limit'})
            time.sleep(0.6)
            chosen = b.get('chosen') or 'не знаю'
            return self.send(200, {'text': 'Похоже, ты выбрал %s, потому что сложил числители и знаменатели отдельно.\n'
                                           'Складывать можно только доли одного размера: 1/6 = 5/30, 1/5 = 6/30, '
                                           'поэтому 5/30 + 6/30 = 11/30. Правильный ответ: %s.' % (chosen, b['correct'])})

        self.send(404, {'message': 'not found'})


if __name__ == '__main__':
    print('Tamyr dev backend: http://127.0.0.1:%d  (confirm=%s, ttl=%ds)' % (ARGS.port, ARGS.confirm, ARGS.ttl), flush=True)
    ThreadingHTTPServer(('127.0.0.1', ARGS.port), Handler).serve_forever()
