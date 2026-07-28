// tests/sessions.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from '../state.js';
import { loadSessions, createRemoteSession } from '../sessions.js';

vi.mock('../ui.js', () => ({ renderSidebar: vi.fn() }));

describe('sessions.js', () => {
  let mockFrom;

  beforeEach(() => {
    vi.clearAllMocks();
    state.currentUser = { id: 'user-123' };
    state.sessions = [];
    state.messagesCache.clear();

    mockFrom = vi.fn();
    global.supabaseClient = { from: mockFrom };
  });

  it('createRemoteSession passes user_id', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { id: 's1', title: 'Test', updated_at: 'now' }, 
      error: null 
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    
    mockFrom.mockReturnValue({ insert: mockInsert });

    await createRemoteSession('Test');

    expect(mockFrom).toHaveBeenCalledWith('chat_sessions');
    expect(mockInsert).toHaveBeenCalledWith({ title: 'Test', user_id: 'user-123' });
  });

  it('loadSessions filters by user_id', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    
    mockFrom.mockReturnValue({ select: mockSelect });

    await loadSessions();

    expect(mockFrom).toHaveBeenCalledWith('chat_sessions');
    expect(mockSelect).toHaveBeenCalledWith('id, title, updated_at');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
  });
});