const SESSION_KEY = 'gestor_auth_session';

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginLogoutBtn = document.getElementById('logout-btn');
const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
const authMessage = document.getElementById('auth-message');
const togglePasswordBtn = document.getElementById('toggle-login-password');
const loginPasswordInput = document.getElementById('login-password');

// Botón de "ojo" en el login: alterna type="password"/"text" para que el
// usuario pueda ver lo que escribió antes de enviarlo (evita el ida-y-vuelta
// de "no me deja entrar" por un typo invisible en la contraseña).
togglePasswordBtn?.addEventListener('click', () => {
    const showing = loginPasswordInput.type === 'text';
    loginPasswordInput.type = showing ? 'password' : 'text';
    togglePasswordBtn.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
    togglePasswordBtn.setAttribute('aria-pressed', String(!showing));
    document.getElementById('toggle-login-password-icon-show').style.display = showing ? '' : 'none';
    document.getElementById('toggle-login-password-icon-hide').style.display = showing ? 'none' : '';
});

function setMessage(text, type = 'info') {
    if (!authMessage) return;
    authMessage.textContent = text || '';
    authMessage.dataset.type = type;
}

function setLocked(locked) {
    document.body.dataset.auth = locked ? 'locked' : 'unlocked';
    if (authScreen) authScreen.style.display = locked ? 'flex' : 'none';
    if (appShell) appShell.style.display = locked ? 'none' : 'flex';
    if (loginLogoutBtn) loginLogoutBtn.style.display = 'none';
    if (sidebarLogoutBtn) sidebarLogoutBtn.style.display = locked ? 'none' : 'flex';
    if (loginForm) loginForm.style.display = locked ? 'grid' : 'none';
}

function saveSession(session) {
    if (session?.access_token) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        window.__GESTOR_ACCESS_TOKEN = session.access_token;
        window.__GESTOR_USER = session.user || null;
    } else {
        localStorage.removeItem(SESSION_KEY);
        window.__GESTOR_ACCESS_TOKEN = '';
        window.__GESTOR_USER = null;
    }
}

// BUG DE SESIÓN POR TIEMPO: el access_token de Supabase vence a la hora.
// Sin esto, cualquier guardado (nota, tarea, proyecto...) hecho después de
// esa hora fallaba con un error genérico sin explicación. Se renueva solo,
// en segundo plano, unos minutos antes de que venza -- el usuario nunca
// debería volver a ver ese error. refreshInFlight evita pedir dos
// renovaciones a la vez (Supabase invalida el refresh_token anterior en
// cuanto se usa uno nuevo, así que una segunda llamada en paralelo con el
// token viejo fallaría).
let refreshTimer = null;
let refreshInFlight = null;

function scheduleTokenRefresh(session) {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
    // expires_at (marca de tiempo absoluta, en segundos) es lo correcto acá
    // en vez de expires_in (segundos relativos AL MOMENTO EN QUE SE EMITIÓ
    // el token) -- si el navegador se cerró y se reabre esta sesión guardada
    // 40 minutos después, contar expires_in desde "ahora" programaría la
    // renovación muy tarde, cuando el token ya venció hace rato.
    let msUntilExpiry;
    if (session?.expires_at) {
        msUntilExpiry = session.expires_at * 1000 - Date.now();
    } else if (session?.expires_in) {
        msUntilExpiry = session.expires_in * 1000;
    } else {
        return;
    }
    // Renovar 5 minutos antes de que venza, con un piso de 10s (si ya está
    // por vencer o vencido, renovar casi de inmediato en vez de negativo).
    const msUntilRefresh = Math.max(msUntilExpiry - 5 * 60 * 1000, 10000);
    refreshTimer = setTimeout(async () => {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            // El refresh_token también venció o ya no es válido: no hay
            // forma de seguir sin que el usuario vuelva a poner su clave.
            saveSession(null);
            setLocked(true);
            setMessage('Tu sesión expiró. Inicia sesión de nuevo.', 'error');
        }
    }, msUntilRefresh);
}

async function refreshAccessToken() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
        try {
            const rawSession = localStorage.getItem(SESSION_KEY);
            const session = rawSession ? JSON.parse(rawSession) : null;
            if (!session?.refresh_token) return null;

            const res = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: session.refresh_token }),
            });
            if (!res.ok) return null;

            const data = await res.json().catch(() => null);
            if (!data?.access_token) return null;

            saveSession(data);
            scheduleTokenRefresh(data);
            return data;
        } catch {
            return null;
        } finally {
            refreshInFlight = null;
        }
    })();

    return refreshInFlight;
}

// api.js llama a esto como red de seguridad cuando una petición cualquiera
// responde 401 -- por si el timer de arriba no llegó a dispararse (pestaña
// en segundo plano, computadora en suspensión, etc.).
window.__gestorRefreshAccessToken = refreshAccessToken;

// El correo permitido lo decide el servidor (variable de entorno
// AUTH_ALLOWED_EMAILS), no este archivo -- así el repo público nunca
// expone en el código quiénes tienen acceso. /api/auth/me ya responde
// 403 si el correo de la sesión no está en esa lista.
async function validateSession(session) {
    if (!session?.access_token) return false;

    const res = await fetch('/api/auth/me', {
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });

    return res.ok;
}

async function applySession(session) {
    if (!session?.access_token) {
        saveSession(null);
        setLocked(true);
        return;
    }

    let activeSession = session;
    let valid = await validateSession(activeSession);
    if (!valid) {
        // El access_token guardado puede estar vencido simplemente porque
        // pasó tiempo con el navegador cerrado -- antes de mandar al usuario
        // a loguearse de nuevo, intentar renovarlo con el refresh_token
        // (que dura mucho más) por si el problema se arregla solo.
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            activeSession = refreshed;
            valid = true;
        }
    }

    if (!valid) {
        saveSession(null);
        setMessage('Acceso denegado o sesión inválida.', 'error');
        setLocked(true);
        return;
    }

    saveSession(activeSession);
    scheduleTokenRefresh(activeSession);
    setLocked(false);
    setMessage('');

    // DIS-03: mostrar el correo real de la sesión en vez de un perfil
    // fijo ("Admin Store / Pro User") que no era la persona que usa la app.
    // El sidebar y el header solo necesitan un nombre corto, no el correo
    // completo -- se deriva de la parte antes de "@" (ej. "flujoxai" de
    // "flujoxai@gmail.com"). El correo completo sigue visible tal cual en
    // el modal de Perfil (#profile-email), donde sí es información útil.
    const email = activeSession.user?.email || '';
    const displayName = email.split('@')[0].replace(/^./, (c) => c.toUpperCase()) || email;
    document.getElementById('sidebar-user-email')?.replaceChildren(displayName);
    document.getElementById('header-user-email')?.replaceChildren(displayName);

    if (typeof window.startGestorApp === 'function') {
        await window.startGestorApp();
    }
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = String(document.getElementById('login-email').value || '').trim().toLowerCase();
    const password = String(document.getElementById('login-password').value || '');

    loginBtn.disabled = true;
    setMessage('Validando credenciales...', 'info');

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            setMessage(data.error || 'No se pudo iniciar sesión.', 'error');
            return;
        }

        await applySession(data);
    } catch (error) {
        setMessage(error?.message || 'No se pudo iniciar sesión.', 'error');
    } finally {
        loginBtn.disabled = false;
    }
});

async function logout() {
    saveSession(null);
    setLocked(true);
    window.location.reload();
}

loginLogoutBtn?.addEventListener('click', logout);
sidebarLogoutBtn?.addEventListener('click', logout);

(async () => {
    try {
        const rawSession = localStorage.getItem(SESSION_KEY);
        const session = rawSession ? JSON.parse(rawSession) : null;
        await applySession(session);
    } catch {
        saveSession(null);
        setLocked(true);
    }

    window.__GESTOR_AUTH_READY = true;
})();
