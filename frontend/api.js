const API_BASE_URL = 'http://localhost:8000';

export async function sendMessageToBackend(message, threadId, accessToken, onEvent, signal) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({ message, thread_id: threadId }),
            signal,
        });
    } catch (networkErr) {
        if (networkErr.name === 'AbortError') throw networkErr;
        throw new Error('Could not reach the server. Check that the backend is running.');
    }

    if (!response.ok) {
        throw new Error(`Server responded with an error (status ${response.status}).`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const event of events) {
            const line = event.trim();
            if (!line.startsWith('data:')) continue;
            
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;

            let data;
            try {
                data = JSON.parse(payload);
            } catch {
                continue;
            }

            // data can have type: 'ai', 'tool', or 'error'
            onEvent(data);
        }
    }
}