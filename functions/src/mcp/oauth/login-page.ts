/**
 * MCP OAuth ログイン画面 HTML 生成
 *
 * authorize エンドポイントで表示されるログインフォーム。
 * メール/パスワード + Google ログインに対応。
 */

// Firebase 公開設定（クライアントサイドで使用）
const FIREBASE_API_KEY = 'AIzaSyAGutWJF5bcTr_01Bjkizr7Sfo9HO__H78';
const FIREBASE_AUTH_DOMAIN = 'compass-31e9e.firebaseapp.com';
const FIREBASE_PROJECT_ID = 'compass-31e9e';
const FIREBASE_APP_ID = '1:70173334851:web:fc6c922a399014a10923f6';

interface LoginPageParams {
  clientId: string;
  clientName?: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: string[];
  callbackUrl: string;
  error?: string;
}

export function renderLoginPage(params: LoginPageParams): string {
  const {
    clientId,
    clientName,
    redirectUri,
    codeChallenge,
    state,
    scopes,
    callbackUrl,
    error,
  } = params;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const displayName = clientName ? esc(clientName) : esc(clientId);
  const errorHtml = error
    ? `<div class="error">${esc(error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compass - アクセス許可</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.1);
      max-width: 400px;
      width: 100%;
      padding: 2rem;
    }
    .logo {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .logo h1 {
      font-size: 1.5rem;
      color: #1a1a1a;
      font-weight: 700;
    }
    .logo p {
      color: #666;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    .client-info {
      background: #f0f7ff;
      border: 1px solid #d0e4f7;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      color: #333;
      text-align: center;
    }
    .client-info strong { color: #1a73e8; }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #333;
      margin-bottom: 0.25rem;
    }
    input[type="email"], input[type="password"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 1rem;
      margin-bottom: 1rem;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #1a73e8;
      box-shadow: 0 0 0 2px rgba(26,115,232,0.2);
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #1a73e8;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #1557b0; }
    button:disabled {
      background: #93c5fd;
      cursor: not-allowed;
    }
    .google-btn {
      background: white;
      color: #333;
      border: 1px solid #ddd;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .google-btn:hover {
      background: #f8f8f8;
    }
    .google-btn:disabled {
      background: #f0f0f0;
      color: #999;
    }
    .google-icon {
      width: 20px;
      height: 20px;
    }
    .divider {
      display: flex;
      align-items: center;
      margin: 1rem 0;
      color: #999;
      font-size: 0.8rem;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      border-bottom: 1px solid #ddd;
    }
    .divider span {
      padding: 0 0.75rem;
    }
    .error {
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #b91c1c;
      padding: 0.625rem 0.75rem;
      border-radius: 6px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.6s linear infinite;
      vertical-align: middle;
      margin-right: 0.5rem;
    }
    .spinner-dark {
      border-color: rgba(0,0,0,0.15);
      border-top-color: #333;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>Compass</h1>
      <p>建築工程管理</p>
    </div>

    <div class="client-info">
      <strong>${displayName}</strong> があなたの Compass アカウントへのアクセスを要求しています
    </div>

    ${errorHtml}

    <button type="button" id="googleBtn" class="google-btn">
      <svg class="google-icon" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      Google でログイン
    </button>

    <div class="divider"><span>または</span></div>

    <form id="loginForm">
      <label for="email">メールアドレス</label>
      <input type="email" id="email" name="email" required autocomplete="email">

      <label for="password">パスワード</label>
      <input type="password" id="password" name="password" required autocomplete="current-password">

      <button type="submit" id="submitBtn">メールでログイン</button>
    </form>
  </div>

  <!-- Firebase Auth SDK (compat) for Google sign-in popup -->
  <script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-auth-compat.js"></script>

  <script>
    // Firebase 初期化
    firebase.initializeApp({
      apiKey: ${JSON.stringify(FIREBASE_API_KEY)},
      authDomain: ${JSON.stringify(FIREBASE_AUTH_DOMAIN)},
      projectId: ${JSON.stringify(FIREBASE_PROJECT_ID)},
      appId: ${JSON.stringify(FIREBASE_APP_ID)},
    });

    const CALLBACK_URL = ${JSON.stringify(callbackUrl)};
    const OAUTH_FIELDS = {
      client_id: ${JSON.stringify(clientId)},
      redirect_uri: ${JSON.stringify(redirectUri)},
      code_challenge: ${JSON.stringify(codeChallenge)},
      state: ${JSON.stringify(state ?? '')},
      scopes: ${JSON.stringify(scopes.join(' '))},
    };

    // ID トークンをサーバーに POST する共通処理
    function submitIdToken(idToken) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = CALLBACK_URL;
      form.style.display = 'none';

      const allFields = { id_token: idToken, ...OAUTH_FIELDS };
      for (const [k, v] of Object.entries(allFields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = v;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    }

    function showError(msg) {
      const old = document.querySelector('.error');
      if (old) old.remove();
      const div = document.createElement('div');
      div.className = 'error';
      div.textContent = msg;
      const card = document.querySelector('.client-info');
      card.parentNode.insertBefore(div, card.nextSibling);
    }

    // ── Google ログイン ──
    const googleBtn = document.getElementById('googleBtn');
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      googleBtn.innerHTML = '<span class="spinner spinner-dark"></span>接続中...';

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebase.auth().signInWithPopup(provider);
        const idToken = await result.user.getIdToken();
        submitIdToken(idToken);
      } catch (err) {
        googleBtn.disabled = false;
        googleBtn.innerHTML = '<svg class="google-icon" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Google でログイン';
        if (err.code === 'auth/popup-closed-by-user') return;
        showError(err.message || 'Google ログインに失敗しました');
      }
    });

    // ── メール/パスワード ログイン ──
    const form = document.getElementById('loginForm');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span>認証中...';

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      try {
        const authRes = await fetch(
          'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + ${JSON.stringify(FIREBASE_API_KEY)},
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
          }
        );

        if (!authRes.ok) {
          const err = await authRes.json();
          const msg = err.error?.message || 'Authentication failed';
          const displayMsg = {
            'EMAIL_NOT_FOUND': 'メールアドレスが見つかりません',
            'INVALID_PASSWORD': 'パスワードが正しくありません',
            'INVALID_LOGIN_CREDENTIALS': 'メールアドレスまたはパスワードが正しくありません',
            'USER_DISABLED': 'このアカウントは無効化されています',
            'TOO_MANY_ATTEMPTS_TRY_LATER': '試行回数が多すぎます。しばらく待ってから再試行してください',
          }[msg] || 'ログインに失敗しました';
          throw new Error(displayMsg);
        }

        const authData = await authRes.json();
        submitIdToken(authData.idToken);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'メールでログイン';
        showError(err.message);
      }
    });
  </script>
</body>
</html>`;
}
