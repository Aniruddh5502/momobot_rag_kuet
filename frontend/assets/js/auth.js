import { getBaseUrl } from "./config.js";

// Main Authentication
// this function handles both login and signup
// parameters:
//  -   endpoint    :   'signin' or 'signup' determines which api to call
//  -   email       :   users email asress
//  -   password    :   users password
// In auth.js, modify the handleAuth function
async function handleAuth(endpoint, email, password){
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = 'Processing...';
    messageDiv.className = 'message';

    try {
        const baseUrl = await getBaseUrl();
        const response = await fetch(
            `${baseUrl}/auth/${endpoint}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    password: password,
                })
            }
        );

        // Try to parse the response
        let data;
        try {
            data = await response.json();
        } catch (e) {
            // If response is not JSON, get the text
            const text = await response.text();
            throw new Error(`Server error: ${text || response.statusText}`);
        }

        if (!response.ok) {
            // Handle specific status codes
            if (response.status === 422) {
                throw new Error('Invalid email format or password must be at least 6 characters');
            } else if (response.status === 401) {
                throw new Error('Invalid email or password');
            } else {
                throw new Error(data.detail || "Authentication failed");
            }
        }

        // Success handling...
        messageDiv.textContent = data.message || 'Success';
        messageDiv.className = 'message success';

        if (endpoint === 'signin'){
            const token = data.session.access_token;
            if (window.electronAPI && window.electronAPI.saveToken) {
                await window.electronAPI.saveToken(token);
            } else {
                localStorage.setItem('sb-token', token);
            }
            localStorage.setItem('sb-user', JSON.stringify(data.user));
            window.location.href = 'index.html';
            console.log("Sign in succesfull.")
        } else if (endpoint == 'signup'){
            window.location.href = 'login.html';
        }
    } catch(error) {
        messageDiv.textContent = error.message;
        messageDiv.className = 'message error';
        console.error('Auth error:', error);
    }
}

async function checkAuth(){
    let token;
    let userStr;

    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }

    userStr = localStorage.getItem('sb-user');

    if (!token || !userStr){
        console.log("token/user missing")
        window.location.href = 'login.html';
        return;
    }

    try {
        const baseUrl = await getBaseUrl();
        // Use the verify endpoint correctly
        const response = await fetch(`${baseUrl}/auth/verify?token=${token}`);
        
        if (!response.ok) {
            // Try to get error message from response
            let errorMsg = 'Session Expired';
            try {
                const data = await response.json();
                errorMsg = data.detail || errorMsg;
            } catch (e) {
                // If response isn't JSON, use status text
                errorMsg = response.statusText || errorMsg;
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log('User verified:', data.user.email);
        
        // Display user info
        const userInfo = document.getElementById('userInfo');
        if (userInfo) {
            const user = JSON.parse(userStr);
            userInfo.textContent = `Logged in as ${user.email}`;
        }
        
    } catch(e) {
        console.error('Auth check failed:', e.message);
        localStorage.clear();
        window.location.href = 'login.html';
    }
}

// setup event listeners
document.addEventListener('DOMContentLoaded', () => {
    // try to find the login form on the page
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if(loginForm){
        // add 'submit' event listener to the form
        loginForm.addEventListener('submit', async (e)=>{
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            await handleAuth('signin', email, password);
        });
    } else if (signupForm){
        signupForm.addEventListener('submit', async(e)=>{
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            await handleAuth('signup', email, password);
        });
    }
});

// handle logout
function logout(){
    if (window.electronAPI && window.electronAPI.clearToken) {
        window.electronAPI.clearToken();
    } else {
        localStorage.clear();
    }
    localStorage.removeItem('sb-user');
    window.location.href='login.html';
}

export { checkAuth, logout }