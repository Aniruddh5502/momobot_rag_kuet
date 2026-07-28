// tests/setup.js
import { vi } from 'vitest';

// Mock the global Supabase client
globalThis.supabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: { id: '1', title: 'test' }, error: null }),
    delete: vi.fn().mockReturnThis(),
  })),
};

// Mock the global marked library
globalThis.marked = {
  parse: vi.fn((text) => `<p>${text}</p>`),
};

// Mock localStorage
const store = {};
globalThis.localStorage = {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, value) => { store[key] = value; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
};