
import { API_BASE_URL } from "./config.js";

import { getNewSessionID } from "./sessions.js";

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatArgs(args) {
    if (!args || typeof args !== 'object') return String(args ?? '');
    return Object.entries(args)
        .map(([key, value]) => {
            const displayValue = (typeof value === 'object' && value !== null)
                ? JSON.stringify(value) // nested objects still need some structure
                : value;
            return `${key}: ${displayValue}`;
        })
        .join('\n');
}

export async function loadChatHistory() {
    let token;
    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }
    const currentThreadId = localStorage.getItem('current_thread_id');
    const messageContainer = document.querySelector('.messageContainer');
    const welcomeDiv = document.querySelector('.welcomeMessage');
    if(welcomeDiv) welcomeDiv.remove();

    if (!token || !currentThreadId) return;


    try {
        const userStr = localStorage.getItem('sb-user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        const scopedThreadId = `${user.id}::${currentThreadId}`;

        const response = await fetch(`${API_BASE_URL}/chat/messages/${scopedThreadId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) return;
            throw new Error('Failed to load chat history');
        }

        const messages = await response.json();
        const messagesContainer = document.querySelector('.messagesContainer');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        // Build a map of tool results by tool_call_id
        const resultMap = new Map();
        for (const msg of messages) {
            if (msg.role === 'tool') {
                resultMap.set(msg.tool_call_id, { content: msg.content, name: msg.name });
            }
        }

        // Process messages in order
        for (const msg of messages) {
            if (msg.role === 'user') {
                // Render user message
                const div = document.createElement('div');
                div.className = 'user';
                div.textContent = msg.content;
                messagesContainer.appendChild(div);
            }
            else if (msg.role === 'assistant') {
                // Create assistant container
                const assistantDiv = document.createElement('div');
                assistantDiv.className = 'assistant';

                // Render AI content (if any)
                if (msg.content) {
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'aiMessage';
                    contentDiv.innerHTML = marked.parse(msg.content);
                    // Apply syntax highlighting
                    contentDiv.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
                    assistantDiv.appendChild(contentDiv);
                }

                // Render tool calls if present
                if (msg.tool_calls && msg.tool_calls.length > 0) {
                    for (const tc of msg.tool_calls) {
                        const toolCallId = tc.id;
                        const toolName = tc.name;
                        const toolArgs = tc.args;
                        const resultData = resultMap.get(toolCallId);

                        // Create tool call container
                        const container = document.createElement('div');
                        container.className = 'tool-call-container';
                        container.dataset.toolCallId = toolCallId;

                        // Header
                        const header = document.createElement('div');
                        header.className = 'tool-call-header';

                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'tool-name';
                        nameSpan.textContent = tc.name;
                        header.appendChild(nameSpan);

                        const argsSpan = document.createElement('span');
                        argsSpan.className = 'tool-args';
                        argsSpan.innerHTML = `<pre class="tool-args">${escapeHtml(formatArgs(toolArgs))}</pre>`;
                        header.appendChild(argsSpan);

                        const statusSpan = document.createElement('span');
                        statusSpan.className = 'tool-status';
                        statusSpan.id = `status-${toolCallId}`;
                        if (resultData) {
                            statusSpan.textContent = 'Done';
                            statusSpan.classList.add('completed');
                        } else {
                            statusSpan.textContent = 'Pending';
                        }
                        header.appendChild(statusSpan);

                        const toggleBtn = document.createElement('button');
                        toggleBtn.className = 'toggle-result-btn';
                        toggleBtn.textContent = 'View Result';
                        toggleBtn.onclick = () => {
                            const resCont = container.querySelector('.tool-result-container');
                            if (resCont) {
                                const isExpanded = resCont.style.display === 'none';
                                resCont.style.display = isExpanded ? 'block' : 'none';
                                toggleBtn.textContent = isExpanded ? 'Hide Result' : 'View Result';
                            }
                        };
                        header.appendChild(toggleBtn);
                        container.appendChild(header);

                        // Result (if available)
                        if (resultData) {
                            const resultContainer = document.createElement('div');
                            resultContainer.className = 'tool-result-container';
                            resultContainer.style.display = 'none';

                            const resultHeader = document.createElement('div');
                            resultHeader.className = 'tool-result-header';
                            const resultLabel = document.createElement('span');
                            resultLabel.className = 'result-label';
                            resultLabel.textContent = 'Result:';
                            resultHeader.appendChild(resultLabel);
                            resultContainer.appendChild(resultHeader);

                            const resultContent = document.createElement('div');
                            resultContent.className = 'tool-result-content';
                            // Use the existing formatToolResult helper
                            resultContent.innerHTML = formatToolResult(resultData.content);
                            resultContainer.appendChild(resultContent);

                            container.appendChild(resultContainer);
                        }

                        assistantDiv.appendChild(container);
                    }
                }

                messagesContainer.appendChild(assistantDiv);
            }
            // tool messages are ignored because they are embedded via resultMap
        }

        messagesContainer.scrollTop = messagesContainer.scrollHeight;

    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

window.loadChatHistory = loadChatHistory;




// renderMessage function (you already have this)
async function renderMessage(role, content) {
    const messagesContainer = document.querySelector('.messagesContainer');
    const div = document.createElement('div');
    div.className = role === 'user' ? 'user' : 'assistant';

    if (role === 'assistant') {
        div.innerHTML = marked.parse(content);
        div.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    } else {
        div.textContent = content;
    }

    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatToolResult(result) {
    if (typeof result === 'string') {
        // Remove page number mentions like "(Page X)" or "(Page X-Y)" from the string
        const cleanedResult = result.replace(/\s*\(\s*Page\s+[\d-]+\s*\)/gi, '');

        // Check if it's JSON first
        try {
            const parsed = JSON.parse(cleanedResult);
            if (Array.isArray(parsed)) {
                return parsed.map(item => {
                    if (typeof item === 'object' && item !== null) {
                        let source = item.source || 'Unknown Source';
                        // Clean page numbers from source field
                        source = source.replace(/\s*\(\s*Page\s+[\d-]+\s*\)/gi, '');
                        const similarity = item.similarity !== undefined ? `Similarity: ${item.similarity}` : '';
                        const content = item.content || '';
                        return `<div class="tool-result-item">
                                    <div class="tool-result-source">
                                        <strong>Source:</strong> ${escapeHtml(source)} ${similarity ? `<span class="similarity-tag">${escapeHtml(similarity)}</span>` : ''}
                                    </div>
                                    <div class="result-content-body">${marked.parse(content)}</div>
                                </div>`;
                    }
                    return `<div class="result-text">${escapeHtml(JSON.stringify(item))}</div>`;
                }).join('<hr class="tool-result-divider">');
            }
            return `<pre class="result-json">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
        } catch {
            // If not JSON, check if it looks like the "Source: ... Similarity: ... Content: ..." pattern
            if (cleanedResult.includes('Source:') && cleanedResult.includes('Content:')) {
                const items = cleanedResult.split(/\n(?=Source:)/);
                return items.map(item => {
                    const sourceMatch = item.match(/Source:\s*(.*?)(?=\s*Similarity:|\s*Content:|$)/);
                    const simMatch = item.match(/Similarity:\s*([\d.]+)/);
                    const contentMatch = item.match(/Content:\s*(.*)/s);
                    
                    let source = sourceMatch ? sourceMatch[1] : 'Unknown';
                    // Clean page numbers from extracted source
                    source = source.replace(/\s*\(\s*Page\s+[\d-]+\s*\)/gi, '');
                    const sim = simMatch ? simMatch[1] : '';
                    const content = contentMatch ? contentMatch[1] : item;
                    
                    return `<div class="tool-result-item">
                                <div class="tool-result-source">
                                    <strong>Source:</strong> ${escapeHtml(source)} ${sim ? `<span class="similarity-tag">Similarity: ${escapeHtml(sim)}</span>` : ''}
                                </div>
                                <div class="result-content-body">${marked.parse(content)}</div>
                            </div>`;
                }).join('<hr class="tool-result-divider">');
            }
            return `<div class="result-text">${escapeHtml(cleanedResult)}</div>`;
        }
    } else if (typeof result === 'object' && result !== null) {
        if (Array.isArray(result)) {
            return result.map(item => {
                if (typeof item === 'object' && item !== null) {
                    let source = item.source || 'Unknown Source';
                    // Clean page numbers from source field
                    source = source.replace(/\s*\(\s*Page\s+[\d-]+\s*\)/gi, '');
                    const similarity = item.similarity !== undefined ? `Similarity: ${item.similarity}` : '';
                    const content = item.content || '';
                    return `<div class="tool-result-item">
                                <div class="tool-result-source">
                                    <strong>Source:</strong> ${escapeHtml(source)} ${similarity ? `<span class="similarity-tag">${escapeHtml(similarity)}</span>` : ''}
                                </div>
                                <div class="result-content-body">${marked.parse(content)}</div>
                            </div>`;
                }
                return `<div class="result-text">${escapeHtml(JSON.stringify(item))}</div>`;
            }).join('<hr class="tool-result-divider">');
        }
        return `<pre class="result-json">${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
    } else {
        return `<div class="result-text">${escapeHtml(String(result))}</div>`;
    }
}


async function sendMessage() {
    let currentThreadId = localStorage.getItem('current_thread_id') || 'default_session';
    const inputField = document.getElementById('inputMessage');
    const sendBtn = document.getElementById('sendMessage');
    const btnImg = sendBtn ? sendBtn.querySelector('img') : null;
    const messageText = inputField.value.trim();
    const messagesContainer = document.querySelector('.messagesContainer');
    const welcomeDiv = document.querySelector('.welcomeMessage');
    
    let token;
    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }


    // clear the welcome text if there are any
    if (welcomeDiv) welcomeDiv.remove();

    if (!messageText) return;

    if(!currentThreadId){
        getNewSessionID()
        if(!currentThreadId){
            console.log("Got current session id as there were none. ")
        }else{
            console.log("no session id/ current_thread_id present in localStorage")
        }
    }

    
    sendBtn.disabled = true;
    if (btnImg) btnImg.src = 'assets/imgs/streaming.svg';

    // Show user message
    await renderMessage('user', messageText);
    inputField.value = '';
    inputField.style.height = 'auto';

    // Create assistant message container
    const aiDiv = document.createElement('div');
    aiDiv.className = 'assistant';
    messagesContainer.appendChild(aiDiv);

    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                message: messageText,
                thread_id: currentThreadId
            })
        });

        if (!response.ok) throw new Error('Chat request failed');

        // get the response as a stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let currentType = null;
        let currentElement = null;
        let fullAiResponse = '';
        const pendingToolCalls = new Map();

        // keep reading until the stream is finished
        while (true) {
            // read one chunk from the stream
            const { value, done } = await reader.read();
            // if reading is done (True) then break
            if (done) break;

            // convert the chunk (bytes) to text and add to buffer
            buffer += decoder.decode(value, { stream: true });
            // split by double newlines (SSE format uses \n\n for new messages)
            let lines = buffer.split('\n\n');
            // keep the last incomplete line in the buffer for next iteration
            buffer = lines.pop();

            // process each complete line
            for (const line of lines) {
                // skip lines that don't start with 'data: '
                if (line.startsWith('data: ')) {
                    try {
                        // remove 'data: ' prefix and parse the json
                        const data = JSON.parse(line.slice(6));

                        // Track the current element we're building
                        // If the type changes, we'll close it and start a new one
                        if (!currentElement || currentType !== data.type) {
                            switch (data.type) {
                                case "ai":
                                    currentElement = document.createElement('div');
                                    currentElement.className = 'aiMessage';
                                    aiDiv.appendChild(currentElement);
                                    fullAiResponse = ''; // resetting for new AI block
                                    break;

                                case "tool_call": {
                                    const toolCallId = data.content.id;
                                    const toolName = data.content.name;
                                    const toolArgs = data.content.args;
                                    console.log(toolArgs);
                                    // Create tool call container
                                    currentElement = document.createElement('div');
                                    currentElement.className = 'tool-call-container';
                                    currentElement.dataset.toolCallId = toolCallId;

                                    // Build tool call HTML
                                    currentElement.innerHTML = `
                                        <div class="tool-call-header">
                                            <span class="tool-name">${escapeHtml(toolName)}</span>
                                            <span class="tool-args">
                                            ${toolArgs && Object.keys(toolArgs).length > 0
                                            ? `<pre class="tool-args">${escapeHtml(formatArgs(toolArgs))}</pre>`
                                            : ''}
                                            </span>
                                            <button class="toggle-result-btn">View Result</button>
                                            <span class="tool-status" id="status-${toolCallId}">Running...</span>
                                        </div>
                                        <div class="tool-result-container" id="result-${toolCallId}" style="display: none;"></div>
                                    `;

                                    aiDiv.appendChild(currentElement);

                                    const toggleBtn = currentElement.querySelector('.toggle-result-btn');
                                    toggleBtn.onclick = () => {
                                        const resCont = currentElement.querySelector('.tool-result-container');
                                        if (resCont) {
                                            const isExpanded = resCont.style.display === 'none';
                                            resCont.style.display = isExpanded ? 'block' : 'none';
                                            toggleBtn.textContent = isExpanded ? 'Hide Result' : 'View Result';
                                        }
                                    };

                                    pendingToolCalls.set(toolCallId, {
                                        element: currentElement,
                                        name: toolName
                                    });
                                    currentElement = null;
                                    break;
                                }

                                case "tool_result": {
                                    // tool results don't create new elements
                                    // they just update the existing tool call elements
                                    const resultToolCallId = data.content.tool_call_id;
                                    const resultToolName = data.content.name;
                                    const resultData = data.content.result;

                                    if (pendingToolCalls.has(resultToolCallId)) {
                                        const toolElement = pendingToolCalls.get(resultToolCallId).element;

                                        // Update status
                                        const statusEl = toolElement.querySelector('.tool-status');
                                        if (statusEl) {
                                            statusEl.innerHTML = 'Done';
                                            statusEl.className = 'tool-status completed';
                                        }

                                        // Update or create result display
                                        let resultContainer = toolElement.querySelector('.tool-result-container');
                                        if (!resultContainer) {
                                            resultContainer = document.createElement('div');
                                            resultContainer.className = 'tool-result-container';
                                            toolElement.appendChild(resultContainer);
                                        }

                                        // Show the result
                                        resultContainer.style.display = 'none';
                                        resultContainer.innerHTML = `
                                            <div class="tool-result-header">
                                                <span class="result-label">Result:</span>
                                            </div>
                                            <div class="tool-result-content">
                                                ${formatToolResult(resultData)}
                                            </div>
                                        `;

                                        const toggleBtn = toolElement.querySelector('.toggle-result-btn');
                                        if (toggleBtn) {
                                            toggleBtn.textContent = 'View Result';
                                            toggleBtn.onclick = () => {
                                                const resCont = toolElement.querySelector('.tool-result-container');
                                                if (resCont) {
                                                    const isExpanded = resCont.style.display === 'none';
                                                    resCont.style.display = isExpanded ? 'block' : 'none';
                                                    toggleBtn.textContent = isExpanded ? 'Hide Result' : 'View Result';
                                                }
                                            };
                                        }

                                        pendingToolCalls.delete(resultToolCallId);
                                    }

                                    // set current element to null since tool_result doesn't have a container
                                    currentElement = null;
                                    break;
                                }

                                case "error":
                                    currentElement = document.createElement('div');
                                    currentElement.className = 'errorMessage';
                                    currentElement.textContent = data.content;
                                    aiDiv.appendChild(currentElement);
                                    break;
                            }
                            currentType = data.type;
                        }

                        // if we have a current element, update it with new content
                        if (currentElement && data.type === 'ai') {
                            fullAiResponse += data.content;
                            currentElement.innerHTML = marked.parse(fullAiResponse);
                            // Apply syntax highlighting to code blocks
                            currentElement.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
                        }

                        // scroll to bottom
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    } catch (e) {
                        console.error('Error parsing stream chunk', e);
                    }
                }
            }
        }

        // Mark any pending tool calls as timed out
        if (pendingToolCalls.size > 0) {
            for (const [id, info] of pendingToolCalls) {
                const statusEl = info.element.querySelector('.tool-status');
                if (statusEl) {
                    statusEl.innerHTML = '⚠️ Timeout';
                    statusEl.className = 'tool-status timeout';
                }
            }
        }
    } catch (error) {
        aiDiv.innerHTML = 'Sorry, something went wrong. Please try again.';
        console.error('Chat error:', error);
    } finally {
        sendBtn.disabled = false;
        if (btnImg) btnImg.src = 'assets/imgs/send.svg';
    }
}




export { sendMessage };