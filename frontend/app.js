// app.js - Event listeners and initialization
import { dom } from './state.js';
import { initAuth, handleSignIn, handleSetPassword, handleSignUp } from './auth.js';
import { switchSession, handleSend, autoResize, isNearBottom, closeMobileSidebar } from './chat.js';
import { scrollToBottom } from './ui.js';
import { initTheme, toggleTheme } from './theme.js';

// Event Listeners
dom.signinPanel.addEventListener('submit', handleSignIn);
dom.signupPanel.addEventListener('submit', handleSignUp);
dom.setPasswordPanel.addEventListener('submit', handleSetPassword);
dom.signOutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
});
dom.newChatBtn.addEventListener('click', () => {
    switchSession(null);
    dom.userInput.focus();
});
dom.chatForm.addEventListener('submit', handleSend);
dom.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend(e);
    }
});
dom.userInput.addEventListener('input', autoResize);
dom.messagesContainer.addEventListener('scroll', () => {
    dom.scrollBtn.hidden = isNearBottom();
});
dom.scrollBtn.addEventListener('click', scrollToBottom);
dom.sidebarExpandBtn.addEventListener('click', () => {
    const isCollapsed = dom.sidebar.classList.toggle('collapsed');
    dom.sidebarExpandBtn.hidden = !isCollapsed;
});

dom.sidebarScrim.addEventListener('click', closeMobileSidebar);
dom.themeToggle.addEventListener('click', toggleTheme);

// Panel Switching
document.getElementById('show-signup-link').addEventListener('click', (e) => {
    e.preventDefault();
    import('./auth.js').then(m => m.showAuthPanel('signup'));
});
document.getElementById('show-signin-link').addEventListener('click', (e) => {
    e.preventDefault();
    import('./auth.js').then(m => m.showAuthPanel('signin'));
});

// Init
initTheme();
if (window.innerWidth <= 720) dom.sidebar.classList.add('collapsed');
initAuth();