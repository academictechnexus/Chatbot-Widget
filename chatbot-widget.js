/* widget.js — Professional Mode (Avatar removed)
   Full file. Backend logic preserved.
*/

(function () {
  "use strict";

  // ---------- CONFIG ----------
  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const ACTIVATE_API = `${API_BASE}/site/activate`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const CONV_API = `${API_BASE}/conversations`;
  const LEAD_API = `${API_BASE}/lead`;

  const KEY_SESSION = "mascot_session_id_v1";
  const KEY_HISTORY = "mascot_history_v1";

  // ---------- HELPERS ----------
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

  // ---------- SCRIPT DATA ----------
  function findScript() {
    if (document.currentScript) return document.currentScript;
    const scripts = Array.from(document.getElementsByTagName("script"));
    return scripts[scripts.length - 1] || null;
  }

  const script = findScript();
  const PLAN = (script && script.dataset.plan) || window.__MASCOT_PLAN || "basic";
  const TOKEN = (script && script.dataset.token) || window.__MASCOT_TOKEN || null;
  const SITE_OVERRIDE = (script && script.dataset.site) || undefined;
  const EFFECTIVE_PLAN = ["basic","pro","advanced"].includes(String(PLAN).toLowerCase())
    ? String(PLAN).toLowerCase()
    : "basic";

  // ---------- SESSION ----------
  function getSession() {
    try {
      let s = localStorage.getItem(KEY_SESSION);
      if (s) return s;
      s = "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(KEY_SESSION, s);
      return s;
    } catch {
      return "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
    }
  }
  const sessionId = getSession();

  function loadHistory() {
    try {
      const raw = localStorage.getItem(KEY_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveHistory(arr) {
    try { localStorage.setItem(KEY_HISTORY, JSON.stringify(arr.slice(-200))); } catch {}
  }
  let history = loadHistory();

  // ---------- DOM READY ----------
  function domReady(cb) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cb);
    else cb();
  }

  domReady(initWidget);

  // ---------- WIDGET ----------
  function initWidget() {

    /* Launcher */
    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML = `
      <span class="cb-launcher-icon">
        <svg viewBox="0 0 24 24"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3z"/></svg>
      </span>`;
    document.body.appendChild(launcher);

    /* Wrapper */
    const wrapper = document.createElement("div");
    wrapper.className = "cb-wrapper";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <div class="cb-card" role="dialog" aria-label="AI Assistant">
        <div class="cb-header">
          <span class="cb-title">AI Assistant</span>
          <button class="cb-close" aria-label="Close">×</button>
        </div>
        <div class="cb-body">
          <div class="cb-messages" id="cb-messages" aria-live="polite"></div>
        </div>
        <div class="cb-footer">
          <div class="cb-input-shell">
            <input id="cb-input" type="text" placeholder="Type your message…" autocomplete="off"/>
            <button id="cb-send" class="cb-send-btn" aria-label="Send">
              <svg viewBox="0 0 24 24"><path d="M4 20l16-8L4 4v5l9 3-9 3z"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrapper);

    const closeBtn = wrapper.querySelector(".cb-close");
    const messagesEl = wrapper.querySelector("#cb-messages");
    const inputEl = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");

    // ---------- UI HELPERS ----------
    function createBubble(role, html, ts) {
      const b = document.createElement("div");
      b.className = "cb-msg " + (role === "user" ? "cb-msg-user" : "cb-msg-bot");
      if (ts) b.dataset.ts = ts;
      b.innerHTML = html;
      return b;
    }

    function addUser(text) {
      const el = createBubble("user", `<div class="cb-text">${esc(text)}</div>`, nowIso());
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      history.push({ role: "user", text, ts: nowIso() });
      saveHistory(history);
    }

    function addBot(text, extra = {}) {
      let html;
      if (extra.type === "buttons" && Array.isArray(extra.buttons)) {
        html = `<div>${renderMarkdown(text)}
          <div style="margin-top:8px">
            ${extra.buttons.map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${esc(b.label||b.text||"Option")}</button>`).join("")}
          </div></div>`;
      } else {
        html = `<div class="cb-text">${renderMarkdown(text)}</div>`;
      }
      const el = createBubble("bot", html, nowIso());
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      history.push({ role: "bot", text, ts: nowIso(), extra });
      saveHistory(history);

      el.querySelectorAll(".cb-quick-btn").forEach(btn=>{
        btn.onclick=()=>{ inputEl.value=btn.textContent; sendMessage(); };
      });
    }

    function showTyping() {
      const t = document.createElement("div");
      t.className = "cb-msg cb-msg-bot cb-typing";
      t.innerHTML = `<span class="cb-typing-dot"></span><span class="cb-typing-dot"></span><span class="cb-typing-dot"></span>`;
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return t;
    }

    // ---------- NETWORK ----------
    async function postWithRetries(url, body, opts={}) {
      const retries = opts.retries ?? 2;
      for (let i=0;i<=retries;i++){
        try{
          const resp = await fetch(url,{
            method: opts.method || "POST",
            headers: opts.isForm ? undefined : {"Content-Type":"application/json"},
            body: opts.isForm ? body : JSON.stringify(body),
            mode:"cors"
          });
          return resp;
        }catch(e){
          if(i===retries) throw e;
          await sleep(500*(i+1));
        }
      }
    }

    // ---------- SEND ----------
    let sending=false;
    async function sendMessage(){
      if(sending) return;
      const text=inputEl.value.trim();
      if(!text) return;
      addUser(text);
      inputEl.value="";
      const typing=showTyping();
      sending=true;

      try{
        const resp=await postWithRetries(CHAT_API,{sessionId,message:text,site:SITE_OVERRIDE});
        const data=await resp.json();
        typing.remove();
        sending=false;

        if(!resp.ok){
          addBot(data.message||"Server error");
          return;
        }
        addBot(data.reply||"");
      }catch{
        typing.remove();
        sending=false;
        addBot("Network error. Try again.");
      }
    }

    // ---------- OPEN / CLOSE ----------
    launcher.onclick=async()=>{
      wrapper.style.display="flex";
      if(history.length===0) addBot("Hello! How can I help you today?");
      inputEl.focus();
    };
    closeBtn.onclick=()=>wrapper.style.display="none";
    sendBtn.onclick=sendMessage;
    inputEl.onkeydown=e=>{if(e.key==="Enter") sendMessage();};

    // ---------- EXPOSE ----------
    window.__mascotWidget={
      sessionId,
      plan:EFFECTIVE_PLAN,
      open:()=>launcher.click(),
      close:()=>wrapper.style.display="none",
      sendMessage
    };
  }
})();
