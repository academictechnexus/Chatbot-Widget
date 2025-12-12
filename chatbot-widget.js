/* chatbot-widget.js — production-ready, plan-aware widget
   Keep this file with chatbot-widget.css in same folder.
   Usage (owner):
   <link rel="stylesheet" href="/path/to/chatbot-widget.css">
   <script src="/path/to/chatbot-widget.js" data-plan="basic" data-token="TOKEN" data-site="example.com"></script>

   The widget reads:
   - data-plan: "basic" | "pro" | "advanced" (defaults to basic)
   - data-token: activation token returned by your /site/request-demo (optional)
   - data-site: optional explicit site/domain to pass to backend (otherwise uses origin)
*/

(function () {
  "use strict";

  // ---------- CONFIG ----------
  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_ENDPOINT = `${API_BASE}/chat`;
  const ACTIVATE_ENDPOINT = `${API_BASE}/site/activate`;
  const UPLOAD_ENDPOINT = `${API_BASE}/mascot/upload`;
  const LEAD_ENDPOINT = `${API_BASE}/lead`;
  const CONV_ENDPOINT = `${API_BASE}/conversations`;

  const KEY_SESSION = "mascot_session_id_v1";
  const KEY_HISTORY = "mascot_history_v1";

  // ---------- utilities ----------
  const nowIso = () => new Date().toISOString();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : "";

  // minimal markdown renderer
  function renderMarkdown(md) {
    if (!md) return "";
    const escp = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    md = md.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${escp(code)}</code></pre>`);
    md = md.replace(/`([^`]+)`/g, (_, c) => `<code>${escp(c)}</code>`);
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

  // ---------- script tag detection (robust) ----------
  function findLoaderScript() {
    if (document.currentScript) return document.currentScript;
    const scripts = Array.from(document.getElementsByTagName("script"));
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      const src = s.src || "";
      if (/chatbot-widget|mascot-widget|chatbot-window|chatbot-widget\.js/.test(src)) return s;
    }
    return scripts.length ? scripts[scripts.length - 1] : null;
  }
  const scriptEl = findLoaderScript();

  const PLAN = (scriptEl && scriptEl.dataset && scriptEl.dataset.plan) ? String(scriptEl.dataset.plan).toLowerCase()
    : (window.__MASCOT_PLAN ? String(window.__MASCOT_PLAN).toLowerCase() : "basic");
  const SITE_OVERRIDE = (scriptEl && scriptEl.dataset && scriptEl.dataset.site) ? scriptEl.dataset.site : undefined;
  const TOKEN = (scriptEl && scriptEl.dataset && scriptEl.dataset.token) ? scriptEl.dataset.token : (window.__MASCOT_TOKEN || null);

  const EFFECTIVE_PLAN = (["basic","pro","advanced"].includes(PLAN) ? PLAN : "basic");

  // ---------- persistence ----------
  function getOrCreateSessionId() {
    try {
      const ex = localStorage.getItem(KEY_SESSION);
      if (ex) return ex;
      const id = "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(KEY_SESSION, id);
      return id;
    } catch (e) {
      return "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
    }
  }
  const sessionId = getOrCreateSessionId();

  function loadHistory() {
    try {
      const raw = localStorage.getItem(KEY_HISTORY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(KEY_HISTORY, JSON.stringify(h.slice(-200))); } catch (e) {}
  }
  let history = loadHistory();

  // ---------- fallbacks: ensure CSS present (if user forgot to include css file) ----------
  (function ensureCssLoaded() {
    const hasCss = Array.from(document.styleSheets).some(s => (s.href || "").includes("chatbot-widget.css"));
    if (!hasCss) {
      // inject a small subset to keep layout usable
      const fallback = document.createElement("style");
      fallback.id = "chatbot-widget-fallback-css";
      fallback.textContent = `
      .cb-wrapper{display:none}
      .cb-launcher{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:#6C5CE7;color:#fff;display:flex;align-items:center;justify-content:center;z-index:2147483647}
      .cb-card{width:360px;height:520px;background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.15)}
      `;
      document.head.appendChild(fallback);
    }
  })();

  // ---------- build DOM (using your markup classes) ----------
  const launcher = document.createElement("button");
  launcher.className = "cb-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3V5z"/></svg>`;
  document.body.appendChild(launcher);

  const wrapper = document.createElement("div");
  wrapper.className = "cb-wrapper";
  wrapper.style.display = "none"; // shown on click
  wrapper.innerHTML = `
    <div class="cb-card" role="dialog" aria-label="AI Assistant">
      <div class="cb-header">
        <div class="cb-top-row">
          <div class="cb-badge">AI Assistant</div>
          <div class="cb-muted cb-small" style="margin-left:8px">${EFFECTIVE_PLAN.toUpperCase()} DEMO</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <div id="cb-demo-remaining" class="cb-small" style="color:#fff;opacity:.95"></div>
          <button class="cb-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="cb-body">
        <div class="cb-messages" id="cb-messages" aria-live="polite"></div>
        <div id="cb-feature-area" style="padding:10px 6px"></div>
      </div>
      <div class="cb-footer">
        <div class="cb-input-shell">
          <input id="cb-input" type="text" placeholder="Type your message..." autocomplete="off" />
          <button id="cb-upload" class="cb-upload-btn" title="Upload file" style="display:none">Upload</button>
          <button id="cb-send" class="cb-send-btn" aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l16-8L4 4v5l9 3-9 3v5z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  // elements
  const closeBtn = wrapper.querySelector(".cb-close");
  const messagesEl = wrapper.querySelector("#cb-messages");
  const inputEl = wrapper.querySelector("#cb-input");
  const sendBtn = wrapper.querySelector("#cb-send");
  const uploadBtn = wrapper.querySelector("#cb-upload");
  const demoRemainingEl = wrapper.querySelector("#cb-demo-remaining");
  const featureArea = wrapper.querySelector("#cb-feature-area");

  // file input (hidden)
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  // ---------- UI helpers ----------
  function createBubble(role, html, ts) {
    const el = document.createElement("div");
    el.className = "cb-msg " + (role === "user" ? "cb-msg-user" : "cb-msg-bot");
    if (ts) el.dataset.ts = ts;
    el.innerHTML = html;
    return el;
  }

  function addUserMessage(text) {
    const html = `<div class="cb-text">${esc(text)}</div>`;
    const el = createBubble("user", html, nowIso());
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    history.push({ id: `u-${Date.now()}`, role: "user", text, ts: nowIso() });
    saveHistory(history);
  }

  function addBotMessage(text, extra) {
    let html;
    if (extra && extra.type === "card") {
      const title = extra.title ? `<div style="font-weight:600;margin-bottom:6px">${esc(extra.title)}</div>` : "";
      const body = extra.body ? `<div>${renderMarkdown(extra.body)}</div>` : "";
      html = `<div>${title}${body}</div>`;
    } else if (extra && extra.type === "buttons" && Array.isArray(extra.buttons)) {
      const buttonsHtml = extra.buttons.map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${esc(b.label||b.text||"Option")}</button>`).join(" ");
      html = `<div>${renderMarkdown(text)}<div style="margin-top:8px">${buttonsHtml}</div></div>`;
    } else {
      html = `<div class="cb-text">${renderMarkdown(text)}</div>`;
    }
    const el = createBubble("bot", html, nowIso());
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    history.push({ id: `b-${Date.now()}`, role: "bot", text, ts: nowIso(), extra: extra || null });
    saveHistory(history);

    // attach quick button handlers if present
    const qbtns = el.querySelectorAll(".cb-quick-btn");
    if (qbtns.length) qbtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const payload = extra.buttons[idx].payload || extra.buttons[idx].text || extra.buttons[idx].label;
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
    return t;
  }
  function removeTyping() { const t = messagesEl.querySelector(".cb-typing"); if (t) t.remove(); }

  // ---------- render history ----------
  function renderHistory() {
    messagesEl.innerHTML = "";
    for (const m of history) {
      if (m.role === "user") messagesEl.appendChild(createBubble("user", `<div class="cb-text">${esc(m.text)}</div>`, m.ts));
      else {
        const extra = m.extra || {};
        if (extra.type === "card") messagesEl.appendChild(createBubble("bot", `<div style="font-weight:600">${esc(extra.title||"")}</div><div>${renderMarkdown(extra.body||"")}</div>`, m.ts));
        else if (extra.type === "buttons") {
          const html = `<div>${renderMarkdown(m.text)}<div style="margin-top:8px">${(extra.buttons||[]).map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${esc(b.label||b.text||"Option")}</button>`).join(" ")}</div></div>`;
          const el = createBubble("bot", html, m.ts); messagesEl.appendChild(el);
        } else messagesEl.appendChild(createBubble("bot", `<div class="cb-text">${renderMarkdown(m.text)}</div>`, m.ts));
      }
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------- network helper with retries ----------
  async function postWithRetries(url, body, opts = {}) {
    const maxRetries = opts.retries ?? 2;
    let attempt = 0;
    let lastErr = null;
    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutMs = opts.timeoutMs ?? 20000;
        const t = setTimeout(() => controller.abort(), timeoutMs);
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
        if (attempt === maxRetries) break;
        const backoff = 500 * Math.pow(2, attempt);
        await sleep(backoff);
        attempt++;
      }
    }
    throw lastErr;
  }

  // ---------- server history restore ----------
  async function fetchServerHistory(site, session) {
    try {
      const url = new URL(CONV_ENDPOINT || `${API_BASE}/conversations`);
      if (site) url.searchParams.set("site", site);
      if (session) url.searchParams.set("sessionId", session);
      const resp = await fetch(url.toString(), { method: "GET", mode: "cors" });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      if (!data || !Array.isArray(data.messages)) return null;
      return data.messages.map(m => ({ id: `srv-${m.ts}-${Math.random().toString(36).slice(2,6)}`, role: m.role, text: m.text, ts: m.ts || nowIso(), extra: m.extra || null }));
    } catch (e) {
      return null;
    }
  }

  // ---------- activation with token (idempotent) ----------
  let activeSite = null;
  let demoRemaining = null;
  async function activateIfNeeded() {
    if (!TOKEN) return;
    try {
      const resp = await postWithRetries(ACTIVATE_ENDPOINT, { token: TOKEN }, { retries: 1, timeoutMs: 8000 });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok && j && j.site) {
        activeSite = j.site;
        if (activeSite.status === "demo") {
          demoRemaining = (activeSite.demo_message_limit || 0) - (activeSite.demo_message_used || 0);
          demoRemainingEl.textContent = `Demo: ${demoRemaining} left`;
        } else demoRemainingEl.textContent = "";
      } else if (j && j.message) {
        demoRemainingEl.textContent = j.message;
      }
    } catch (e) {
      console.warn("activate failed", e);
    }
  }

  // ---------- send message ----------
  let sending = false;
  async function sendMessage() {
    if (sending) return;
    const text = inputEl.value.trim();
    if (!text) return;
    addUserMessage(text);
    inputEl.value = "";
    showTyping();
    sending = true;

    const pageUrl = window.location.href;
    const title = document.title || "";
    const metaDesc = Array.from(document.querySelectorAll("meta[name='description']")).map(m => m.content).join(" ");
    const snippet = (document.body && document.body.innerText) ? document.body.innerText.replace(/\s+/g, " ").slice(0, 1200) : "";
    const payload = {
      sessionId,
      message: text,
      pageUrl,
      context: [`PAGE_TITLE: ${title}`, `META: ${metaDesc}`, `URL: ${pageUrl}`, `SNIPPET: ${snippet}`].join("\n\n"),
      site: SITE_OVERRIDE || undefined
    };

    try {
      const resp = await postWithRetries(CHAT_ENDPOINT, payload, { retries: 2, timeoutMs: 25000 });
      const data = await resp.json().catch(() => ({}));
      removeTyping();
      sending = false;

      if (!resp.ok) {
        if (resp.status === 402 || (data && data.error === "demo_limit_reached")) {
          addBotMessage(data.message || "Demo limit reached. Upgrade to continue.");
          inputEl.disabled = true; sendBtn.disabled = true;
          const upgrade = (data && data.upgrade && data.upgrade.url) ? data.upgrade.url : `${API_BASE}/upgrade`;
          showUpgrade(upgrade);
          return;
        }
        if (resp.status === 429) {
          addBotMessage(data.message || "Daily limit reached. Try again tomorrow.");
          inputEl.disabled = true; sendBtn.disabled = true;
          return;
        }
        addBotMessage(data.message || `Server error ${resp.status}`, {});
        return;
      }

      const reply = data.reply || data.text || data.message || "";
      const extra = data.extra || null;
      addBotMessage(reply || "No reply", extra);

      if (typeof data.remaining === "number") {
        demoRemaining = data.remaining;
        demoRemainingEl.textContent = `Demo: ${demoRemaining} left`;
        if (demoRemaining <= 0) {
          showUpgrade((data && data.upgrade && data.upgrade.url) ? data.upgrade.url : `${API_BASE}/upgrade`);
          inputEl.disabled = true; sendBtn.disabled = true;
        }
      }
    } catch (err) {
      removeTyping();
      sending = false;
      console.error("sendMessage exception", err);
      addBotMessage(err.name === "AbortError" ? "Request timed out. Try again." : "Network error. Try again later.", {});
    }
  }

  // ---------- upload handling (Pro+) ----------
  async function uploadFile(file) {
    if (!file) return;
    addBotMessage(`Uploading ${file.name}...`, {});
    const form = new FormData(); form.append("mascot", file, file.name);
    try {
      const resp = await postWithRetries(UPLOAD_ENDPOINT, form, { retries: 2, timeoutMs: 20000, isForm: true });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data && data.url) {
        addBotMessage(`Uploaded: ${data.url}`, {});
        inputEl.value = data.url;
      } else {
        addBotMessage(data.error || "Upload failed.", {});
      }
    } catch (e) {
      console.error("uploadFile error", e);
      addBotMessage("Upload failed due to network error.", {});
    }
  }

  // drag/drop + keyboard upload
  messagesEl.addEventListener("dragover", (e) => { e.preventDefault(); wrapper.classList.add("cb-dragover"); });
  messagesEl.addEventListener("dragleave", (e) => { wrapper.classList.remove("cb-dragover"); });
  messagesEl.addEventListener("drop", (e) => { e.preventDefault(); wrapper.classList.remove("cb-dragover"); const f = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null; if (f) uploadFile(f); });
  fileInput.addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value = ""; });
  wrapper.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") { e.preventDefault(); fileInput.click(); } });

  // ---------- feature area per plan ----------
  function renderFeatureArea() {
    featureArea.innerHTML = "";
    if (EFFECTIVE_PLAN === "basic") {
      const btn = document.createElement("button");
      btn.className = "cb-upload-btn";
      btn.textContent = "Leave a message";
      btn.addEventListener("click", showLeadForm);
      featureArea.appendChild(btn);
    }
    if (EFFECTIVE_PLAN === "pro" || EFFECTIVE_PLAN === "advanced") {
      uploadBtn.style.display = "inline-block";
      const hint = document.createElement("div");
      hint.className = "cb-small";
      hint.textContent = "Upload docs (PDF/Word) to let the bot answer from them.";
      featureArea.appendChild(hint);
    } else {
      uploadBtn.style.display = "none";
    }

    if (EFFECTIVE_PLAN === "advanced") {
      const row = document.createElement("div");
      row.style.marginTop = "8px";
      const sum = document.createElement("button");
      sum.className = "cb-upload-btn";
      sum.textContent = "Summarize conversation";
      sum.addEventListener("click", () => addBotMessage("Summary placeholder: enable server-side summarize endpoint."));
      const hand = document.createElement("button");
      hand.className = "cb-upload-btn";
      hand.textContent = "Operator handover";
      hand.addEventListener("click", () => addBotMessage("Operator handover requested (demo)."));
      row.appendChild(sum); row.appendChild(hand); featureArea.appendChild(row);
    }
  }

  // ---------- lead capture modal ----------
  function showLeadForm() {
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.left = "0"; modal.style.top = "0"; modal.style.right = "0"; modal.style.bottom = "0";
    modal.style.background = "rgba(0,0,0,0.4)"; modal.style.display = "flex"; modal.style.alignItems = "center"; modal.style.justifyContent = "center"; modal.style.zIndex = 2147483648;
    const card = document.createElement("div");
    card.style.background = "#fff"; card.style.borderRadius = "12px"; card.style.padding = "16px"; card.style.width = "360px"; card.style.boxShadow = "0 10px 30px rgba(2,6,23,0.2)";
    card.innerHTML = `<h3 style="margin:0 0 8px 0">Leave a message</h3>
      <input id="lead-name" placeholder="Your name" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6e9ee;margin-bottom:8px" />
      <input id="lead-email" placeholder="Email" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6e9ee;margin-bottom:8px" />
      <textarea id="lead-msg" placeholder="Message" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6e9ee;margin-bottom:8px"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="lead-cancel" style="padding:8px 12px;border-radius:8px;background:#f3f4f6;border:none;cursor:pointer">Cancel</button>
        <button id="lead-send" style="padding:8px 12px;border-radius:8px;background:#4f46e5;color:#fff;border:none;cursor:pointer">Send</button>
      </div>`;
    modal.appendChild(card);
    document.body.appendChild(modal);
    modal.querySelector("#lead-cancel").addEventListener("click", () => modal.remove());
    modal.querySelector("#lead-send").addEventListener("click", async () => {
      const name = modal.querySelector("#lead-name").value.trim();
      const email = modal.querySelector("#lead-email").value.trim();
      const message = modal.querySelector("#lead-msg").value.trim();
      modal.querySelector("#lead-send").disabled = true;
      try {
        const payload = {
          site: SITE_OVERRIDE || window.location.hostname,
          name, email, message, pageUrl: window.location.href
        };
        const resp = await postWithRetries(LEAD_ENDPOINT, payload, { retries: 1, timeoutMs: 15000 });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) {
          addBotMessage("Thanks — we've saved your message. Our team will reach out if needed.");
          modal.remove();
        } else {
          addBotMessage(data.error || "Failed to send lead.");
        }
      } catch (e) {
        addBotMessage("Network error sending lead.");
      } finally {
        modal.querySelector("#lead-send").disabled = false;
      }
    });
  }

  // ---------- upgrade CTA ----------
  function showUpgrade(url) {
    const a = document.createElement("a");
    a.className = "cb-cta";
    a.href = url || `${API_BASE}/upgrade`;
    a.target = "_blank";
    a.textContent = "Upgrade to continue";
    messagesEl.appendChild(a);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---------- open / close and init ----------
  async function tryRestoreServerHistory() {
    const site = SITE_OVERRIDE || window.location.hostname;
    const srv = await fetchServerHistory(site, sessionId).catch(() => null);
    if (Array.isArray(srv) && srv.length) {
      history = srv;
      saveHistory(history);
      renderHistory();
      return true;
    }
    return false;
  }

  async function openWidget() {
    wrapper.style.display = "flex";
    const restored = await tryRestoreServerHistory();
    if (!restored) renderHistory();
    if (!history || history.length === 0) addBotMessage("Hello! I'm your AI assistant. How can I help you today?");
    inputEl.focus();
  }

  function closeWidget() {
    wrapper.style.display = "none";
  }

  // launcher / close events
  launcher.addEventListener("click", async () => {
    if (wrapper.style.display === "flex") { closeWidget(); return; }
    await activateIfNeeded();
    renderFeatureArea();
    await openWidget();
  });
  closeBtn.addEventListener("click", () => closeWidget());

  // send / enter
  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

  // upload handlers
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value = ""; });

  // expose debug helpers & small API
  window.__mascotWidget = Object.assign(window.__mascotWidget || {}, {
    sessionId,
    plan: EFFECTIVE_PLAN,
    token: TOKEN,
    open: () => { activateIfNeeded().then(()=> { renderFeatureArea(); openWidget(); }); },
    close: closeWidget,
    sendMessage: sendMessage,
    getState: () => ({ sessionId, plan: EFFECTIVE_PLAN, activeSite, demoRemaining, history })
  });

  // initial render
  renderFeatureArea();
  renderHistory();
  if (TOKEN) activateIfNeeded();

  // open automatically if URL flag ?openmascot present
  if (location.search.includes("openmascot")) setTimeout(()=> launcher.click(), 500);

})();
