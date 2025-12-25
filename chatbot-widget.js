/* chatbot-widget.js — FULL PRODUCTION (BUG FIX + PHASE 2) */

(function () {
  "use strict";

  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const KEY_SESSION = "mascot_session_id_v1";

  const esc = s => s ? String(s).replace(/[&<>]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;'
  }[c])) : "";

  function getSession(){
    let s = localStorage.getItem(KEY_SESSION);
    if (!s){
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
              <svg viewBox="0 0 24 24"><path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>
            </div>
            AI Assistant
          </div>
          <div class="cb-header-actions">
            <button id="cb-clear" title="Clear">♻</button>
            <button id="cb-export" title="Export">⬇</button>
            <button id="cb-close">×</button>
          </div>
        </div>

        <div class="cb-body">
          <div class="cb-messages" id="msgs"></div>
        </div>

        <div class="cb-footer">
          <div class="cb-input-shell">
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

    /* Open / Close */
    launcher.onclick = () => {
      wrapper.style.display = "flex";
      input.focus();
      if (!msgs.hasChildNodes()){
        addBot("Hello! I'm your AI assistant. How can I help you today?");
      }
    };
    wrapper.querySelector("#cb-close").onclick = () => wrapper.style.display = "none";

    /* Messaging */
    function addUser(text){
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-user";
      d.textContent = text;
      msgs.appendChild(d);
    }

    function addBot(text){
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-bot";
      d.innerHTML = esc(text);

      const actions = document.createElement("div");
      actions.className = "cb-msg-actions";
      actions.innerHTML = `
        <button title="Copy">📋</button>
        <button title="Helpful">👍</button>
        <button title="Not helpful">👎</button>
      `;
      actions.children[0].onclick = () => navigator.clipboard.writeText(text);
      d.appendChild(actions);

      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    }

    async function send(text){
      addUser(text);
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
      }
    }

    sendBtn.onclick = () => input.value.trim() && send(input.value.trim());
    input.onkeydown = e => e.key === "Enter" && input.value.trim() && send(input.value.trim());

    /* Clear */
    wrapper.querySelector("#cb-clear").onclick = () => msgs.innerHTML = "";

    /* Export */
    wrapper.querySelector("#cb-export").onclick = () => {
      const text = [...msgs.children].map(n => n.textContent).join("\n\n");
      const blob = new Blob([text],{type:"text/plain"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chat.txt";
      a.click();
    };
  }
})();
