/**
 * handleFile.js
 * Handles file selection and uploading to the backend RAG pipeline.
 * Adheres to high-reliability coding standards: modular, deterministic, and verifiable.
 */

import { API_BASE_URL } from "./config.js";

// --- UI Elements ---
// Get the addFileButton from index - user clicks this to start upload
const addFileButton = document.getElementById('addFileButton');

// Creates a hidden file input element programatically
// this is a standard pattern for custom file upload buttons
const fileInput = document.createElement('input');


// Configuration
// Sets input type as 'file' so it open up the file picker dialog
fileInput.type = 'file';

// restricts the filetype only to docx
fileInput.accept = '.docx'; // Strictly limited to .docx per requirement

// Hide the file input completely - we'll trigger it programmatically
// The user will click the styled button, which triggers this hidden input
fileInput.style.display = 'none';

// Add the hidden input to the DOM body so it exists in the document
document.body.appendChild(fileInput);


/**
 * Creates and displays a refined notification toast.
 * Follows the project's Notion-inspired aesthetic: minimal, clean, and subtle.
 * @param {string} message - The text to display.
 * @param {'success' | 'error'} type - The type of notification.
 */
function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    
    // Style the toast using CSS variables from the design system
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: type === 'success' ? 'var(--color-bg-green)' : 'var(--color-bg-red)',
        color: type === 'success' ? 'var(--color-text-green)' : 'var(--color-text-red)',
        border: `1px solid ${type === 'success' ? 'var(--color-border)' : 'var(--color-bg-red)'}`,
        fontSize: 'var(--font-size-sm)',
        fontFamily: 'var(--font-ui)',
        zIndex: '10000',
        boxShadow: 'var(--shadow-resting)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        transform: 'translateY(100px)',
        opacity: '0'
    });

    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    });

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Performs the actual file upload to the backend.
 * Validates session state before initiating request.
 * @param {File} file - The file object selected by the user.
 * @returns {Promise<void>}
 */
async function uploadFile(file) {
    // Get authentication token using the same logic as auth.js to support Electron bridge
    let token;
    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }
    
    if (!token) {
        showNotification('Session expired. Please log in again.', 'error');
        window.location.href = 'login.html';
        return;
    }

    // Prepare multipart/form-data
    // this is a standard way to send file data over fetch
    const formData = new FormData();
    formData.append('file', file);  // Append file with field name 'file'

    // Visual feedback: Disable button and lower opacity during upload
    addFileButton.style.pointerEvents = 'none';
    addFileButton.style.opacity = '0.5';

    try {
        const response = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData      // formdata automatically sets proper Content-Type
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || `Upload failed with status ${response.status}`);
        }

        showNotification(`Successfully uploaded ${file.name}`, 'success');
    } catch (error) {
        console.error('Upload Error:', error);
        showNotification(error.message || 'An unexpected error occurred during upload.', 'error');
    } finally {
        // Restore button state
        addFileButton.style.pointerEvents = 'auto';
        addFileButton.style.opacity = '1';
    }
}

// --- Event Listeners ---

// Trigger hidden file input when the UI button is clicked
addFileButton.addEventListener('click', () => {
    fileInput.click();
});

// Handle file selection
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Double-check extension manually for reliability
    if (!file.name.toLowerCase().endsWith('.docx')) {
        showNotification('Please select a .docx file only.', 'error');
        fileInput.value = ''; // Reset input
        return;
    }

    uploadFile(file);
    
    // Reset input so the same file can be uploaded again if needed
    fileInput.value = '';
});
