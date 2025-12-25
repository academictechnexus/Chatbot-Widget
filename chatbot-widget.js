/* chatbot-widget.js — FULL, ICON-FIXED, PRODUCTION SAFE */

(function () {
  "use strict";

  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const KEY_SESSION = "mascot_session_id_v1";

  const esc = s =>
    s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : "";

  function getSession(){
    try{
      let s = localStorage.getItem(KEY_SESSION);
      if (s) return s;
      s = "sess-" + Math.random().toString(36).slice(2);
      localStorage.setItem(KEY_SESSION,s);
      return s;
    }catch{
      return "sess-" + Math.random().toString(36).slice(2);
    }
  }

  const sessionId = getSession();

  document.addEventListener("DOMContentLoaded", init);

  function init(){

    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>
      </svg>`;
    document.body.appendChild(launcher);

    const wrapper = document.createElement("div");
    wrapper.className = "cb-wrapper";
    wrapper.innerHTML = `
      <div class="cb-card">
        <div class="cb-header">
          <div class="cb-header-left">
            <div class="cb-ai-icon">
              <svg viewBox="0 0 24 24">
                <path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>
              </svg>
            </div>
            <span>AI Assistant</span>
          </div>
          <button class="cb-close">×</button>
        </div>

        <div class="cb-body">
          <div class="cb-messages" id="msgs"></div>
        </div>

        <div class="cb-footer">
          <div class="cb-input-shell">
            <!-- Upload -->
            <button id="uploadBtn" title="Upload">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"/>
              </svg>
            </button>

            <!-- Voice -->
            <button id="micBtn" title="Voice">
              <svg viewBox="0 0 24 24">
                <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z"/>
              </svg>
            </button>

            <input id="cb-input" placeholder="Message…" />

            <button id="sendBtn" class="cb-send-btn" title="Send">
              <svg viewBox="0 0 24 24">
                <path d="M4 20l16-8L4 4v6l9 2-9 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const msgs = wrapper.querySelector("#msgs");
    const input = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#sendBtn");
    const micBtn = wrapper.querySelector("#micBtn");

    launcher.onclick = () => wrapper.style.display = "flex";
    wrapper.querySelector(".cb-close").onclick = () => wrapper.style.display = "none";

    /* Messaging */
    async function send(text){
      const u = document.createElement("div");
      u.className = "cb-msg cb-msg-user";
      u.textContent = text;
      msgs.appendChild(u);
      input.value = "";

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
        msgs.appendChild(b);
      }catch{
        const b = document.createElement("div");
        b.className = "cb-msg cb-msg-bot";
        b.textContent = "Network error.";
        msgs.appendChild(b);
      }

      msgs.scrollTop = msgs.scrollHeight;
    }

    sendBtn.onclick = () => input.value.trim() && send(input.value.trim());
    input.onkeydown = e => e.key === "Enter" && input.value.trim() && send(input.value.trim());

    /* Voice */
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) return;

    const recog = new SpeechAPI();
    recog.lang = "en-US";
    recog.continuous = true;

    let voiceOn = false;

    micBtn.onclick = () => {
      voiceOn = !voiceOn;
      micBtn.classList.toggle("voice-active", voiceOn);
      voiceOn ? recog.start() : recog.stop();
    };

    recog.onresult = e => {
      const text = e.results[e.results.length - 1][0].transcript.trim();
      if (text) send(text);
    };

    recog.onend = () => {
      if (voiceOn) recog.start();
    };
  }
})();
