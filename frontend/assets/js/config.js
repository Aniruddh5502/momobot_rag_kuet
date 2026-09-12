// config.js
export const API_BASE_URL = 'http://localhost:8000';

export async function getBaseUrl() {
    if (window.electronAPI && window.electronAPI.getApiUrl) {
        return await window.electronAPI.getApiUrl();
    }
    return API_BASE_URL;
}