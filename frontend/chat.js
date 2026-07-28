// chat.js - Chat logic (sending, streaming, switching)
import { dom, state, WELCOME_TEXT } from './state.js';
import { fetchMessages, createRemoteSession, insertRemoteMessage } from './sessions.js';
import { appendUserBubble, appendBotBubble, appendTypingIndicator, renderSidebar, scrollToBottom } from './ui.js';
import { sendMessageToBackend } from './api.js';

export function isNearBottom() {
    return dom.messagesContainer.scrollHeight - dom.messagesContainer.scrollTop - dom.messagesContainer.clientHeight < 120;
}

export async function switchSession(id) {
    state.activeSessionId = id;
    dom.messagesContainer.innerHTML = '';
    if (id === null) {
        appendBotBubble(WELCOME_TEXT);
        dom.chatTitleEl.textContent = 'New chat';
    } else {
        const session = state.sessions.find(s => s.id === id);
        dom.chatTitleEl.textContent = session ? session.title : 'Chat';
        const messages = await fetchMessages(id);
        if (messages.length === 0) appendBotBubble(WELCOME_TEXT);
        else for (const m of messages) {
            if (m.role === 'user') appendUserBubble(m.content);
            else appendBotBubble(m.content);
        }
        scrollToBottom();
    }
    renderSidebar();
    closeMobileSidebar();
}

export function closeMobileSidebar() {
    if (window.innerWidth <= 720) {
        dom.sidebar.classList.add('collapsed');
        dom.sidebarScrim.hidden = true;
    }
}

function setStreamingState(streaming) {
    state.isStreaming = streaming;
    dom.sendIcon.hidden = streaming;
    dom.stopIcon.hidden = !streaming;
    dom.sendBtn.classList.toggle('stoppable', streaming);
    dom.sendBtn.title = streaming ? 'Stop generating' : 'Send';
    dom.userInput.disabled = streaming;
}

export async function handleSend(e) {
    e.preventDefault();
    if (state.isStreaming) { state.abortController?.abort(); return; }
    const text = dom.userInput.value.trim();
    if (!text) return;

    if (state.activeSessionId === null) {
        const title = text.length > 42 ? text.slice(0, 42).trim() + '…' : text;
        try {
            const session = await createRemoteSession(title);
            state.activeSessionId = session.id;
            dom.chatTitleEl.textContent = session.title;
            dom.messagesContainer.innerHTML = '';
        } catch (err) {
            appendBotBubble(`Couldn't start a new chat: ${err.message}`);
            return;
        }
    }

    const cached = state.messagesCache.get(state.activeSessionId) || [];
    cached.push({ role: 'user', content: text });
    state.messagesCache.set(state.activeSessionId, cached);
    appendUserBubble(text);
    renderSidebar();
    insertRemoteMessage(state.activeSessionId, 'user', text);
    dom.userInput.value = ''; autoResize(); scrollToBottom();

    const typingEl = appendTypingIndicator();
    setStreamingState(true);
    state.abortController = new AbortController();
    let botMsgEl = null, contentEl = null, currentText = '';

    try {
        const { data: { session: authSession } } = await supabaseClient.auth.getSession();
        const finalResponse = await sendMessageToBackend(
            text, state.activeSessionId, authSession?.access_token,
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
            state.abortController.signal
        );
        typingEl.remove();
        const finalText = currentText || finalResponse || '';
        if (finalText) {
            cached.push({ role: 'assistant', content: finalText });
            await insertRemoteMessage(state.activeSessionId, 'assistant', finalText);
        }
        if (!botMsgEl && finalText) appendBotBubble(finalText);
    } catch (err) {
        typingEl.remove();
        if (err.name === 'AbortError' && currentText) {
            cached.push({ role: 'assistant', content: currentText });
            await insertRemoteMessage(state.activeSessionId, 'assistant', currentText);
        } else if (err.name !== 'AbortError') {
            const errMsg = document.createElement('div');
            errMsg.className = 'message bot error';
            errMsg.innerHTML = `<div class="avatar avatar-bot" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/></svg></div><div class="bubble"><div class="bubble-content"></div></div>`;
            errMsg.querySelector('.bubble-content').textContent = err.message || 'Something went wrong.';
            dom.messagesContainer.appendChild(errMsg);
            scrollToBottom();
        }
    } finally {
        setStreamingState(false);
        state.abortController = null;
        dom.userInput.focus();
    }
}

function autoResize() {
    dom.userInput.style.height = 'auto';
    dom.userInput.style.height = Math.min(dom.userInput.scrollHeight, 160) + 'px';
}
export { autoResize };