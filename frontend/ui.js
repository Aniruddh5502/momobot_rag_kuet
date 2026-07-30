// ui.js - UI rendering (sidebar, message bubbles, scroll)
import { dom, state, WELCOME_TEXT } from './state.js';
import { deleteRemoteSession } from './sessions.js';
import { switchSession, closeMobileSidebar } from './chat.js';

let SNIPPET_LENGTH = 10;

export function renderSidebar() {
    dom.chatHistoryEl.innerHTML = '';
    if (state.sessions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'chat-history-empty';
        empty.textContent = 'Your past chats will appear here.';
        dom.chatHistoryEl.appendChild(empty);jhk
        return;
    }
    for (const session of state.sessions) {
        const item = document.createElement('button');
        item.className = 'chat-history-item' + (session.id === state.activeSessionId ? ' active' : '');
        item.type = 'button';
        const label = document.createElement('span');
        label.textContent = session.title;
        label.style.overflow = 'hidden'; label.style.textOverflow = 'ellipsis';
        item.appendChild(label);
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn'; delBtn.type = 'button'; delBtn.title = 'Delete chat';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9.5 7V4.5h5V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteRemoteSession(session.id);
            state.sessions = state.sessions.filter(s => s.id !== session.id);
            state.messagesCache.delete(session.id);
            if (state.activeSessionId === session.id) switchSession(null);
            renderSidebar();
        });
        item.appendChild(delBtn);
        item.addEventListener('click', () => switchSession(session.id));
        dom.chatHistoryEl.appendChild(item);
    }
}

export function appendUserBubble(text) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `<div class="bubble"><div class="bubble-content"></div></div>`;
    msg.querySelector('.bubble-content').textContent = text;
    dom.messagesContainer.appendChild(msg);
    return msg;
}

export function appendBotBubble(text) {
    const msg = document.createElement('div');
    msg.className = 'message bot';
    msg.innerHTML = `<div class="avatar avatar-bot" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 4.5h9l3.5 3.5v11.5H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12h6M9 15.3h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div><div class="bubble"><div class="bubble-content"></div><div class="bubble-meta"><button class="copy-btn" type="button" title="Copy response"><svg viewBox="0 0 24 24" width="12" height="12" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 16V5a1 1 0 0 1 1-1h11" stroke="currentColor" stroke-width="1.5"/></svg><span>Copy</span></button></div></div>`;
    const contentEl = msg.querySelector('.bubble-content');
    contentEl.innerHTML = text ? marked.parse(text) : '';
    msg.querySelector('.copy-btn').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(contentEl.textContent);
            const label = msg.querySelector('.copy-btn span');
            const original = label.textContent;
            label.textContent = 'Copied';
            setTimeout(() => { label.textContent = original; }, 1500);
        } catch {}
    });
    dom.messagesContainer.appendChild(msg);
    return msg;
}

export function appendTypingIndicator() {
    const msg = document.createElement('div');
    msg.className = 'message bot';
    msg.innerHTML = `<div class="avatar avatar-bot" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 4.5h9l3.5 3.5v11.5H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 12h6M9 15.3h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div><div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    dom.messagesContainer.appendChild(msg);
    scrollToBottom();
    return msg;
}

export function scrollToBottom() {
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
    dom.scrollBtn.hidden = true;
}

export function appendSourcesToBot(botMsgElement, sources) {
    if (!botMsgElement || !sources || sources.length === 0) return;

    const bubble = botMsgElement.querySelector('.bubble');
    if (!bubble) return;

    const oldSources = bubble.querySelector('.sources-section');
    if (oldSources) oldSources.remove();

    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'sources-section';

    const heading = document.createElement('div');
    heading.className = 'sources-heading';
    heading.textContent = '📚 Sources';
    sourcesDiv.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'sources-list';

    sources.forEach((src, idx) => {
        const index = idx + 1;
        const li = document.createElement('li');
        li.className = 'source-item';

        // Citation number
        const citation = document.createElement('span');
        citation.className = 'source-citation';
        citation.textContent = `[${index}]`;
        li.appendChild(citation);

        // File name
        const file = document.createElement('span');
        file.className = 'source-file';
        file.textContent = src.file_name || 'Unknown file';
        li.appendChild(file);

        // Snippet container with full content
        const snippetContainer = document.createElement('div');
        snippetContainer.className = 'source-snippet-container';

        const snippet = document.createElement('div');
        snippet.className = 'source-snippet';
        const fullContent = src.content || '';
        const truncated = fullContent.length > SNIPPET_LENGTH ? fullContent.slice(0, SNIPPET_LENGTH) + '…' : fullContent;
        snippet.textContent = truncated;
        snippet.dataset.full = fullContent;
        snippet.dataset.truncated = truncated;
        snippet.dataset.expanded = 'false';

        // Toggle button (only show if content is longer than 150 chars)
        if (fullContent.length > SNIPPET_LENGTH) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'source-toggle-btn';
            toggleBtn.textContent = 'Show more';
            toggleBtn.type = 'button';

            toggleBtn.addEventListener('click', () => {
                const isExpanded = snippet.dataset.expanded === 'true';
                if (isExpanded) {
                    snippet.textContent = truncated;
                    toggleBtn.textContent = 'Show more';
                    snippet.dataset.expanded = 'false';
                } else {
                    snippet.textContent = fullContent;
                    toggleBtn.textContent = 'Show less';
                    snippet.dataset.expanded = 'true';
                }
            });

            snippetContainer.appendChild(snippet);
            snippetContainer.appendChild(toggleBtn);
        } else {
            snippetContainer.appendChild(snippet);
        }

        li.appendChild(snippetContainer);
        list.appendChild(li);
    });

    sourcesDiv.appendChild(list);
    bubble.appendChild(sourcesDiv);
}