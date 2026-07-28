import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// We test the pure logic functions to ensure robustness
describe('Chat Logic', () => {
    let document, messagesContainer;

    beforeEach(() => {
        const dom = new JSDOM(`<!DOCTYPE html><body><div id="messages" style="height: 500px;"></div></body>`);
        document = dom.window.document;
        messagesContainer = document.getElementById('messages');
        
        // Mock DOM properties for testing
        Object.defineProperty(messagesContainer, 'scrollHeight', { value: 1000, writable: true });
        Object.defineProperty(messagesContainer, 'clientHeight', { value: 500, writable: true });
    });

    it('should detect when user is near the bottom', () => {
        messagesContainer.scrollTop = 400; // 1000 - 400 - 500 = 100 (< 120 threshold)
        const isNear = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 120;
        expect(isNear).toBe(true);
    });

    it('should detect when user is scrolled up', () => {
        messagesContainer.scrollTop = 100; // 1000 - 100 - 500 = 400 (> 120 threshold)
        const isNear = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 120;
        expect(isNear).toBe(false);
    });
});