/**
 * System Health Service
 * Handles checks for backend availability and external dependencies (Ollama, Supabase)
 */

import { getBaseUrl } from "./config.js";

export async function checkSystemHealth() {
    try {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/health`);
        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }
        const data = await response.json();
        return {
            ok: data.overall === 'healthy',
            details: data,
            message: data.overall === 'healthy' 
                ? "System Ready" 
                : `System Unhealthy: ${formatHealthErrors(data)}`
        };
    } catch (error) {
        return {
            ok: false,
            details: null,
            message: `Backend unreachable: ${error.message}. Make sure the server is running.`
        };
    }
}

function formatHealthErrors(data) {
    const errors = [];
    if (data.supabase === 'down') errors.push("Supabase connection failed");
    if (data.ollama === 'down') errors.push("Ollama service not found");
    if (data.model !== 'ready') errors.push(`Model ${data.model} not available`);
    return errors.join(", ");
}

/**
 * UI Helper to block the app when system is unhealthy
 */
export function showHealthError(message) {
    // Create overlay if it doesn't exist
    let overlay = document.getElementById('health-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'health-overlay';
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); color: white; z-index: 9999;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; text-align: center; padding: 20px;
            font-family: sans-serif;
        `;
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div style="max-width: 500px; background: #222; padding: 30px; border-radius: 15px; border: 1px solid #444;">
            <h2 style="color: #ff4d4d; margin-bottom: 15px;">⚠️ System Check Failed</h2>
            <p style="margin-bottom: 20px; line-height: 1.6;">${message}</p>
            <button onclick="window.location.reload()" style="
                padding: 10px 20px; background: #4CAF50; color: white; 
                border: none; border-radius: 5px; cursor: pointer; font-weight: bold;
            ">Retry Connection</button>
        </div>
    `;
    overlay.style.display = 'flex';
}
