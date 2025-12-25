/* chatbot-widget.js — ORIGINAL LOGIC PRESERVED
   Phase 1 Voice: Continuous voice + professional icons
*/

(function () {
  "use strict";

  /* ================= ORIGINAL CONFIG ================= */
  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const ACTIVATE_API = `${API_BASE}/site/activate`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const CONV_API = `${API_BASE}/conversations`;
  const LEAD_API = `${API_BASE}/lead`;

  const KEY_SESSION = "mascot_session_id_v1";
  const KEY_HISTORY = "mascot_history_v1";

  const nowIso = () => new Date().toISOString();
  const esc = s =>
    s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : "";

  function domReady(cb){
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", cb);
    } else cb();
  }

  function getSession(){
    try{
      let s = localStorage.getItem(KEY_SESSION);
      if (s) return s;
      s = "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(KEY_SESSION, s);
      return s;
    }catch(e){
      return "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
    }
  }

  const sessionId = getSession();
  let history = [];

  domReady(initWidget);

  function initWidget(){

    /* ================= UI BUILD ================= */
    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 2l1.8 4.8L18.6 9l-4.8 1.8L12 15.6l-1.8-4.8L5.4 9l4.8-2.2L12 2z"/>
      </svg>`;
    document.body.appendChild(launcher);

    const wrapper = document.createElement("div");
    wrapper.className = "cb-wrapper";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <div class="cb-card">
        <div class="cb-header">
          <div class="cb-header-left">
            <div class="cb-ai-icon">
              <svg viewBox="0 0 24 24">
                <path d="M12 2l1.8 4.8L18.6 9l-4.8 1.8L12 15.6l-1.8-4.8L5.4 9l4.8-2.2L12 2z"/>
              </svg>
            </div>
            <span class="cb-title">AI Assistant</span>
          </div>
          <button class="cb-close" aria-label="Close">×</button>
        </div>

        <div class="cb-body">
          <div class="cb-messages" id="cb-messages">
            <div class="cb-intro" id="cb-intro">
              <svg viewBox="0 0 24 24">
                <path fill="#6d4bf4"
                  d="M12 2l1.8 4.8L18.6 9l-4.8 1.8L12 15.6l-1.8-4.8L5.4 9l4.8-2.2L12 2z"/>
              </svg>
              <h2>Ask AI anything</h2>
            </div>
          </div>
        </div>

        <div class="cb-footer">
          <div class="cb-input-shell">
            <!-- Upload (UI-ready) -->
            <button id="cb-upload" title="Upload">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"/>
              </svg>
            </button>

            <input id="cb-input" placeholder="Message…" autocomplete="off"/>

            <!-- Voice -->
            <button id="cb-mic" title="Voice input">
              <svg viewBox="0 0 24 24">
                <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z"/>
              </svg>
            </button>

            <button id="cb-send" class="cb-send-btn" title="Send">
              <svg viewBox="0 0 24 24">
                <path d="M4 20l16-8L4 4v6l9 2-9 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    /* ================= ELEMENTS ================= */
    const closeBtn = wrapper.querySelector(".cb-close");
    const messagesEl = wrapper.querySelector("#cb-messages");
    const inputEl = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");
    const micBtn = wrapper.querySelector("#cb-mic");
    const introEl = wrapper.querySelector("#cb-intro");

    /* ================= VOICE INPUT (CONTINUOUS) ================= */
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let voiceOn = false;

    if (SpeechAPI) {
      recognition = new SpeechAPI();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onresult = (e) => {
        const text = e.results[e.results.length - 1][0].transcript.trim();
        if (text) {
          sendMessage(text);
        }
      };

      recognition.onend = () => {
        if (voiceOn) recognition.start(); // keep listening
      };
    } else {
      micBtn.style.display = "none";
    }

    micBtn.addEventListener("click", () => {
      if (!recognition) return;
      voiceOn = !voiceOn;
      micBtn.classList.toggle("voice-active", voiceOn);
      voiceOn ? recognition.start() : recognition.stop();
    });

    /* ================= SEND LOGIC ================= */
    async function sendMessage(forcedText){
      const text = (forcedText || inputEl.value).trim();
      if (!text) return;

      if (introEl) introEl.remove();

      const u = document.createElement("div");
      u.className = "cb-msg cb-msg-user";
      u.textContent = text;
      messagesEl.appendChild(u);
      inputEl.value = "";

      try{
        const r = await fetch(CHAT_API,{
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ sessionId, message:text })
        });
        const j = await r.json();
        const b = document.createElement("div");
        b.className = "cb-msg cb-msg-bot";
        b.innerHTML = esc(j.reply || j.message || "No response");
        messagesEl.appendChild(b);
      }catch(e){
        const b = document.createElement("div");
        b.className = "cb-msg cb-msg-bot";
        b.textContent = "Network error. Try again.";
        messagesEl.appendChild(b);
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /* ================= EVENTS ================= */
    launcher.onclick = () => wrapper.style.display = "flex";
    closeBtn.onclick = () => wrapper.style.display = "none";
    sendBtn.onclick = () => sendMessage();
    inputEl.onkeydown = e => { if (e.key === "Enter") sendMessage(); };
  }
})();
