// tests/api.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessageToBackend } from '../api.js';

describe('API Streaming', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should parse SSE chunks correctly and call onChunk', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"content":"Hello "}\n\n'));
        controller.enqueue(encoder.encode('data: {"content":"world!"}\n\n'));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, body: stream });

    const onChunk = vi.fn();
    const result = await sendMessageToBackend('Hi', 'thread-1', 'token', onChunk);

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/chat', expect.any(Object));
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello ');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'world!');
    expect(result).toBe('Hello world!');
  });

  it('should throw an error if the backend returns an error in SSE', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"error":"Rate limit exceeded"}\n\n'));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, body: stream });

    await expect(
      sendMessageToBackend('Hi', 'thread-1', 'token', () => {})
    ).rejects.toThrow('Rate limit exceeded');
  });
});