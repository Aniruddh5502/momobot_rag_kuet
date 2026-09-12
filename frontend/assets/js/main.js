// ===========================================================================
//  This is the authentication checking logic that must run as soon as the page loads
// ===========================================================================
// this script is to run as soon as the page is loaded
// first it will check the authentication of the user. if its not valid
// then it will redirect the user to the Login page.
// In main.js, update the checkAuth function
import { API_BASE_URL }                                            from    "./config.js";
import { checkAuth, logout }                                            from    "./auth.js";
import { loadChatHistory, sendMessage }                                 from    "./chat.js";
import { getNewSessionID, getSessions }                                 from    "./sessions.js";
import { initManageFiles }                                              from    "./manageFiles.js";
import { checkSystemHealth, showHealthError }                          from    "./health.js";



// ===========================================================================
//  This is the UI dark/Light mode toggle switch
// ===========================================================================
// all the buttons
//const uiToggle = document.getElementById('toggleButton');


// the UI theme toggle button
// this toggle button saves the preference in localStorage
/*
uiToggle.addEventListener('click', function toggleUi(){
    // get the current theme form the HTML element
    const currentTheme = document.documentElement.getAttribute('data-theme');

    // toggle between light and dark
    if (currentTheme==='dark'){
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
});
*/
// on startup it should search for previous settings and then load
// from there
const savedTheme = localStorage.getItem('theme');
if(savedTheme){
    // if they have saved theme preference, use it
    document.documentElement.setAttribute('data-theme', savedTheme);
}




// ==================================================================
//          Input Box autosizing
// ==================================================================
// get the textare element and store it in a variable
const textArea = document.getElementById('inputMessage');

// then adding an event listner to listen when the user is typing anything in there
// then accoding to the size we are going to adjust the size of out input area
textArea.addEventListener('input', function(){
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
});



document.addEventListener('DOMContentLoaded', async function() {
    
    const sidebar           =   document.getElementById('sidebar');
    const sidebarToggleBtn  =   document.getElementById('sidebarToggle');
    const logoutButton      =   document.getElementById('logoutBtn');
    const sendBtn           =   document.getElementById('sendMessage');
    const inputField        =   document.getElementById('inputMessage');

    // add event listener
    logoutButton.addEventListener('click', logout)
    
    sendBtn.addEventListener('click', sendMessage)
    if(inputField){
        inputField.addEventListener('keydown', (e) => {
            if (e.key == 'Enter' && !e.shiftKey){
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // First, check if the system is healthy before doing anything else
    const health = await checkSystemHealth();
    if (!health.ok) {
        showHealthError(health.message);
        return; // Block all further initialization
    }

    checkAuth();
    if(!localStorage.getItem('current_thread_id')) {
        getNewSessionID();
    }
    getSessions();
    loadChatHistory();
    initManageFiles();
    
    // Default: closed
    sidebar.className = 'sidebar collapsed';
    sidebarToggleBtn.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
    });
});