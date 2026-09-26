
/* auth.js - local/offline authentication for Melkyar.
   NOTE: Because this is a browser-only offline app, this is an application
   gate, not server-grade security. The built-in supervisor is intentionally
   provisioned as requested by the owner. */
const AUTH = (() => {
  const SESSION_KEY = 'melkyar_auth_session';
  const LOCK_PREFIX = 'melkyar_active_user_';
  const ADMIN_USERNAME = 'alireza';
  const ADMIN_PASSWORD_HASH = '6495da527bb644b403ca922424bd8976d85699d392f975c7d84cff45db3fd96e';
  const LEGACY_ADMIN_USERNAME = 'Ali';
  const LEGACY_ADMIN_PASSWORD_HASH = 'a20a2b7bb0842d5cf8a0c06c626421fd51ec103925c1819a51271f2779afa730';

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }
  function setSession(user) {
    const lockKey = LOCK_PREFIX + String(user.username || '').toLowerCase();
    const token = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    localStorage.setItem(lockKey, token);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id || 'builtin-admin',
      name: user.name || 'مدیر سیستم',
      username: user.username,
      role: user.role || 'admin',
      permissions: user.permissions || ['all'],
      loginAt: new Date().toISOString(), sessionToken: token
    }));
  }
  function clearSession() { const s=getSession(); if(s?.username){ const k=LOCK_PREFIX+String(s.username).toLowerCase(); if(localStorage.getItem(k)===s.sessionToken)localStorage.removeItem(k); } sessionStorage.removeItem(SESSION_KEY); }
  function currentUser() {
    const u = getSession();
    if (u?.username) { const k=LOCK_PREFIX+String(u.username).toLowerCase(); if(u.sessionToken && localStorage.getItem(k) !== u.sessionToken){ clearSession(); return null; } }
    const label = document.getElementById('current-user-name');
    if (label && u) label.textContent = u.name || u.username;
    return u;
  }

  async function ensureBuiltInAdmin() {
    try {
      const existing = await db.users.getAll();
      let owner = existing.find(u => String(u.username || '').toLowerCase() === ADMIN_USERNAME);
      if (!owner) {
        owner = await db.users.add({ name: 'علیرضا بدر', username: ADMIN_USERNAME, passwordHash: ADMIN_PASSWORD_HASH, role: 'admin', status: 'active', permissions: ['all'], builtin: true, developer: true });
      } else if (owner.status !== 'active' || owner.role !== 'admin' || owner.passwordHash !== ADMIN_PASSWORD_HASH || !owner.developer) {
        await db.users.update(owner.id, { name: 'علیرضا بدر', username: ADMIN_USERNAME, passwordHash: ADMIN_PASSWORD_HASH, role: 'admin', status: 'active', permissions: ['all'], builtin: true, developer: true });
      }
      // Preserve an older built-in administrator if it already exists, but do not create a second account.
      const legacy = existing.find(u => String(u.username || '').toLowerCase() === LEGACY_ADMIN_USERNAME.toLowerCase());
      if (legacy && legacy.username !== ADMIN_USERNAME) {
        await db.users.update(legacy.id, { builtin: true, developer: true });
      }
    } catch (e) { console.error('ensureBuiltInAdmin', e); }
  }

  async function verify(username, password) {
    const u = String(username || '').trim();
    const p = String(password || '');
    if (!u || !p) return { ok:false, message:'نام کاربری و رمز عبور را وارد کنید.' };

    const hash = await sha256(p);
    if ((u.toLowerCase() === ADMIN_USERNAME.toLowerCase() && hash === ADMIN_PASSWORD_HASH) || (u.toLowerCase() === LEGACY_ADMIN_USERNAME.toLowerCase() && hash === LEGACY_ADMIN_PASSWORD_HASH)) {
      const users = await db.users.getAll();
      const admin = users.find(x => String(x.username || '').toLowerCase() === u.toLowerCase()) || { id:'builtin-admin', name:'علیرضا بدر', username:ADMIN_USERNAME, role:'admin', permissions:['all'], builtin:true, developer:true };
      setSession(admin);
      return { ok:true, user:admin };
    }

    const users = await db.users.getAll();
    const user = users.find(x =>
      String(x.username || '').toLowerCase() === u.toLowerCase() &&
      x.status !== 'inactive' &&
      x.passwordHash === hash
    );
    if (!user) return { ok:false, message:'نام کاربری یا رمز عبور صحیح نیست.' };
    setSession(user);
    return { ok:true, user };
  }

  function hasPermission(permission) {
    const u = currentUser();
    if (!u) return false;
    if (u.role === 'admin' || (u.permissions || []).includes('all')) return true;
    return (u.permissions || []).includes(permission);
  }

  async function requireLogin() {
    await ensureBuiltInAdmin();
    if (currentUser()) return true;
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'melkyar-login-overlay';
      overlay.innerHTML = `
        <div class="login-card">
          <img class="login-logo-img" src="assets/logo.jpg" alt="لوگوی ملک‌یار">
          <div class="login-subtitle">ورود به سامانه مدیریت املاک</div>
          <form id="melkyar-login-form" autocomplete="off">
            <label>نام کاربری<input id="login-username" required autocomplete="username" placeholder="نام کاربری"></label>
            <label>رمز عبور<input id="login-password" type="password" required autocomplete="current-password" placeholder="رمز عبور"></label>
            <div id="login-error" class="login-error"></div>
            <button class="btn btn--primary login-btn" type="submit">ورود به ملک‌یار</button>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      const form = overlay.querySelector('#melkyar-login-form');
      const err = overlay.querySelector('#login-error');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        err.textContent = '';
        const result = await verify(
          overlay.querySelector('#login-username').value,
          overlay.querySelector('#login-password').value
        );
        if (result.ok) {
          overlay.remove();
          resolve(true);
          router();
        } else {
          err.textContent = result.message;
        }
      });
      setTimeout(() => overlay.querySelector('#login-username').focus(), 50);
    });
  }

  return { ensureBuiltInAdmin, verify, requireLogin, currentUser, clearSession, hasPermission, sha256 };
})();
window.AUTH = AUTH;
