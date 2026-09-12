import { API_BASE_URL } from "./config.js";
const newChatBtn = document.getElementById('newChatBtn')

async function getNewSessionID(){
    let token;
    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }

    const messageContainer = document.querySelector('.messagesContainer');
    messageContainer.innerHTML = '';
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'welcomeMessage';
    welcomeDiv.innerHTML = `<img src="assets/imgs/icon.svg" class="welcomeIcon"> Welcome Back!`;
    messageContainer.appendChild(welcomeDiv);
    console.log('welcome div have been made : ', welcomeDiv)
    try{
        const response = await fetch(`${API_BASE_URL}/chat/session/new`,{
            method: 'GET',
            headers: {
                'Authorization':`Bearer ${token}`,
                'Content-Type':'application/json'
            }
        });

        if (!response.ok){
            window.location.href = 'login.html'
            throw new Error("Failed to create new session.");
        }
        const data = await response.json();
        const sessionId = data.session_id;
        localStorage.setItem('current_thread_id', sessionId);

        
        
        // so after creating a new session id the getSessions active
        // state gets updated.
        await getSessions();

        console.log('New session created with sessionid: ', sessionId);
    } catch (e){
        console.log("ERROR: ", e)
    }
}

newChatBtn.addEventListener('click', getNewSessionID);


async function getSessions() {
  try {
    let token;
    if (window.electronAPI && window.electronAPI.getToken) {
        token = await window.electronAPI.getToken();
    } else {
        token = localStorage.getItem('sb-token');
    }
    if (!token) {
      console.warn('No token found in localStorage');
      return;
    }

    console.log('Fetching sessions list...');
    const res = await fetch(`${API_BASE_URL}/chat/sessions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      console.error(`Server responded with status: ${res.status} ${res.statusText}`);
      
      // Try to get error details from response
      let errorDetail = '';
      try {
        const errorData = await res.json();
        errorDetail = errorData.detail || JSON.stringify(errorData);
        console.error('Error details:', errorDetail);
      } catch (e) {
        // If response isn't JSON, get text
        const text = await res.text();
        errorDetail = text || res.statusText;
        console.error('Error response body:', text);
      }
      
      if (res.status === 401 || res.status === 403) {
        console.warn('Authentication failed, redirecting to login...');
        window.location.href = 'login.html';
      } else if (res.status === 500) {
        console.error('Server internal error. Check backend logs for details.');
        // Optionally show user-friendly message
        showErrorMessage('Server error. Please try again later.');
      }
      return;
    }

    const sessions = await res.json();
    console.log(`Successfully fetched ${sessions.length} sessions`);
    
    // Get or create sessions list container
    const list = document.querySelector('.chatHistory .sessionsList') || (() => {
      console.log('Sessions list not found, creating new one...');
      const ul = document.createElement('ul');
      ul.className = 'sessionsList';
      const chatHistory = document.querySelector('.chatHistory');
      if (chatHistory) {
        chatHistory.appendChild(ul);
        return ul;
      } else {
        console.error('Could not find .chatHistory container');
        return null;
      }
    })();
    
    if (!list) {
      console.error('Failed to create or find sessions list');
      return;
    }
    
    list.innerHTML = '';

    const current = localStorage.getItem('current_thread_id');
    console.log(`Current thread ID: ${current || 'none'}`);
    
    if (sessions.length === 0) {
      console.log('No sessions found');
      // Optionally show a "no sessions" message
      const emptyMsg = document.createElement('li');
      emptyMsg.className = 'no-sessions-message';
      emptyMsg.textContent = 'No chats yet. Start a new one!';
      list.appendChild(emptyMsg);
    }

    sessions.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'session-item' + (s.thread_id === current ? ' active' : '');
      btn.textContent = s.title || 'Untitled';
      btn.dataset.threadId = s.thread_id;
      btn.onclick = () => {
        try {
          localStorage.setItem('current_thread_id', s.thread_id);
          const messagesContainer = document.querySelector('.messagesContainer');
          if (messagesContainer) {
            messagesContainer.innerHTML = '';
          } else {
            console.warn('Messages container not found');
          }
          
          if (typeof window.loadChatHistory === 'function') {
            window.loadChatHistory();
          } else {
            console.warn('loadChatHistory function not found');
          }
          
          document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
          btn.classList.add('active');
        } catch (clickError) {
          console.error('Error handling session click:', clickError);
        }
      };
      list.appendChild(btn);
    });
    
    console.log('Sessions rendered successfully');
    
  } catch (error) {
    console.error('ERROR in getSessions():', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    // Show user-friendly error message
    showErrorMessage('Failed to load chat sessions. Please refresh the page.');
  }
}

// Helper function to show error messages to user
function showErrorMessage(message) {
  // You can customize this based on your UI
  const messagesContainer = document.querySelector('.messagesContainer');
  if (messagesContainer) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = '⚠️ ' + message;
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '10px';
    errorDiv.style.textAlign = 'center';
    messagesContainer.prepend(errorDiv);
  } else {
    console.error('Cannot show error message: messagesContainer not found');
  }
}

export {getNewSessionID, getSessions}