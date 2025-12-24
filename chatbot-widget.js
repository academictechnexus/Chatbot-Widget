(function () {
  "use strict";

  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;

  const KEY_SESSION = "mascot_session_id_v1";
  const KEY_HISTORY = "mascot_history_v1";

  const esc = s => s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : "";

  function getSession(){
    let s = localStorage.getItem(KEY_SESSION);
    if (!s){
      s = "sess-" + Math.random().toString(36).slice(2);
      localStorage.setItem(KEY_SESSION,s);
    }
    return s;
  }
  const sessionId = getSession();

  let history = JSON.parse(localStorage.getItem(KEY_HISTORY) || "[]");
  function saveHistory(){
    localStorage.setItem(KEY_HISTORY, JSON.stringify(history.slice(-200)));
  }

  document.addEventListener("DOMContentLoaded", () => {

    /* Launcher */
    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3z"/></svg>
    `;
    document.body.appendChild(launcher);

    /* Widget */
    const wrapper = document.createElement("div");
    wrapper.className = "cb-wrapper";
    wrapper.innerHTML = `
      <div class="cb-card">
        <div class="cb-header">
          <div class="cb-header-left">
            <span class="cb-status"></span>
            <span class="cb-title">Support</span>
          </div>
          <button class="cb-close">
            <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="cb-body">
          <div class="cb-messages" id="cb-messages"></div>
        </div>

        <div class="cb-footer">
          <div class="cb-input-shell">
            <button class="cb-icon-btn">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            </button>

            <input id="cb-input" placeholder="Type a message…"/>

            <button id="cb-send" class="cb-send-btn">
              <svg viewBox="0 0 24 24"><path d="M4 20l16-8L4 4v6l10 2-10 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const messagesEl = wrapper.querySelector("#cb-messages");
    const inputEl = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");

    function addMsg(role, text){
      const d = document.createElement("div");
      d.className = "cb-msg " + (role === "user" ? "cb-msg-user" : "cb-msg-bot");
      d.innerHTML = esc(text);
      messagesEl.appendChild(d);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      history.push({role,text});
      saveHistory();
    }

    history.forEach(m => addMsg(m.role, m.text));

    async function send(){
      const text = inputEl.value.trim();
      if (!text) return;
      addMsg("user", text);
      inputEl.value = "";

      const res = await fetch(CHAT_API,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ sessionId, message:text, pageUrl:location.href })
      });
      const data = await res.json().catch(()=>({}));
      addMsg("bot", data.reply || "Thanks! We’ll get back to you.");
    }

    sendBtn.onclick = send;
    inputEl.onkeydown = e => { if (e.key === "Enter") send(); };

    launcher.onclick = () => {
      wrapper.style.display = wrapper.style.display === "flex" ? "none" : "flex";
    };
    wrapper.querySelector(".cb-close").onclick = () => wrapper.style.display = "none";
  });
})();
