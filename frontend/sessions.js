// sessions.js
import { state } from './state.js';
import { renderSidebar } from './ui.js';

export async function loadSessions() {
  const userId = state.currentUser?.id;
  if (!userId) return;

  const { data, error } = await supabaseClient
    .from('chat_sessions')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  state.sessions = error ? [] : data;
  renderSidebar();
}

export async function fetchMessages(sessionId) {
  if (state.messagesCache.has(sessionId)) {
    return state.messagesCache.get(sessionId);
  }

  const { data, error } = await supabaseClient
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  const messages = error ? [] : data;
  state.messagesCache.set(sessionId, messages);
  return messages;
}

export async function createRemoteSession(title) {
  const userId = state.currentUser?.id;
  if (!userId) throw new Error('User not authenticated');

  const { data, error } = await supabaseClient
    .from('chat_sessions')
    .insert({ title, user_id: userId })
    .select('id, title, updated_at')
    .single();

  if (error) throw error;
  
  state.messagesCache.set(data.id, []);
  state.sessions.unshift(data);
  return data;
}

export async function insertRemoteMessage(sessionId, role, content) {
  const { error } = await supabaseClient
    .from('chat_messages')
    .insert({ session_id: sessionId, role, content });

  if (error) console.error('Failed to save message:', error.message);
}

export async function deleteRemoteSession(id) {
  const { error } = await supabaseClient
    .from('chat_sessions')
    .delete()
    .eq('id', id);

  if (error) console.error('Failed to delete session:', error.message);
}