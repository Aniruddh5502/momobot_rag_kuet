
// chat.js - Chat logic (sending, streaming, switching)
import { dom, state, WELCOME_TEXT } from './state.js';
import { fetchMessages, createRemoteSession, insertRemoteMessage } from './sessions.js';
import { appendUserBubble, appendBotBubble, appendTypingIndicator, renderSidebar, scrollToBottom, appendSourcesToBot, createToolCallBlock, updateToolCallBlock } from './ui.js';
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
        renderSidebar();
        closeMobileSidebar();
        return;
    }

    const session = state.sessions.find(s => s.id === id);
    dom.chatTitleEl.textContent = session ? session.title : 'Chat';

    // Get messages (from cache or DB)
    const messages = await fetchMessages(id);
    if (messages.length === 0) {
        appendBotBubble(WELCOME_TEXT);
    } else {
        // Render messages, pairing assistant with sources
        let i = 0;
        while (i < messages.length) {
            const m = messages[i];
            if (m.role === 'user') {
                appendUserBubble(m.content);
                i++;
            } else if (m.role === 'assistant') {
                const botMsg = appendBotBubble(m.content);
                // Check if next message is sources for this assistant
                const next = messages[i + 1];
                if (next && next.role === 'sources') {
                    try {
                        const sources = JSON.parse(next.content);
                        appendSourcesToBot(botMsg, sources);
                        i += 2; // skip both assistant and sources
                    } catch (e) {
                        console.warn('Failed to parse sources', e);
                        i++; // skip only assistant
                    }
                } else {
                    i++;
                }
            } else {
                // Skip any other roles (e.g., orphaned sources)
                i++;
            }
        }
    }

    scrollToBottom();
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
    dom.sendBtn.classList.toggle('stoppable', streaming);
    dom.sendBtn.title = streaming ? 'Stop generating' : 'Send';
    dom.userInput.disabled = streaming;
}





export async function handleSend(e) {
    e.preventDefault();
    if (state.isStreaming) { state.abortController?.abort(); return; }
    const text = dom.userInput.value.trim();
    if (!text) return;

    // Ensure a session exists
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

    const sessionId = state.activeSessionId;
    const cached = state.messagesCache.get(sessionId) || [];
    cached.push({ role: 'user', content: text });
    state.messagesCache.set(sessionId, cached);
    appendUserBubble(text);
    renderSidebar();
    insertRemoteMessage(sessionId, 'user', text);
    dom.userInput.value = '';
    autoResize();
    scrollToBottom();

    const typingEl = appendTypingIndicator();
    setStreamingState(true);
    state.abortController = new AbortController();

    let botMsgEl = null;
    let contentEl = null;
    let currentText = '';
    let toolResult = null;
    const toolBlocks = new Map();   // track tool call blocks by id

    const onEvent = (eventData) => {
        if (eventData.type === 'ai') {
            if (!botMsgEl) {
                typingEl.remove();
                botMsgEl = appendBotBubble('');
                contentEl = botMsgEl.querySelector('.bubble-content');
            }
            currentText += eventData.content;
            contentEl.innerHTML = marked.parse(currentText);
            // Auto‑scroll only if already near bottom
            if (isNearBottom()) scrollToBottom();
        }
        else if (eventData.type === 'tool_call') {
            const block = createToolCallBlock(eventData.content);
            toolBlocks.set(eventData.content.id, block);
            dom.messagesContainer.appendChild(block);
            if (isNearBottom()) scrollToBottom();
        }
        else if (eventData.type === 'tool_result') {
            const block = toolBlocks.get(eventData.content.tool_call_id);
            if (block) {
                updateToolCallBlock(block, eventData.content);
                if (isNearBottom()) scrollToBottom();
            }
            try {
                const resultStr = eventData.content.result;
                toolResult = JSON.parse(resultStr);
                console.log(`[TOOL] Retrieved ${toolResult.length} sources.`);
            } catch (e) {
                console.warn('Failed to parse tool result', e);
            }
        }
        else if (eventData.type === 'error') {
            typingEl.remove();
            const errMsg = document.createElement('div');
            errMsg.className = 'message bot error';
            errMsg.innerHTML = `<div class="avatar avatar-bot" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/></svg></div><div class="bubble"><div class="bubble-content"></div></div>`;
            errMsg.querySelector('.bubble-content').textContent = eventData.content || 'Something went wrong.';
            dom.messagesContainer.appendChild(errMsg);
            if (isNearBottom()) scrollToBottom();
        }
    };

    try {
        const { data: { session: authSession } } = await supabaseClient.auth.getSession();
        await sendMessageToBackend(
            text,
            sessionId,
            authSession?.access_token,
            onEvent,
            state.abortController.signal
        );

        typingEl.remove();
        const finalText = currentText || '';

        // Save assistant message
        if (finalText) {
            cached.push({ role: 'assistant', content: finalText });
            await insertRemoteMessage(sessionId, 'assistant', finalText);
        }

        // Save sources as a separate message with role 'sources'
        if (toolResult && toolResult.length > 0) {
            const sourcesJson = JSON.stringify(toolResult);
            cached.push({ role: 'sources', content: sourcesJson });
            await insertRemoteMessage(sessionId, 'sources', sourcesJson);
        }

        // If we never created a bot message, append final text
        if (!botMsgEl && finalText) {
            appendBotBubble(finalText);
        }

        // Attach sources to the existing bot bubble (if any)
        if (toolResult && botMsgEl) {
            appendSourcesToBot(botMsgEl, toolResult);
            // Update button state after sources are rendered
            if (isNearBottom()) scrollToBottom();
        }

    } catch (err) {
        typingEl.remove();
        if (err.name === 'AbortError' && currentText) {
            cached.push({ role: 'assistant', content: currentText });
            await insertRemoteMessage(sessionId, 'assistant', currentText);
        } else if (err.name !== 'AbortError') {
            const errMsg = document.createElement('div');
            errMsg.className = 'message bot error';
            errMsg.innerHTML = `<div class="avatar avatar-bot" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.5"/></svg></div><div class="bubble"><div class="bubble-content"></div></div>`;
            errMsg.querySelector('.bubble-content').textContent = err.message || 'Something went wrong.';
            dom.messagesContainer.appendChild(errMsg);
            if (isNearBottom()) scrollToBottom();
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




