/* chatbot-widget.js — STEP 1: Sparkle Thinking Indicator */

(function () {
  "use strict";

  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const KEY_SESSION = "mascot_session_id_v1";

  function esc(s){
    return s ? s.replace(/[&<>]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])) : "";
  }

  function getSession(){
    let s = localStorage.getItem(KEY_SESSION);
    if(!s){
      s = "sess-" + Math.random().toString(36).slice(2);
      localStorage.setItem(KEY_SESSION,s);
    }
    return s;
  }

  const sessionId = getSession();
  document.addEventListener("DOMContentLoaded", init);

  function init(){

    /* Launcher */
    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>`;
    document.body.appendChild(launcher);

    /* Widget */
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
            AI Assistant
          </div>
          <button id="cb-close">×</button>
        </div>

        <div class="cb-body">
          <div class="cb-messages" id="msgs"></div>
        </div>

        <div class="cb-footer">
          <div class="cb-context">🔒 Using this page content to answer</div>
          <div class="cb-input-shell">
            <button id="cb-upload">
              <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"/></svg>
            </button>

            <button id="cb-mic">
              <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z"/></svg>
            </button>

            <input id="cb-input" type="text" placeholder="Message…" />

            <button id="cb-send" class="cb-send-btn">
              <svg viewBox="0 0 24 24"><path d="M4 20l16-8L4 4v6l9 2-9 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const msgs = wrapper.querySelector("#msgs");
    const input = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");
    const uploadBtn = wrapper.querySelector("#cb-upload");

    /* Hidden file input */
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = async e => {
      const f = e.target.files[0];
      if(!f) return;
      addBot(`Uploading ${f.name}…`);
      const fd = new FormData();
      fd.append("mascot", f, f.name);
      await fetch(UPLOAD_API,{ method:"POST", body:fd });
      addBot("Upload complete.");
    };

    launcher.onclick = () => {
      wrapper.style.display = "flex";
      input.focus();
      if(!msgs.hasChildNodes()){
        addBot("Hello! I'm your AI assistant. How can I help you today?");
      }
    };
    wrapper.querySelector("#cb-close").onclick = () => wrapper.style.display = "none";

    function addUser(t){
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-user";
      d.textContent = t;
      msgs.appendChild(d);
    }

    function addBot(t){
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-bot";
      d.innerHTML = esc(t);
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    }

    async function send(text){
      addUser(text);

      /* ✨ START sparkle */
      wrapper.classList.add("cb-thinking");

      input.value = "";
      try{
        const r = await fetch(CHAT_API,{
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ sessionId, message:text })
        });
        const j = await r.json();
        addBot(j.reply || j.message || "No response");
      }catch{
        addBot("Network error.");
      }finally{
        /* ✨ STOP sparkle */
        wrapper.classList.remove("cb-thinking");
      }
    }

    sendBtn.onclick = () => input.value.trim() && send(input.value.trim());
    input.addEventListener("keydown", e => {
      if(e.key === "Enter" && input.value.trim()){
        send(input.value.trim());
      }
    });
  }
})();
