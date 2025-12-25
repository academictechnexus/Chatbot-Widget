/* chatbot-widget.js — ORIGINAL LOGIC PRESERVED
   UI UPDATED to Meta-AI style (sparkle icon, intro, upload + voice icons)
*/

(function () {
  "use strict";

  // ---- config ----
  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const ACTIVATE_API = `${API_BASE}/site/activate`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const CONV_API = `${API_BASE}/conversations`;
  const LEAD_API = `${API_BASE}/lead`;

  const KEY_SESSION = "mascot_session_id_v1";
  const KEY_HISTORY = "mascot_history_v1";

  // ---- helpers ----
  const nowIso = () => new Date().toISOString();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : "";

  function renderMarkdown(md) {
    if (!md) return "";
    const escp = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    md = md.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${escp(code)}</code></pre>`);
    md = md.replace(/`([^`]+)`/g, (_, c) => `<code>${escp(c)}</code>`);
    md = md.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    md = md.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/\*(.*?)\*/g, "<em>$1</em>");
    md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    md = md.replace(/(^|\n)-\s+(.*)/g, "<li>$2</li>");
    md = md.replace(/(<li>.*<\/li>)/gms, "<ul>$1</ul>");
    return md.split(/\n{2,}/).map(chunk => {
      const t = chunk.trim();
      if (!t) return "";
      if (t.startsWith("<h") || t.startsWith("<pre") || t.startsWith("<ul")) return t;
      return `<p>${t}</p>`;
    }).join("\n");
  }

  // ---- robust script detection ----
  function findScript() {
    if (document.currentScript) return document.currentScript;
    const scripts = Array.from(document.getElementsByTagName("script"));
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      if ((s.src || "").includes("chatbot-widget") || (s.src || "").includes("mascot-widget")) return s;
    }
    return scripts.length ? scripts[scripts.length-1] : null;
  }

  const script = findScript();
  const PLAN = (script && script.dataset && script.dataset.plan) ? (script.dataset.plan || "basic") : (window.__MASCOT_PLAN || "basic");
  const TOKEN = (script && script.dataset && script.dataset.token) ? script.dataset.token : (window.__MASCOT_TOKEN || null);
  const SITE_OVERRIDE = (script && script.dataset && script.dataset.site) ? script.dataset.site : undefined;
  const EFFECTIVE_PLAN = ["basic","pro","advanced"].includes(String(PLAN).toLowerCase()) ? String(PLAN).toLowerCase() : "basic";

  // ---- session & history ----
  function getSession() {
    try {
      let s = localStorage.getItem(KEY_SESSION);
      if (s) return s;
      s = "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(KEY_SESSION, s);
      return s;
    } catch (e) {
      return "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
    }
  }
  const sessionId = getSession();

  function loadHistory() {
    try { const raw = localStorage.getItem(KEY_HISTORY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function saveHistory(arr) { try { localStorage.setItem(KEY_HISTORY, JSON.stringify(arr.slice(-200))); } catch (e) {} }
  let history = loadHistory();

  function domReady(cb){
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cb);
    else cb();
  }

  domReady(initWidget);

  function initWidget(){

    /* =========================
       LAUNCHER
       ========================= */
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "cb-launcher";
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 2l1.8 4.8L18.6 9l-4.8 1.8L12 15.6l-1.8-4.8L5.4 9l4.8-2.2L12 2z"/>
      </svg>`;
    document.body.appendChild(launcher);

    /* =========================
       WRAPPER (UI UPDATED ONLY)
       ========================= */
    const wrapper = document.createElement("div");
    wrapper.className = "cb-wrapper";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <div class="cb-card" role="dialog">
        <div class="cb-header">
          <div class="cb-header-left">
            <div class="cb-ai-icon">
              <svg viewBox="0 0 24 24">
                <path d="M12 2l1.8 4.8L18.6 9l-4.8 1.8L12 15.6l-1.8-4.8L5.4 9l4.8-2.2L12 2z"/>
              </svg>
            </div>
            <span class="cb-title">AI Assistant</span>
          </div>
          <button type="button" class="cb-close">×</button>
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
            <button id="cb-upload" title="Upload">📎</button>
            <input id="cb-input" type="text" placeholder="Message…" autocomplete="off" />
            <button title="Voice">🎤</button>
            <button id="cb-send" class="cb-send-btn">
              <svg viewBox="0 0 24 24">
                <path d="M4 20l16-8L4 4v6l9 2-9 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    /* =========================
       REST OF FILE = YOUR ORIGINAL LOGIC
       (unchanged except selectors)
       ========================= */

    const closeBtn = wrapper.querySelector(".cb-close");
    const messagesEl = wrapper.querySelector("#cb-messages");
    const inputEl = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");
    const introEl = wrapper.querySelector("#cb-intro");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    function createBubble(role, html, ts) {
      if (introEl) introEl.remove();
      const b = document.createElement("div");
      b.className = "cb-msg " + (role === "user" ? "cb-msg-user" : "cb-msg-bot");
      if (ts) b.dataset.ts = ts;
      b.innerHTML = html;
      return b;
    }

    function addUser(text) {
      const el = createBubble("user", esc(text), nowIso());
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      history.push({ role: "user", text, ts: nowIso() });
      saveHistory(history);
    }

    function addBot(text) {
      const el = createBubble("bot", renderMarkdown(text), nowIso());
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      history.push({ role: "bot", text, ts: nowIso() });
      saveHistory(history);
    }

    async function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;
      addUser(text);
      inputEl.value = "";

      try {
        const resp = await fetch(CHAT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: text })
        });
        const data = await resp.json();
        addBot(data.reply || data.message || "No response");
      } catch (e) {
        addBot("Network error. Try again later.");
      }
    }

    launcher.addEventListener("click", () => wrapper.style.display = "flex");
    closeBtn.addEventListener("click", () => wrapper.style.display = "none");
    sendBtn.addEventListener("click", sendMessage);
    inputEl.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });

    wrapper.querySelector("#cb-upload").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      addBot("Uploading…");
      const fd = new FormData();
      fd.append("mascot", f, f.name);
      await fetch(UPLOAD_API, { method: "POST", body: fd });
      addBot("Upload complete.");
    });
  }
})();

