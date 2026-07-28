-- =================================================================
-- KUET RAG Assistant — Supabase Schema
-- Run this ONCE in: Supabase Dashboard > SQL Editor > New Query
-- =================================================================

-- 1. Enable pgvector for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- =================================================================
-- 2. PROFILES (extends Supabase Auth)
-- =================================================================
CREATE TABLE public.profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','faculty','admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================================================================
-- 3. CHAT SESSIONS
-- =================================================================
CREATE TABLE public.chat_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL DEFAULT 'New chat',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user_updated ON public.chat_sessions(user_id, updated_at DESC);

-- =================================================================
-- 4. CHAT MESSAGES
-- =================================================================
CREATE TABLE public.chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_session_created ON public.chat_messages(session_id, created_at);

-- =================================================================
-- 5. KNOWLEDGE BASE (RAG documents + embeddings)
-- Dimension 1536 = OpenAI text-embedding-3-small. Change if you use
-- a different model (e.g., 768 for nomic-embed-text via Ollama).
-- =================================================================
CREATE TABLE public.knowledge_base (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    embedding  vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for fast cosine similarity search (critical for 1000+ users)
CREATE INDEX idx_kb_embedding ON public.knowledge_base
    USING hnsw (embedding vector_cosine_ops);

-- =================================================================
-- 6. ROW LEVEL SECURITY
-- =================================================================
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base  ENABLE ROW LEVEL SECURITY;

-- PROFILES: users see only their own row; admins see all
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ));
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- SESSIONS: users can only touch their own sessions
CREATE POLICY "sessions_all_own" ON public.chat_sessions
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- MESSAGES: users can only touch messages in their own sessions
CREATE POLICY "messages_select_own" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.chat_sessions s
                WHERE s.id = session_id AND s.user_id = auth.uid())
    );
CREATE POLICY "messages_insert_own" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.chat_sessions s
                WHERE s.id = session_id AND s.user_id = auth.uid())
    );
CREATE POLICY "messages_delete_own" ON public.chat_messages
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.chat_sessions s
                WHERE s.id = session_id AND s.user_id = auth.uid())
    );

-- KNOWLEDGE BASE: anyone authenticated can read; only admins can write
CREATE POLICY "kb_select_authenticated" ON public.knowledge_base
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "kb_insert_admin" ON public.knowledge_base
    FOR INSERT WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ));
CREATE POLICY "kb_delete_admin" ON public.knowledge_base
    FOR DELETE USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ));