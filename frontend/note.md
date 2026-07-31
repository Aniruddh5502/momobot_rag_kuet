# KUET RAG Assistant (Frontend)

A robust, modular, and scalable frontend for the KUET Institutional RAG Assistant, designed to support 1000+ concurrent users. Built with vanilla ES Modules, Supabase, and Vitest.

## 🏗 Architecture & Modules
To ensure maintainability and strict adherence to the <150 lines-per-file rule, the application is split into single-responsibility modules:
- `state.js`: Centralized DOM references and global reactive state.
- `auth.js`: Authentication flows (sign-in, password reset, session management).
- `sessions.js`: Supabase database interactions for chat history and message caching.
- `ui.js`: Pure DOM manipulation (rendering message bubbles, sidebar, scroll behavior).
- `chat.js`: Core chat logic (sending messages, handling SSE streams, session switching).
- `theme.js`: Light/dark mode toggling with `localStorage` persistence.
- `api.js`: Fetch logic with robust Server-Sent Events (SSE) parsing and error handling.
- `app.js`: Main entry point that wires event listeners and initializes modules.

## 🧪 Test Coverage Map
We use **Vitest** + **jsdom** to verify logic without relying on a live browser or backend. 

| Test File | Coverage Area | What it Verifies |
| :--- | :--- | :--- |
| `tests/api.test.js` | **Streaming & Error Handling** | ✅ Correctly parses SSE `data:` chunks from the backend.<br>✅ Properly throws and handles backend JSON errors (e.g., rate limits). |
| `tests/chat.test.js` | **UI State Logic** | ✅ Accurately calculates if the user is scrolled near the bottom to trigger auto-scroll. |
| `tests/theme.test.js` | **State & Persistence** | ✅ Correctly applies `data-theme` attributes.<br>✅ Toggles icon visibility (`hidden` state).<br>✅ Persists user preference to `localStorage`. |

*Total: 3 Test Files, 7 Passing Tests.*

## 🚀 Setup & Testing
1. Install dependencies: `npm install`
2. Run tests once: `npm test`
3. Run tests in watch mode (for TDD): `npm run test:watch`

## 📋 Next Steps / Roadmap
- [ ] Complete frontend test coverage (`auth.test.js`, `sessions.test.js`).
- [ ] Swap backend `MemorySaver` for a persistent LangGraph checkpointer (Postgres/SQLite) to survive server restarts.
- [ ] Implement backend rate limiting for the `/chat` endpoint.


## To Open the html file as a website

```bash
python3 -m http.server 8000
```
