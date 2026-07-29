// upload.js
import { appendBotBubble, scrollToBottom } from './ui.js';

const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const inputWrapper = document.querySelector('.input-wrapper');

// Click upload button
uploadBtn.addEventListener('click', () => fileInput.click());

// File selection from input
fileInput.addEventListener('change', handleFileUpload);

// Drag and drop on input wrapper
inputWrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    inputWrapper.style.borderColor = 'var(--terracotta)';
});

inputWrapper.addEventListener('dragleave', () => {
    inputWrapper.style.borderColor = '';
});

inputWrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    inputWrapper.style.borderColor = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        handleFileUpload({ target: fileInput });
    }
});

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    // Show status message
    const statusMsg = appendBotBubble(`Uploading "${file.name}"...`);
    scrollToBottom();

    // Get access token (supabaseClient is global)
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) {
        statusMsg.querySelector('.bubble-content').textContent = 'You must be signed in to upload.';
        return;
    }
    // Prepare FormData
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('http://localhost:8000/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Upload failed');
        }
        statusMsg.querySelector('.bubble-content').textContent =
            `Uploaded "${file.name}" - ${data.chunk_count} chunks indexed. You can now ask questions about it.`;
    } catch (error) {
        statusMsg.querySelector('.bubble-content').textContent =
            `Upload failed: ${error.message}`;
        statusMsg.classList.add('error');
    }
    // Reset file input so same file can be re-uploaded
    fileInput.value = '';
    scrollToBottom();
}