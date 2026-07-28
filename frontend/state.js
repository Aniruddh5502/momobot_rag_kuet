// state.js - Centralized DOM references and global state
export const dom = {
    authScreen: document.getElementById('auth-screen'),
    appContainer: document.getElementById('app-container'),
    signinPanel: document.getElementById('signin-panel'),
    signinEmail: document.getElementById('signin-email'),
    signinPassword: document.getElementById('signin-password'),
    signinError: document.getElementById('signin-error'),
    signupPanel: document.getElementById('signup-panel'),
    signupEmail: document.getElementById('signup-email'),
    signupPassword: document.getElementById('signup-password'),
    signupError: document.getElementById('signup-error'),
    setPasswordPanel: document.getElementById('set-password-panel'),
    newPasswordInput: document.getElementById('new-password'),
    confirmPasswordInput: document.getElementById('confirm-password'),
    setPasswordError: document.getElementById('set-password-error'),
    userEmailEl: document.getElementById('user-email'),
    userAvatarEl: document.getElementById('user-avatar'),
    signOutBtn: document.getElementById('sign-out-btn'),
    messagesContainer: document.getElementById('messages'),
    chatForm: document.getElementById('chat-form'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    sendIcon: document.getElementById('send-icon'),
    stopIcon: document.getElementById('stop-icon'),
    themeToggle: document.getElementById('theme-toggle'),
    themeIconLight: document.getElementById('theme-icon-light'),
    themeIconDark: document.getElementById('theme-icon-dark'),
    newChatBtn: document.getElementById('new-chat-btn'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggleDesktop: document.getElementById('sidebar-toggle-desktop'),
    sidebarToggleMobile: document.getElementById('sidebar-toggle-mobile'),
    sidebarScrim: document.getElementById('sidebar-scrim'),
    chatHistoryEl: document.getElementById('chat-history'),
    chatTitleEl: document.getElementById('chat-title'),
    scrollBtn: document.getElementById('scroll-btn'),
    sidebarExpandBtn: document.getElementById('sidebar-expand-btn')
};

export const state = {
    currentUser: null,
    sessions: [],
    messagesCache: new Map(),
    activeSessionId: null,
    isStreaming: false,
    abortController: null
};

export const WELCOME_TEXT = "Hello! I can answer questions..";