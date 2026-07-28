// auth.js - Authentication logic
import { dom, state } from './state.js';
import { loadSessions } from './sessions.js';
import { switchSession } from './chat.js';
import { initTheme } from './theme.js';

function isRecoveryOrInviteLink() {
    const hash = window.location.hash || '';
    return hash.includes('access_token') && (hash.includes('type=recovery') || hash.includes('type=invite'));
}

export function showAuthPanel(panel) {
    dom.signinPanel.hidden = panel !== 'signin';
    dom.signupPanel.hidden = panel !== 'signup';
    dom.setPasswordPanel.hidden = panel !== 'set-password';
    dom.authScreen.hidden = false;
    dom.appContainer.hidden = true;
}


/*
async function showApp() {
    dom.authScreen.hidden = true;
    dom.appContainer.hidden = false;
    const { data: { user } } = await supabaseClient.auth.getUser();
    state.currentUser = user;
    dom.userEmailEl.textContent = user?.email || '—';
    dom.userAvatarEl.textContent = (user?.email || '?').charAt(0);
    await loadSessions();
    switchSession(null);
    initTheme();
}
*/


function resetLocalState() {
    state.currentUser = null;
    state.sessions = [];
    state.messagesCache.clear();
    state.activeSessionId = null;
}


/*
export async function initAuth() {
    if (isRecoveryOrInviteLink()) return showAuthPanel('set-password');
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) await showApp();
    else showAuthPanel('signin');

    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') showAuthPanel('set-password');
        else if (event === 'SIGNED_OUT') { resetLocalState(); showAuthPanel('signin'); }
        else if (event === 'SIGNED_IN' && !dom.authScreen.hidden && dom.setPasswordPanel.hidden) showApp();
    });
}


export async function handleSignIn(e) {
    e.preventDefault();
    dom.signinError.hidden = true;
    const submitBtn = document.getElementById('signin-submit');
    submitBtn.disabled = true;
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: dom.signinEmail.value.trim(), password: dom.signinPassword.value
        });
        if (error) throw error;
        dom.signinPassword.value = '';
        await showApp();
    } catch (err) {
        dom.signinError.textContent = err.message || 'Could not sign in.';
        dom.signinError.hidden = false;
    } finally { submitBtn.disabled = false; }
}
*/



async function showApp() {
    console.log('[auth] showApp() called');
    dom.authScreen.hidden = true;
    dom.appContainer.hidden = false;
    console.log('[auth] hidden flags ->', 'authScreen:', dom.authScreen.hidden, 'appContainer:', dom.appContainer.hidden);
    console.log('[auth] computed display ->', 'authScreen:', getComputedStyle(dom.authScreen).display, 'appContainer:', getComputedStyle(dom.appContainer).display);
    const { data: { user }, error: getUserError } = await supabaseClient.auth.getUser();
    console.log('[auth] getUser() ->', user, 'error:', getUserError);
    state.currentUser = user;
    dom.userEmailEl.textContent = user?.email || '—';
    dom.userAvatarEl.textContent = (user?.email || '?').charAt(0);
    await loadSessions();
    switchSession(null);
    initTheme();
    console.log('[auth] showApp() finished');
}

export async function initAuth() {
    console.log('[auth] initAuth() called');
    if (isRecoveryOrInviteLink()) { console.log('[auth] recovery/invite link detected'); return showAuthPanel('set-password'); }
    const { data: { session } } = await supabaseClient.auth.getSession();
    console.log('[auth] initAuth getSession ->', session);
    if (session) await showApp();
    else showAuthPanel('signin');

    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('[auth] onAuthStateChange event:', event, 'session:', session);
        if (event === 'PASSWORD_RECOVERY') showAuthPanel('set-password');
        else if (event === 'SIGNED_OUT') { resetLocalState(); showAuthPanel('signin'); }
        else if (event === 'SIGNED_IN' && !dom.authScreen.hidden && dom.setPasswordPanel.hidden) {
            console.log('[auth] onAuthStateChange calling showApp()');
            showApp();
        }
    });
}



export async function handleSignIn(e) {
    console.log('[auth] supabaseClient from window:', window.supabaseClient);
    console.log('[auth] email:', dom.signinEmail.value.trim());
    e.preventDefault();
    console.log('[auth] handleSignIn fired');
    dom.signinError.hidden = true;
    const submitBtn = document.getElementById('signin-submit');
    submitBtn.disabled = true;
    try {
        const { error, data } = await supabaseClient.auth.signInWithPassword({
            email: dom.signinEmail.value.trim(), password: dom.signinPassword.value
        });
        console.log('[auth] signInWithPassword result -> data:', data, 'error:', error);
        if (error) throw error;
        dom.signinPassword.value = '';
        console.log('[auth] calling showApp() from handleSignIn');
        await showApp();
        console.log('[auth] showApp() returned in handleSignIn');
    } catch (err) {
        console.error('[auth] handleSignIn caught error:', err);
        dom.signinError.textContent = err.message || 'Could not sign in.';
        dom.signinError.hidden = false;
    } finally { submitBtn.disabled = false; }
}

export async function handleSignUp(e) {
    e.preventDefault();
    dom.signupError.hidden = true;
    const submitBtn = document.getElementById('signup-submit');
    submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: dom.signupEmail.value.trim(),
                password: dom.signupPassword.value
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Signup failed');

        alert('Account created! Please check your email to verify your account before signing in.');
        showAuthPanel('signin');
    } catch (err) {
        console.error('[auth] handleSignUp caught error:', err);
        dom.signupError.textContent = err.message || 'An error occurred during signup.';
        dom.signupError.hidden = false;
    } finally {
        submitBtn.disabled = false;
    }
}

export async function handleSetPassword(e) {
    e.preventDefault();
    dom.setPasswordError.hidden = true;
    if (dom.newPasswordInput.value !== dom.confirmPasswordInput.value) {
        dom.setPasswordError.textContent = 'Passwords do not match.';
        return dom.setPasswordError.hidden = false;
    }
    if (dom.newPasswordInput.value.length < 8) {
        dom.setPasswordError.textContent = 'Password must be at least 8 characters.';
        return dom.setPasswordError.hidden = false;
    }
    const submitBtn = document.getElementById('set-password-submit');
    submitBtn.disabled = true;
    try {
        const { error } = await supabaseClient.auth.updateUser({ password: dom.newPasswordInput.value });
        if (error) throw error;
        dom.newPasswordInput.value = ''; dom.confirmPasswordInput.value = '';
        history.replaceState(null, '', window.location.pathname);
        await showApp();
    } catch (err) {
        dom.setPasswordError.textContent = err.message || 'Could not set password.';
        dom.setPasswordError.hidden = false;
    } finally { submitBtn.disabled = false; }
}