/* chatbot-widget.js — Updated: ensures DOM ready before creating elements.
   Minimal safe changes; behavior/APIs unchanged. Keep this with chatbot-widget.css
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

  // use a domReady helper so script works if included in head/body
  function domReady(cb){
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", cb);
    else cb();
  }

  domReady(initWidget);

  function initWidget(){
    // ---- DOM build ----
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "cb-launcher";
    launcher.setAttribute("aria-label","Open chat");
    launcher.innerHTML = `<span class="cb-launcher-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3V5z"/></svg></span>`;
    launcher.tabIndex = 0;
    document.body.appendChild(launcher);

    const wrapper = document.createElement("div");
    wrapper.className = "cb-wrapper";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <div class="cb-card" role="dialog" aria-label="AI Assistant">
        <div class="cb-header">
          <span class="cb-title">AI Assistant</span>
          <button type="button" class="cb-close" aria-label="Close chat">×</button>
        </div>
        <div class="cb-body">
          <div class="cb-messages" id="cb-messages" aria-live="polite"></div>
        </div>
        <div class="cb-footer">
          <div class="cb-input-shell">
            <input id="cb-input" type="text" placeholder="Type your message..." autocomplete="off" />
            <button id="cb-send" type="button" class="cb-send-btn" aria-label="Send">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l16-8L4 4v5l9 3-9 3v5z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const closeBtn = wrapper.querySelector(".cb-close");
    const messagesEl = wrapper.querySelector("#cb-messages");
    const inputEl = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");

    // hidden file input for upload (Pro+)
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    // ---- UI functions ----
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
      history.push({ id: `u-${Date.now()}`, role: "user", text, ts: nowIso() });
      saveHistory(history);
    }

    function addBot(text, extra = {}) {
      let html;
      if (extra && extra.type === "card") {
        const title = extra.title ? `<div style="font-weight:600;margin-bottom:6px">${esc(extra.title)}</div>` : "";
        const body = extra.body ? `<div>${renderMarkdown(extra.body)}</div>` : "";
        html = `${title}${body}`;
      } else if (extra && extra.type === "buttons" && Array.isArray(extra.buttons)) {
        html = `<div>${renderMarkdown(text)}<div style="margin-top:8px">${extra.buttons.map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${esc(b.label||b.text||"Option")}</button>`).join(" ")}</div></div>`;
      } else {
        html = `<div class="cb-text">${renderMarkdown(text)}</div>`;
      }
      const el = createBubble("bot", html, nowIso());
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      history.push({ id: `b-${Date.now()}`, role: "bot", text, ts: nowIso(), extra });
      saveHistory(history);

      // add quick-button handlers
      const btns = el.querySelectorAll(".cb-quick-btn");
      if (btns.length) btns.forEach(btn => {
        btn.addEventListener("click", (ev) => {
          const idx = parseInt(btn.dataset.idx, 10);
          const payload = extra.buttons && extra.buttons[idx] && (extra.buttons[idx].payload || extra.buttons[idx].text || extra.buttons[idx].label);
          if (payload) { inputEl.value = payload; inputEl.focus(); sendMessage(); }
        });
      });
    }

    function showTyping() {
      const t = document.createElement("div");
      t.className = "cb-msg cb-msg-bot cb-typing";
      t.innerHTML = `<span class="cb-typing-dot"></span><span class="cb-typing-dot"></span><span class="cb-typing-dot"></span>`;
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
      const t = messagesEl.querySelector(".cb-typing");
      if (t) t.remove();
    }

    // ---- history render ----
    function renderHistory() {
      messagesEl.innerHTML = "";
      for (const m of history) {
        if (m.role === "user") messagesEl.appendChild(createBubble("user", `<div class="cb-text">${esc(m.text)}</div>`, m.ts));
        else {
          const extra = m.extra || {};
          if (extra.type === "card") messagesEl.appendChild(createBubble("bot", `<div style="font-weight:600">${esc(extra.title||"")}</div><div>${renderMarkdown(extra.body||"")}</div>`, m.ts));
          else if (extra.type === "buttons") {
            const html = `<div>${renderMarkdown(m.text)}<div style="margin-top:8px">${(extra.buttons||[]).map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${esc(b.label||b.text||"Option")}</button>`).join(" ")}</div></div>`;
            messagesEl.appendChild(createBubble("bot", html, m.ts));
          } else messagesEl.appendChild(createBubble("bot", `<div class="cb-text">${renderMarkdown(m.text)}</div>`, m.ts));
        }
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ---- network helper with basic retries ----
    async function postWithRetries(url, body, opts = {}) {
      const retries = opts.retries ?? 2;
      let attempt = 0;
      let lastErr = null;
      while (attempt <= retries) {
        try {
          const controller = new AbortController();
          const t = setTimeout(()=>controller.abort(), opts.timeoutMs || 20000);
          const resp = await fetch(url, {
            method: opts.method || "POST",
            headers: opts.isForm ? undefined : (opts.headers || { "Content-Type": "application/json" }),
            body: opts.isForm ? body : JSON.stringify(body),
            signal: controller.signal,
            mode: "cors"
          });
          clearTimeout(t);
          return resp;
        } catch (e) {
          lastErr = e;
          if (attempt === retries) break;
          await sleep(500 * Math.pow(2, attempt));
          attempt++;
        }
      }
      throw lastErr;
    }

    // ---- server history restore (optional) ----
    async function fetchServerHistory(site, session) {
      try {
        const url = new URL(CONV_API || `${API_BASE}/conversations`);
        if (site) url.searchParams.set("site", site);
        if (session) url.searchParams.set("sessionId", session);
        const resp = await fetch(url.toString(), { method: "GET", mode: "cors" });
        if (!resp.ok) return null;
        const data = await resp.json().catch(()=>null);
        if (!data || !Array.isArray(data.messages)) return null;
        return data.messages.map(m => ({ id: `srv-${m.ts}-${Math.random().toString(36).slice(2,6)}`, role: m.role, text: m.text, ts: m.ts || nowIso(), extra: m.extra || null }));
      } catch (e) {
        return null;
      }
    }

    // ---- activation flow (token provided when embedding) ----
    let activeSite = null;
    let demoRemaining = null;
    async function activateIfNeeded() {
      if (!TOKEN) return;
      try {
        const resp = await postWithRetries(ACTIVATE_API, { token: TOKEN }, { retries: 1, timeoutMs: 8000 });
        const j = await resp.json().catch(()=>({}));
        if (resp.ok && j && j.site) {
          activeSite = j.site;
          if (activeSite.status === "demo") {
            demoRemaining = (activeSite.demo_message_limit || 0) - (activeSite.demo_message_used || 0);
            const titleEl = wrapper.querySelector(".cb-title");
            if (titleEl) titleEl.textContent = `AI Assistant • Demo ${demoRemaining} left`;
          }
        } else if (j && j.message) {
          const titleEl = wrapper.querySelector(".cb-title");
          if (titleEl) titleEl.textContent = `AI Assistant • ${j.message}`;
        }
      } catch (e) {
        console.warn("activate failed", e);
      }
    }

    // ---- send message ----
    let sending = false;
    async function sendMessage() {
      if (sending) return;
      const text = inputEl.value.trim();
      if (!text) return;
      addUser(text);
      inputEl.value = "";
      showTyping();
      sending = true;

      const pageUrl = window.location.href;
      const title = document.title || "";
      const metaDesc = Array.from(document.querySelectorAll("meta[name='description']")).map(m=>m.content).join(" ");
      const snippet = (document.body && document.body.innerText) ? document.body.innerText.replace(/\s+/g, " ").slice(0,1200) : "";
      const payload = {
        sessionId,
        message: text,
        pageUrl,
        context: [`PAGE_TITLE: ${title}`, `META: ${metaDesc}`, `URL: ${pageUrl}`, `SNIPPET: ${snippet}`].join("\n\n"),
        site: SITE_OVERRIDE || undefined
      };

      try {
        const resp = await postWithRetries(CHAT_API, payload, { retries: 2, timeoutMs: 25000 });
        const data = await resp.json().catch(()=>({}));
        removeTyping();
        sending = false;

        if (!resp.ok) {
          if (resp.status === 402 || (data && data.error === "demo_limit_reached")) {
            addBot(data.message || "Demo limit reached. Please upgrade.");
            inputEl.disabled = true; sendBtn.disabled = true;
            const upgradeUrl = (data && data.upgrade && data.upgrade.url) ? data.upgrade.url : `${API_BASE}/upgrade`;
            addBot(`Upgrade: ${upgradeUrl}`);
            return;
          }
          if (resp.status === 429) {
            addBot(data.message || "Daily limit reached.");
            inputEl.disabled = true; sendBtn.disabled = true;
            return;
          }
          addBot(data.message || `Server error ${resp.status}`);
          return;
        }

        const reply = data.reply || data.text || data.message || "";
        const extra = data.extra || null;
        addBot(reply || "No reply", extra);

        if (typeof data.remaining === "number") {
          demoRemaining = data.remaining;
          const titleEl = wrapper.querySelector(".cb-title");
          if (titleEl) titleEl.textContent = `AI Assistant • Demo ${demoRemaining} left`;
          if (demoRemaining <= 0) {
            inputEl.disabled = true; sendBtn.disabled = true;
            const upgradeUrl = (data && data.upgrade && data.upgrade.url) ? data.upgrade.url : `${API_BASE}/upgrade`;
            addBot(`Demo exhausted — please upgrade: ${upgradeUrl}`);
          }
        }
      } catch (err) {
        removeTyping();
        sending = false;
        console.error("sendMessage error", err);
        addBot(err.name === "AbortError" ? "Request timed out. Try again." : "Network error. Try again later.");
      }
    }

    // ---- upload support (Pro+) ----
    async function uploadFile(file) {
      if (!file) return;
      addBot(`Uploading ${file.name}...`);
      const form = new FormData(); form.append("mascot", file, file.name);
      try {
        const resp = await postWithRetries(UPLOAD_API, form, { retries: 2, timeoutMs: 20000, isForm: true });
        const data = await resp.json().catch(()=>({}));
        if (resp.ok && data && data.url) {
          addBot(`Upload complete: ${data.url}`);
          inputEl.value = data.url;
        } else {
          addBot(data.error || "Upload failed.");
        }
      } catch (e) {
        console.error("upload error", e);
        addBot("Upload failed (network).");
      }
    }

    // drag/drop upload & keyboard shortcut
    messagesEl.addEventListener("dragover", (e)=>{ e.preventDefault(); wrapper.classList.add("cb-dragover"); });
    messagesEl.addEventListener("dragleave", ()=>{ wrapper.classList.remove("cb-dragover"); });
    messagesEl.addEventListener("drop", (e)=>{ e.preventDefault(); wrapper.classList.remove("cb-dragover"); const f = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null; if (f) uploadFile(f); });
    fileInput.addEventListener("change", (e)=>{ const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value = ""; });

    // ---- feature UI per plan ----
    function renderFeatureArea() {
      if (EFFECTIVE_PLAN === "pro") addBot("Pro demo: file uploads and RAG enabled (demo).");
      if (EFFECTIVE_PLAN === "advanced") addBot("Advanced demo: summarization and handover features available.");
    }

    // ---- lead modal (basic) ----
    function showLeadModal() {
      const modal = document.createElement("div");
      modal.style.position = "fixed"; modal.style.left = 0; modal.style.top = 0; modal.style.right = 0; modal.style.bottom = 0;
      modal.style.background = "rgba(0,0,0,0.4)"; modal.style.display = "flex"; modal.style.alignItems = "center"; modal.style.justifyContent = "center"; modal.style.zIndex = 9999999;
      const card = document.createElement("div");
      card.style.background = "#fff"; card.style.borderRadius = "12px"; card.style.padding = "16px"; card.style.width = "360px"; card.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";
      card.innerHTML = `<h3 style="margin:0 0 8px 0">Leave a message</h3>
        <input id="lead-name" placeholder="Name" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6e9ee;margin-bottom:8px" />
        <input id="lead-email" placeholder="Email" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6e9ee;margin-bottom:8px" />
        <textarea id="lead-msg" placeholder="Message" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6e9ee;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="lead-cancel" style="padding:8px 12px;border-radius:8px;background:#f3f4f6;border:none;cursor:pointer">Cancel</button>
          <button id="lead-send" style="padding:8px 12px;border-radius:8px;background:#4f46e5;color:#fff;border:none;cursor:pointer">Send</button>
        </div>`;
      modal.appendChild(card); document.body.appendChild(modal);
      modal.querySelector("#lead-cancel").addEventListener("click", ()=> modal.remove());
      modal.querySelector("#lead-send").addEventListener("click", async () => {
        const name = modal.querySelector("#lead-name").value.trim();
        const email = modal.querySelector("#lead-email").value.trim();
        const message = modal.querySelector("#lead-msg").value.trim();
        modal.querySelector("#lead-send").disabled = true;
        try {
          await postWithRetries(LEAD_API, { site: SITE_OVERRIDE || window.location.hostname, name, email, message, pageUrl: window.location.href }, { retries: 1, timeoutMs: 15000 });
          addBot("Thanks — we've saved your message. We'll contact you if needed.");
          modal.remove();
        } catch (e) {
          addBot("Could not send lead. Try again later.");
        } finally { modal.querySelector("#lead-send").disabled = false; }
      });
    }

    // ---- upgrade CTA ----
    function showUpgrade(url) { addBot(`Upgrade: ${url || (API_BASE + "/upgrade")}`); }

    // ---- open / close and initialization ----
    async function tryRestore() {
      const site = SITE_OVERRIDE || window.location.hostname;
      const srv = await fetchServerHistory(site, sessionId).catch(()=>null);
      if (Array.isArray(srv) && srv.length) { history = srv; saveHistory(history); renderHistory(); return true; }
      return false;
    }

    async function openChat() {
      wrapper.style.display = "flex";
      const restored = await tryRestore();
      if (!restored) renderHistory();
      if (!history || history.length === 0) addBot("Hello! I'm your AI assistant. How can I help you today?");
      inputEl.focus();
    }

    function closeChat() { wrapper.style.display = "none"; }

    // launcher click toggles open/close
    launcher.addEventListener("click", async () => {
      if (wrapper.style.display === "flex") { closeChat(); return; }
      await activateIfNeeded();
      renderFeatureArea();
      await openChat();
    });

    closeBtn.addEventListener("click", () => closeChat());

    sendBtn.addEventListener("click", sendMessage);
    inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

    // file input keyboard shortcut (single attachment)
    wrapper.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") { e.preventDefault(); fileInput.click(); } });

    fileInput.addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value = ""; });

    // expose API for debug
    window.__mascotWidget = Object.assign(window.__mascotWidget || {}, {
      sessionId,
      plan: EFFECTIVE_PLAN,
      token: TOKEN,
      open: () => { activateIfNeeded().then(()=>openChat()); },
      close: closeChat,
      sendMessage,
      getState: () => ({ sessionId, plan: EFFECTIVE_PLAN, activeSite, demoRemaining, history })
    });

    // initial render
    renderFeatureArea();
    renderHistory();
    if (TOKEN) activateIfNeeded();

    // auto-open if ?openmascot present
    if (location.search.includes("openmascot")) setTimeout(()=> launcher.click(), 400);
  } // end initWidget

})(); // end IIFE
