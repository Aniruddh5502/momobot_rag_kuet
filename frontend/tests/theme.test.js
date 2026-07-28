// tests/theme.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyTheme, toggleTheme } from '../theme.js';
import { dom } from '../state.js';

describe('Theme Module', () => {
  beforeEach(() => {
    document.body.removeAttribute('data-theme');
    dom.themeIconLight = { hidden: false };
    dom.themeIconDark = { hidden: true };
    vi.clearAllMocks();
  });

  it('should apply light theme correctly', () => {
    applyTheme('light');
    expect(document.body.getAttribute('data-theme')).toBe('light');
    expect(dom.themeIconLight.hidden).toBe(false); // Light icon is shown
    expect(dom.themeIconDark.hidden).toBe(true);   // Dark icon is hidden
  });

  it('should apply dark theme correctly', () => {
    applyTheme('dark');
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(dom.themeIconLight.hidden).toBe(true);  // Light icon is hidden
    expect(dom.themeIconDark.hidden).toBe(false);  // Dark icon is shown
  });

  it('should toggle from light to dark and save to localStorage', () => {
    document.body.setAttribute('data-theme', 'light');
    toggleTheme();
    
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.setItem).toHaveBeenCalledWith('rag-assistant-theme', 'dark');
  });
});