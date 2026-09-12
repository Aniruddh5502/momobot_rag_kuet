/**
 * manageFiles.js
 * Handles the logic for the "Manage Files" button, allowing users
 * to view, delete, or organize their uploaded documents.
 */

import { API_BASE_URL } from "./config.js";

/**
 * Initializes the Manage Files functionality.
 * Sets up event listeners for the UI button.
 */
export function initManageFiles() {
    const manageFilesBtn = document.querySelector('.manageFiles');
    if (!manageFilesBtn) return;

    manageFilesBtn.addEventListener('click', handleManageFilesClick);
}

/**
 * Event handler for clicking the Manage Files button.
 * Injects the modal HTML into the DOM and displays the floating card.
 */
async function handleManageFilesClick() {
    console.log('Manage Files button clicked');
    
    // Prevent duplicate modals
    if (document.getElementById('manageFilesModal')) {
        document.getElementById('manageFilesModal').style.display = 'flex';
        // Trigger refresh of files when opening
        updateFilesList();
        return;
    }

    try {
        const response = await fetch('manageFilesUI.html');
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
        
        const modal = document.getElementById('manageFilesModal');
        modal.style.display = 'flex';

        // Close logic
        document.getElementById('closeManageFiles').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });

        // Upload more button logic
        document.getElementById('uploadMoreBtn').addEventListener('click', () => {
            modal.style.display = 'none';
            // Trigger the file upload button from handleFile.js
            const uploadBtn = document.getElementById('addFileButton');
            if (uploadBtn) uploadBtn.click();
        });

        // Initial file load
        updateFilesList();

    } catch (error) {
        console.error('Error loading Manage Files UI:', error);
    }
}

/**
 * Updates the modal's file list by calling the backend API.
 */
async function updateFilesList() {
    const container = document.getElementById('fileListContainer');
    if (!container) return;

    try {
        const files = await fetchUserFiles();
        if (!files || files.length === 0) {
            container.innerHTML = '<p class="empty-state">No files found. Please upload some .docx files to get started.</p>';
            return;
        }

        container.innerHTML = files.map(file => `
            <div class="file-item">
                <span class="file-item-name">${file.name}</span>
                <button class="delete-file-btn" data-id="${file.id}">Delete</button>
            </div>
        `).join('');

        // Add delete listeners
        container.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const fileId = e.target.dataset.id;
                if (confirm('Are you sure you want to delete this file?')) {
                    await deleteFile(fileId);
                    updateFilesList();
                }
            });
        });

    } catch (error) {
        container.innerHTML = `<p class="empty-state" style="color: red;">Error loading files: ${error.message}</p>`;
    }
}

/**
 * Deletes a file via the backend API.
 */
async function deleteFile(fileId) {
    let token;
    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }

    const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to delete file');
}

/**
 * Fetches the list of files uploaded by the current user.
 * @returns {Promise<Array>} List of files.
 */
async function fetchUserFiles() {
    let token;
    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }

    if (!token) {
        console.error('No auth token found');
        return [];
    }

    const response = await fetch(`${API_BASE_URL}/files`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.status}`);
    }

    const files = await response.json();
    console.log('User files:', files);
    return files;
}
