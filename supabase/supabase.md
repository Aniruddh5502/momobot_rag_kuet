# Wiring up Supabase

## 1. Create the project & schema
1. Create a project at supabase.com.
2. Dashboard → SQL Editor → paste and run `supabase/schema.sql`.

## 2. Lock down sign-up (invite-only)
Dashboard → Authentication → Sign In / Providers → Email → turn **off**
"Allow new users to sign up". Without this, someone could still hit
Supabase's auth API directly and self-register even though the frontend
has no sign-up form.

## 3. Set your redirect URL
Dashboard → Authentication → URL Configuration:
- **Site URL**: wherever the frontend is deployed (e.g. `https://rag.your-vps.com`, or `http://localhost:PORT` for local dev).
- **Redirect URLs**: add the same URL. This is where invite/reset emails send people back to.

Invite links land back on your app with `#access_token=...&type=invite` in
the URL — `script.js` already detects this and shows the "set your
password" screen.

## 4. Collect your keys
Dashboard → Project Settings → API:
- `Project URL` and `anon public` key → paste into `config.js`.
- `JWT Secret` (under JWT Settings) → set as `SUPABASE_JWT_SECRET` in the backend environment. This is **not** the anon key.
- `service_role` key → only needed if you use the optional `/admin/invite` endpoint. Keep it server-side only, e.g. `SUPABASE_SERVICE_ROLE_KEY` env var. Never put it in frontend code.

## 5. Invite your first users
Easiest path, no code: Dashboard → Authentication → Users → **Invite user**.

Alternative, if you'd rather script it: set `ADMIN_API_KEY` (any long
random string, your choice) and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
in the backend environment, then:

```bash
curl -X POST http://localhost:8000/admin/invite \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: <your ADMIN_API_KEY>" \
  -d '{"email": "faculty.member@kuet.ac.bd"}'
```

## 6. Backend environment variables
```
SUPABASE_JWT_SECRET=...          # required — verifies incoming requests
SUPABASE_URL=...                 # optional — only for /admin/invite
SUPABASE_SERVICE_ROLE_KEY=...    # optional — only for /admin/invite, keep secret
ADMIN_API_KEY=...                # optional — only for /admin/invite
```

## 7. Backend dependencies
```bash
pip install pyjwt httpx pydantic[email]
```

## 8. Frontend config
Fill in `config.js`:
```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```
The anon key is meant to be public — RLS policies in `schema.sql` are what
actually restrict access, not keeping this key secret.

## What changed structurally
- Chat history now lives in Postgres (`chat_sessions` / `chat_messages`), scoped per user by Row Level Security — no more `localStorage`, so history follows a user across devices and survives a browser cache clear.
- `/chat` now requires `Authorization: Bearer <token>`; the backend verifies it and scopes the LangGraph thread as `{user_id}::{session_id}` so users can't collide with or access each other's conversation memory.
- Theme preference is the one thing still kept in `localStorage` — it's a device preference, not user data, so there's no reason to round-trip it through the database.


# One time SQL setup (run in Supabase SQL runner)

```python
create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  content text,
  metadata jsonb,
  embedding vector(1536)  -- match your embedding model's dim
);

create index on documents using hnsw (embedding vector_cosine_ops);

create or replace function match_documents(
  query_embedding vector(1536),
  match_threshold float default 0.78,
  match_count int default 10
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language sql stable as $$
  select id, content, metadata,
         1 - (embedding <=> query_embedding) as similarity
  from documents
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```