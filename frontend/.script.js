// ---------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const signinPanel = document.getElementById('signin-panel');
const signinEmail = document.getElementById('signin-email');
const signinPassword = document.getElementById('signin-password');
const signinError = document.getElementById('signin-error');
const setPasswordPanel = document.getElementById('set-password-panel');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const setPasswordError = document.getElementById('set-password-error');
const userEmailEl = document.getElementById('user-email');
const userAvatarEl = document.getElementById('user-avatar');
const signOutBtn = document.getElementById('sign-out-btn');

const messagesContainer = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const sendIcon = document.getElementById('send-icon');
const stopIcon = document.getElementById('stop-icon');
const themeToggle = document.getElementById('theme-toggle');
const themeIconLight = document.getElementById('theme-icon-light');
const themeIconDark = document.getElementById('theme-icon-dark');
const newChatBtn = document.getElementById('new-chat-btn');
const sidebar = document.getElementById('sidebar');
const sidebarToggleDesktop = document.getElementById('sidebar-toggle-desktop');
const sidebarToggleMobile = document.getElementById('sidebar-toggle-mobile');
const sidebarScrim = document.getElementById('sidebar-scrim');
const chatHistoryEl = document.getElementById('chat-history');
const chatTitleEl = document.getElementById('chat-title');
const scrollBtn = document.getElementById('scroll-btn');

const WELCOME_TEXT = "Hello! I can answer questions using KUET's institutional documents. What would you like to know?";

let currentUser = null;
let sessions = [];              // [{id, title, updated_at}], newest first
let messagesCache = new Map();  // sessionId -> [{role, content}]
let activeSessionId = null;     // null = unsaved "new chat" not yet in the DB
let isStreaming = false;
let abortController = null;

// ---------------------------------------------------------------
// Auth: routing between sign-in / set-password / app
// ---------------------------------------------------------------
function isRecoveryOrInviteLink() {
    const hash = window.location.hash || '';
    return hash.includes('access_token') && (hash.includes('type=recovery') || hash.includes('type=invite'));
}

function showAuthPanel(panel) {
    signinPanel.hidden = panel !== 'signin';
    setPasswordPanel.hidden = panel !== 'set-password';
    authScreen.hidden = false;
    appContainer.hidden = true;
}

async function showApp() {
    authScreen.hidden = true;
    appContainer.hidden = false;

    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    userEmailEl.textContent = user?.email || '—';
    userAvatarEl.textContent = (user?.email || '?').charAt(0);

    await loadSessions();
    switchSession(null); // start on a fresh "new chat" view each load
    initTheme();
}

function resetLocalState() {
    currentUser = null;
    sessions = [];
    messagesCache = new Map();
    activeSessionId = null;
}

async function initAuth() {
    if (isRecoveryOrInviteLink()) {
        showAuthPanel('set-password');
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        await showApp();
    } else {
        showAuthPanel('signin');
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            showAuthPanel('set-password');
        } else if (event === 'SIGNED_OUT') {
            resetLocalState();
            showAuthPanel('signin');
        } else if (event === 'SIGNED_IN' && authScreen.hidden === false && setPasswordPanel.hidden) {
            // A sign-in happened while the sign-in panel was showing (not mid
            // password-setup flow) — move into the app.
            showApp();
        }
    });
}

signinPanel.addEventListener('submit', async (e) => {
    e.preventDefault();
    signinError.hidden = true;
    const submitBtn = document.getElementById('signin-submit');
    submitBtn.disabled = true;
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email: signinEmail.value.trim(),
            password: signinPassword.value,
        });
        if (error) throw error;
        signinPassword.value = '';
        await showApp();
    } catch (err) {
        signinError.textContent = err.message || 'Could not sign in. Check your email and password.';
        signinError.hidden = false;
    } finally {
        submitBtn.disabled = false;
    }
});

setPasswordPanel.addEventListener('submit', async (e) => {
    e.preventDefault();
    setPasswordError.hidden = true;

    if (newPasswordInput.value !== confirmPasswordInput.value) {
        setPasswordError.textContent = 'Passwords do not match.';
        setPasswordError.hidden = false;
        return;
    }
    if (newPasswordInput.value.length < 8) {
        setPasswordError.textContent = 'Password must be at least 8 characters.';
        setPasswordError.hidden = false;
        return;
    }

    const submitBtn = document.getElementById('set-password-submit');
    submitBtn.disabled = true;
    try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPasswordInput.value });
        if (error) throw error;
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        history.replaceState(null, '', window.location.pathname); // strip the token from the URL
        await showApp();
    } catch (err) {
        setPasswordError.textContent = err.message || 'Could not set your password. Try requesting a new invite link.';
        setPasswordError.hidden = false;
    } finally {
        submitBtn.disabled = false;
    }
});

signOutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    // onAuthStateChange's SIGNED_OUT handler takes care of resetting the UI
});

// ---------------------------------------------------------------
// Sessions & messages (Postgres via Supabase, RLS-scoped to the user)
// ---------------------------------------------------------------
async function loadSessions() {
    const { data, error } = await supabaseClient
        .from('chat_sessions')
        .select('id, title, updated_at')
        .order('updated_at', { ascending: false });

    sessions = error ? [] : data;
    renderSidebar();
}

async function fetchMessages(sessionId) {
    if (messagesCache.has(sessionId)) return messagesCache.get(sessionId);

    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

    const messages = error ? [] : data;
    messagesCache.set(sessionId, messages);
    return messages;
}

async function createRemoteSession(title) {
    const { data, error } = await supabaseClient
        .from('chat_sessions')
        .insert({ title })
        .select('id, title, updated_at')
        .single();
    if (error) throw error;
    messagesCache.set(data.id, []);
    sessions.unshift(data);
    return data;
}

async function insertRemoteMessage(sessionId, role, content) {
    const { error } = await supabaseClient
        .from('chat_messages')
        .insert({ session_id: sessionId, role, content });
    if (error) console.error('Failed to save message:', error.message);
}

async function deleteRemoteSession(id) {
    const { error } = await supabaseClient.from('chat_sessions').delete().eq('id', id);
    if (error) console.error('Failed to delete session:', error.message);
}

// ---------------------------------------------------------------
// Sidebar rendering
// ---------------------------------------------------------------
function renderSidebar() {
    chatHistoryEl.innerHTML = '';
    if (sessions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'chat-history-empty';
        empty.textContent = 'Your past chats will appear here.';
        chatHistoryEl.appendChild(empty);
        return;
    }
    for (const session of sessions) {
        const item = document.createElement('button');
        item.className = 'chat-history-item' + (session.id === activeSessionId ? ' active' : '');
        item.type = 'button';

        const label = document.createElement('span');
        label.textContent = session.title;
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        item.appendChild(label);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.type = 'button';
        delBtn.title = 'Delete chat';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9.5 7V4.5h5V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteRemoteSession(session.id);
            sessions = sessions.filter(s => s.id !== session.id);
            messagesCache.delete(session.id);
            if (activeSessionId === session.id) switchSession(null);
            renderSidebar();
        });
        item.appendChild(delBtn);

        item.addEventListener('click', () => switchSession(session.id));
        chatHistoryEl.appendChild(item);
    }
}

// ---------------------------------------------------------------
// Message bubble builders
// ---------------------------------------------------------------
function appendUserBubble(text) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `<div class="bubble"><div class="bubble-content"></div></div>`;
    msg.querySelector('.bubble-content').textContent = text; // textContent: never interpret user input as HTML
    messagesContainer.appendChild(msg);
    return msg;
}

function appendBotBubble(text) {
    const msg = document.createElement('div');
    msg.className = 'message bot';
    msg.innerHTML = `
        <div class="avatar avatar-bot" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 4.5h9l3.5 3.5v11.5H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12h6M9 15.3h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <div class="bubble">
            <div class="bubble-content"></div>
            <div class="bubble-meta">
                <button class="copy-btn" type="button" title="Copy response">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 16V5a1 1 0 0 1 1-1h11" stroke="currentColor" stroke-width="1.5"/></svg>
                    <span>Copy</span>
                </button>
            </div>
        </div>`;
    const contentEl = msg.querySelector('.bubble-content');
    // Backend responses are rendered as markdown; this app trusts its own backend's output.
    contentEl.innerHTML = text ? marked.parse(text) : '';

    const copyBtn = msg.querySelector('.copy-btn');
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(contentEl.textContent);
            const label = copyBtn.querySelector('span');
            const original = label.textContent;
            label.textContent = 'Copied';
            setTimeout(() => { label.textContent = original; }, 1500);
        } catch {
            // clipboard API may be unavailable — ignore silently
        }
    });

    messagesContainer.appendChild(msg);
    return msg;
}

function appendTypingIndicator() {
    const msg = document.createElement('div');
    msg.className = 'message bot';
    msg.innerHTML = `
        <div class="avatar avatar-bot" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 4.5h9l3.5 3.5v11.5H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12h6M9 15.3h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <div class="bubble">
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>`;
    messagesContainer.appendChild(msg);
    scrollToBottom();
    return msg;
}

// ---------------------------------------------------------------
// Scroll handling
// ---------------------------------------------------------------
function isNearBottom() {
    const threshold = 120;
    return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    scrollBtn.hidden = true;
}

messagesContainer.addEventListener('scroll', () => {
    scrollBtn.hidden = isNearBottom();
});

scrollBtn.addEventListener('click', scrollToBottom);

// ---------------------------------------------------------------
// Switching / starting sessions
// ---------------------------------------------------------------
async function switchSession(id) {
    activeSessionId = id;
    messagesContainer.innerHTML = '';

    if (id === null) {
        appendBotBubble(WELCOME_TEXT);
        chatTitleEl.textContent = 'New chat';
    } else {
        const session = sessions.find(s => s.id === id);
        chatTitleEl.textContent = session ? session.title : 'Chat';
        const messages = await fetchMessages(id);
        if (messages.length === 0) {
            appendBotBubble(WELCOME_TEXT);
        } else {
            for (const m of messages) {
                if (m.role === 'user') appendUserBubble(m.content);
                else appendBotBubble(m.content);
            }
        }
        scrollToBottom();
    }

    renderSidebar();
    closeMobileSidebar();
}

newChatBtn.addEventListener('click', () => {
    switchSession(null);
    userInput.focus();
});

// ---------------------------------------------------------------
// Sending messages
// ---------------------------------------------------------------
function setStreamingState(streaming) {
    isStreaming = streaming;
    sendIcon.hidden = streaming;
    stopIcon.hidden = !streaming;
    sendBtn.classList.toggle('stoppable', streaming);
    sendBtn.title = streaming ? 'Stop generating' : 'Send';
    userInput.disabled = streaming;
}

async function handleSend(e) {
    e.preventDefault();

    if (isStreaming) {
        abortController?.abort();
        return;
    }

    const text = userInput.value.trim();
    if (!text) return;

    // Materialize the session in the DB on first send, not on "New chat" click,
    // so browsing away from an empty draft doesn't leave clutter behind.
    if (activeSessionId === null) {
        const title = text.length > 42 ? text.slice(0, 42).trim() + '…' : text;
        try {
            const session = await createRemoteSession(title);
            activeSessionId = session.id;
            chatTitleEl.textContent = session.title;
            messagesContainer.innerHTML = ''; // clear the welcome-only bubble
        } catch (err) {
            appendBotBubble(`Couldn't start a new chat: ${err.message || 'unknown error'}`);
            return;
        }
    }

    const cachedMessages = messagesCache.get(activeSessionId) || [];
    cachedMessages.push({ role: 'user', content: text });
    messagesCache.set(activeSessionId, cachedMessages);

    appendUserBubble(text);
    renderSidebar();
    insertRemoteMessage(activeSessionId, 'user', text); // fire-and-forget

    userInput.value = '';
    autoResize();
    scrollToBottom();

    const typingEl = appendTypingIndicator();
    setStreamingState(true);
    abortController = new AbortController();

    let botMsgEl = null;
    let contentEl = null;
    let currentText = '';

    try {
        const { data: { session: authSession } } = await supabaseClient.auth.getSession();
        const accessToken = authSession?.access_token;

        const finalResponse = await sendMessageToBackend(
            text,
            activeSessionId,
            accessToken,
            (chunk) => {
                if (!botMsgEl) {
                    typingEl.remove();
                    botMsgEl = appendBotBubble('');
                    contentEl = botMsgEl.querySelector('.bubble-content');
                }
                currentText += chunk;
                contentEl.innerHTML = marked.parse(currentText);
                if (isNearBottom()) scrollToBottom();
            },
            abortController.signal
        );

        typingEl.remove();
        const finalText = currentText || finalResponse || '';
        if (finalText) {
            cachedMessages.push({ role: 'assistant', content: finalText });
            await insertRemoteMessage(activeSessionId, 'assistant', finalText);
        }
        if (!botMsgEl && finalText) {
            appendBotBubble(finalText);
        }
    } catch (err) {
        typingEl.remove();
        if (err.name === 'AbortError') {
            if (currentText) {
                cachedMessages.push({ role: 'assistant', content: currentText });
                await insertRemoteMessage(activeSessionId, 'assistant', currentText);
            }
        } else {
            const errMsg = document.createElement('div');
            errMsg.className = 'message bot error';
            errMsg.innerHTML = `
                <div class="avatar avatar-bot" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/></svg>
                </div>
                <div class="bubble"><div class="bubble-content"></div></div>`;
            errMsg.querySelector('.bubble-content').textContent = err.message || 'Something went wrong while contacting the server.';
            messagesContainer.appendChild(errMsg);
            scrollToBottom();
        }
    } finally {
        setStreamingState(false);
        abortController = null;
        userInput.focus();
    }
}

chatForm.addEventListener('submit', handleSend);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend(e);
    }
});

function autoResize() {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
}
userInput.addEventListener('input', autoResize);

// ---------------------------------------------------------------
// Sidebar toggle (desktop collapse / mobile drawer)
// ---------------------------------------------------------------
function closeMobileSidebar() {
    if (window.innerWidth <= 720) {
        sidebar.classList.add('collapsed');
        sidebarScrim.hidden = true;
    }
}

sidebarToggleDesktop.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});

sidebarToggleMobile.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    sidebarScrim.hidden = false;
});

sidebarScrim.addEventListener('click', closeMobileSidebar);

// ---------------------------------------------------------------
// Theme handling (persisted, respects system preference)
// ---------------------------------------------------------------
const THEME_KEY = 'rag-assistant-theme';

function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    themeIconLight.hidden = theme === 'dark';
    themeIconDark.hidden = theme !== 'dark';
}

function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) {
        applyTheme(stored);
        return;
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
}

themeToggle.addEventListener('click', () => {
    const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
initTheme(); // apply theme immediately so the auth screen isn't unstyled
if (window.innerWidth <= 720) {
    sidebar.classList.add('collapsed');
}
initAuth();