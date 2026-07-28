// theme.js - Theme handling
import { dom } from './state.js';

const THEME_KEY = 'rag-assistant-theme';

export function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    dom.themeIconLight.hidden = theme === 'dark';
    dom.themeIconDark.hidden = theme !== 'dark';
}

export function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return applyTheme(stored);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
}

export function toggleTheme() {
    const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
}