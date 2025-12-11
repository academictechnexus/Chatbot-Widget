/* chatbot-widget.js - plan-aware widget (Basic / Pro / Advanced)
   Usage (owner paste):
   <script src="/path/to/chatbot-widget.js" data-plan="basic" data-token="TOKEN" data-site="example.com"></script>
*/

(function () {
  // ---------- CONFIG ----------
  const API_BASE = (window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com"); // <-- change if needed
  const CHAT_URL = `${API_BASE}/chat`;
  const ACTIVATE_URL = `${API_BASE}/site/activate`;
  const UPLOAD_URL = `${API_BASE}/mascot/upload`;
  const LEAD_URL = `${API_BASE}/lead`;
  const CONV_URL = `${API_BASE}/conversations`; // optional server history fetch

  const KEY_SESSION = "mascot_session_id_v1";
  const KEY_HISTORY = "mascot_history_v1";

  // ---- read attributes from script tag (data-plan, data-token, data-site)
  const scriptEl = document.currentScript || document.querySelector('script[src*="chatbot-widget"]') || document.querySelector('script[src*="chatbot-window"]');
  const PLAN_ATTR = (scriptEl && scriptEl.dataset && scriptEl.dataset.plan) ? scriptEl.dataset.plan.toLowerCase() : (window.__MASCOT_PLAN || "basic");
  const TOKEN_ATTR = (scriptEl && scriptEl.dataset && scriptEl.dataset.token) ? scriptEl.dataset.token : (window.__MASCOT_TOKEN || null);
  const SITE_ATTR  = (scriptEl && scriptEl.dataset && scriptEl.dataset.site) ? scriptEl.dataset.site : null;

  const PLAN = (["basic","pro","advanced"].includes(PLAN_ATTR) ? PLAN_ATTR : "basic");
  const ACTIVATION_TOKEN = TOKEN_ATTR;

  // ---- Utils
  function nowIso() { return new Date().toISOString(); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function esc(s) { return s ? s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""; }

  // ---- Minimal markdown renderer (safe)
  function renderMarkdown(md) {
    if (!md) return "";
    const escape = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;");
    md = md.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${escape(code)}</code></pre>`);
    md = md.replace(/`([^`]+)`/g, (_, c) => `<code>${escape(c)}</code>`);
    md = md.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/\*(.*?)\*/g, "<em>$1</em>");
    md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    md = md.replace(/(^|\n)-\s+(.*)/g, "<li>$2</li>");
    md = md.replace(/(<li>.*<\/li>)/gms, "<ul>$1</ul>");
    const lines = md.split(/\n{2,}/).map(chunk => {
      const t = chunk.trim();
      if (!t) return "";
      if (t.startsWith("<h") || t.startsWith("<pre") || t.startsWith("<ul")) return t;
      return `<p>${t}</p>`;
    });
    return lines.join("\n");
  }

  // ---- Persistence
  function getOrCreateSessionId() {
    try {
      const ex = localStorage.getItem(KEY_SESSION);
      if (ex) return ex;
      const id = "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(KEY_SESSION, id);
      return id;
    } catch (e) { return "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now(); }
  }
  const sessionId = getOrCreateSessionId();
  function loadHistory() { try { const r = localStorage.getItem(KEY_HISTORY); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveHistory(h) { try { localStorage.setItem(KEY_HISTORY, JSON.stringify(h.slice(-200))); } catch (e) {} }
  let history = loadHistory();

  // ---- Inject CSS fallback if not included already (so widget works either way)
  if (!document.querySelector('link[href*="chatbot-widget.css"]') && !document.getElementById('chatbot-inline-style')) {
    // if the site already uses separate css file, they can keep it. We add inline fallback.
    const css = `/* Inline fallback styles - minimal subset, prefer hosting chatbot-widget.css */ 
    .cb-wrapper{display:none} /* keep in sync with your css file; this is fallback only */`;
    const s = document.createElement('style'); s.id = 'chatbot-inline-style'; s.appendChild(document.createTextNode(css)); document.head.appendChild(s);
  }

  // ---- DOM (use your structure) ----
  const launcher = document.createElement("button");
  launcher.className = "cb-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3V5z"/></svg>`;
  document.body.appendChild(launcher);

  const wrapper = document.createElement("div");
  wrapper.className = "cb-wrapper";
  wrapper.style.display = "none";
  wrapper.innerHTML = `
    <div class="cb-card" role="dialog" aria-label="AI Assistant">
      <div class="cb-header">
        <div class="cb-top-row">
          <div class="cb-badge">AI Assistant</div>
          <div class="cb-muted cb-small" style="margin-left:8px">${PLAN.toUpperCase()} DEMO</div>
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

  const closeBtn = wrapper.querySelector(".cb-close");
  const messagesEl = wrapper.querySelector("#cb-messages");
  const inputEl = wrapper.querySelector("#cb-input");
  const sendBtn = wrapper.querySelector("#cb-send");
  const uploadBtn = wrapper.querySelector("#cb-upload");
  const demoRemainingEl = wrapper.querySelector("#cb-demo-remaining");
  const featureArea = wrapper.querySelector("#cb-feature-area");

  // hidden file input
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  // ---- helpers to render messages ----
  function createBubble(role, html) {
    const el = document.createElement("div");
    el.className = "cb-msg " + (role === "user" ? "cb-msg-user" : "cb-msg-bot");
    el.innerHTML = html;
    return el;
  }
  function addUser(text) {
    const el = createBubble("user", `<div class="cb-text">${esc(text)}</div>`);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    history.push({ id: `u-${Date.now()}`, role: "user", text, ts: nowIso() });
    saveHistory(history);
  }
  function addBot(text, extra) {
    let html;
    if (extra && extra.type === "card") {
      html = `<div style="font-weight:600;margin-bottom:6px">${esc(extra.title||"")}</div><div>${renderMarkdown(extra.body||"")}</div>`;
    } else if (extra && extra.type === "buttons" && Array.isArray(extra.buttons)) {
      const buttonsHtml = extra.buttons.map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${esc(b.label||b.text||"Option")}</button>`).join(" ");
      html = `<div>${renderMarkdown(text)}<div style="margin-top:8px">${buttonsHtml}</div></div>`;
    } else {
      html = `<div class="cb-text">${renderMarkdown(text)}</div>`;
    }
    const el = createBubble("bot", html);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    history.push({ id: `b-${Date.now()}`, role: "bot", text, ts: nowIso(), extra: extra || null });
    saveHistory(history);

    // attach quick buttons listeners if present
    const qbtns = el.querySelectorAll(".cb-quick-btn");
    if (qbtns.length) qbtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const payload = extra.buttons[idx].payload || extra.buttons[idx].text || extra.buttons[idx].label;
        if (payload) { inputEl.value = payload; inputEl.focus(); send(); }
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
  function removeTyping() { const t = messagesEl.querySelector(".cb-typing"); if (t) t.remove(); }

  // ---- render saved history on open ----
  function renderHistory() {
    messagesEl.innerHTML = "";
    history.slice(-200).forEach(m => {
      if (m.role === "user") messagesEl.appendChild(createBubble("user", `<div class="cb-text">${esc(m.text)}</div>`));
      else {
        if (m.extra && m.extra.type === "card") messagesEl.appendChild(createBubble("bot", `<div style="font-weight:600">${esc(m.extra.title||"")}</div><div>${renderMarkdown(m.extra.body||"")}</div>`));
        else if (m.extra && m.extra.type === "buttons") {
          const html = `<div>${renderMarkdown(m.text)}<div style="margin-top:8px">${m.extra.buttons.map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${esc(b.label||b.text||"Option")}</button>`).join(" ")}</div></div>`;
          const el = createBubble("bot", html); messagesEl.appendChild(el);
        } else messagesEl.appendChild(createBubble("bot", `<div class="cb-text">${renderMarkdown(m.text)}</div>`));
      }
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---- network + retry helper ----
  async function postWithRetry(url, body, opts = {}) {
    const maxRetries = opts.retries ?? 2;
    let attempt = 0;
    while (attempt <= maxRetries) {
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
        if (attempt === maxRetries) throw e;
        await sleep(500 * Math.pow(2, attempt));
        attempt++;
      }
    }
  }

  // ---- server history fetch (optional) ----
  async function fetchServerHistory(site, session) {
    try {
      const url = new URL(CONV_URL || `${API_BASE}/conversations`);
      if (site) url.searchParams.set("site", site);
      if (session) url.searchParams.set("sessionId", session);
      const resp = await fetch(url.toString(), { method: "GET", mode: "cors" });
      if (!resp.ok) return null;
      const j = await resp.json().catch(()=>null);
      if (!j || !Array.isArray(j.messages)) return null;
      return j.messages.map(m => ({ id: `srv-${m.ts}`, role: m.role, text: m.text, ts: m.ts, extra: m.extra || null }));
    } catch (e) { return null; }
  }

  // ---- Activation (token) ----
  async function activateIfToken() {
    if (!ACTIVATION_TOKEN) return;
    try {
      const resp = await postWithRetry(ACTIVATE_URL, { token: ACTIVATION_TOKEN }, { retries: 1, timeoutMs: 8000 });
      const j = await resp.json().catch(()=>({}));
      if (resp.ok && j && j.site) {
        activeSite = j.site;
        if (activeSite.status === "demo") {
          const rem = (activeSite.demo_message_limit || 0) - (activeSite.demo_message_used || 0);
          demoRemaining = rem;
          demoRemainingEl.textContent = `Demo: ${rem} left`;
        } else demoRemainingEl.textContent = "";
      } else if (j && j.message) {
        demoRemainingEl.textContent = j.message;
      }
    } catch (e) { console.warn("activate error", e); }
  }

  // ---- send message ----
  let sending = false;
  async function send() {
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
    const snippet = (document.body && document.body.innerText) ? document.body.innerText.replace(/\s+/g," ").slice(0,1200) : "";
    const payload = {
      sessionId,
      message: text,
      pageUrl,
      context: [`TITLE: ${title}`, `META: ${metaDesc}`, `URL: ${pageUrl}`, `SNIPPET: ${snippet}`].join("\n\n"),
      site: SITE_ATTR || undefined
    };

    try {
      const resp = await postWithRetry(CHAT_URL, payload, { retries: 2, timeoutMs: 25000 });
      const data = await resp.json().catch(()=>({}));
      removeTyping();
      sending = false;

      if (!resp.ok) {
        if (resp.status === 402 || (data && data.error === "demo_limit_reached")) {
          addBot(data.message || "Demo limit reached. Upgrade to continue.");
          inputEl.disabled = true; sendBtn.disabled = true;
          showUpgrade((data && data.upgrade && data.upgrade.url) ? data.upgrade.url : `${API_BASE}/upgrade`);
          return;
        }
        if (resp.status === 429) {
          addBot(data.message || "Daily limit reached. Try again tomorrow.");
          inputEl.disabled = true; sendBtn.disabled = true;
          return;
        }
        addBot(data.message || `Server error ${resp.status}`);
        return;
      }

      const reply = data.reply || data.message || data.text || "";
      const extra = data.extra || null;
      addBot(reply || "No reply", extra);

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
      console.error("send error", err);
      addBot(err.name === "AbortError" ? "Request timed out. Try again." : "Network error. Try again later.");
    }
  }

  // ---- upload (Pro+) ----
  async function uploadFile(file) {
    if (!file) return;
    addBot(`Uploading ${file.name}...`);
    const form = new FormData(); form.append("mascot", file, file.name);
    try {
      const resp = await postWithRetry(UPLOAD_URL, form, { retries: 2, timeoutMs: 20000, isForm: true });
      const data = await resp.json().catch(()=>({}));
      if (resp.ok && data && data.url) {
        addBot(`Uploaded: ${data.url}`);
        inputEl.value = data.url;
      } else addBot(data.error || "Upload failed.");
    } catch (e) {
      console.error("upload error", e);
      addBot("Upload failed (network).");
    }
  }

  // ---- drag/drop + keyboard upload ----
  messagesEl.addEventListener("dragover", (e) => { e.preventDefault(); wrapper.classList.add("cb-dragover"); });
  messagesEl.addEventListener("dragleave", (e) => wrapper.classList.remove("cb-dragover"));
  messagesEl.addEventListener("drop", (e) => { e.preventDefault(); wrapper.classList.remove("cb-dragover"); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) uploadFile(f); });
  fileInput.addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value = ""; });
  wrapper.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") { e.preventDefault(); fileInput.click(); } });

  // ---- feature area per plan ----
  function renderFeatureArea() {
    featureArea.innerHTML = "";
    if (PLAN === "basic") {
      const btn = document.createElement("button"); btn.className = "cb-upload-btn"; btn.textContent = "Leave a message"; btn.addEventListener("click", showLeadForm); featureArea.appendChild(btn);
    }
    if (PLAN === "pro" || PLAN === "advanced") {
      uploadBtn.style.display = "inline-block";
      const hint = document.createElement("div"); hint.className = "cb-small"; hint.textContent = "Upload docs (PDF/Docx) to let the bot answer from them."; featureArea.appendChild(hint);
    } else uploadBtn.style.display = "none";

    if (PLAN === "advanced") {
      const row = document.createElement("div"); row.style.marginTop = "8px";
      const sum = document.createElement("button"); sum.className = "cb-upload-btn"; sum.textContent = "Summarize conversation";
      sum.addEventListener("click", () => addBot("Summary placeholder: enable server-side /summarize to get real summaries."));
      const hand = document.createElement("button"); hand.className = "cb-upload-btn"; hand.textContent = "Operator handover";
      hand.addEventListener("click", () => addBot("Operator handover requested (demo)."));
      row.appendChild(sum); row.appendChild(hand); featureArea.appendChild(row);
    }
  }

  // ---- lead form modal ----
  function showLeadForm() {
    const modal = document.createElement("div");
    modal.style.position = "fixed"; modal.style.left = 0; modal.style.top = 0; modal.style.right = 0; modal.style.bottom = 0; modal.style.zIndex = 2147483648;
    modal.style.background = "rgba(0,0,0,0.4)"; modal.style.display = "flex"; modal.style.alignItems = "center"; modal.style.justifyContent = "center";
    const card = document.createElement("div"); card.style.background = "#fff"; card.style.padding = "16px"; card.style.borderRadius = "12px"; card.style.width = "360px"; card.style.boxShadow = "0 10px 30px rgba(2,6,23,0.2)";
    card.innerHTML = `<h3 style="margin:0 0 8px 0">Leave a message</h3>
      <input id="lead-name" placeholder="Your name" style="width:100%;padding:8px;border-radius:8px;border:1px solid #e6e9ee;margin-bottom:8px" />
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
        const payload = { site: SITE_ATTR || window.location.hostname, name, email, message, pageUrl: window.location.href };
        const resp = await postWithRetry(LEAD_URL, payload, { retries: 1, timeoutMs: 15000 });
        const data = await resp.json().catch(()=>({}));
        if (resp.ok) {
          addBot("Thanks — we've saved your message. Our team will reach out if needed.");
          modal.remove();
        } else addBot(data.error || "Failed to send lead.");
      } catch (e) { addBot("Network error sending lead."); }
      finally { modal.querySelector("#lead-send").disabled = false; }
    });
  }

  // ---- upgrade CTA ----
  function showUpgrade(url) {
    const a = document.createElement("a"); a.className = "cb-cta"; a.href = url || `${API_BASE}/upgrade`; a.target = "_blank"; a.textContent = "Upgrade to continue";
    messagesEl.appendChild(a); messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ---- Toggle open/close + events ----
  let isOpen = false;
  launcher.addEventListener("click", async () => {
    if (!isOpen) {
      await activateIfToken();
      renderFeatureArea();
      // try server restore
      const srv = await fetchServerHistory(SITE_ATTR || window.location.hostname, sessionId).catch(()=>null);
      if (Array.isArray(srv) && srv.length) { history = srv; saveHistory(history); renderHistory(); }
      else renderHistory();
      if (!history || history.length === 0) addBot("Hello! I'm your AI assistant. How can I help you today?");
      wrapper.style.display = "flex"; isOpen = true; inputEl.focus();
    } else { wrapper.style.display = "none"; isOpen = false; }
  });
  closeBtn.addEventListener("click", () => { wrapper.style.display = "none"; isOpen = false; });

  // bind send / enter
  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e)=> { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

  // upload handlers
  uploadBtn.addEventListener("click", ()=> fileInput.click());
  fileInput.addEventListener("change", (e)=> { const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value = ""; });

  // expose small API for debugging
  window.__mascotWidget = Object.assign(window.__mascotWidget || {}, {
    sessionId, plan: PLAN, token: ACTIVATION_TOKEN,
    open: () => { activateIfToken().then(()=>{ renderFeatureArea(); wrapper.style.display = 'flex'; }); },
    close: () => { wrapper.style.display = 'none'; },
    sendMessage: send,
    getState: () => ({ sessionId, plan: PLAN, activeSite: activeSite, demoRemaining })
  });

  // initial render
  renderFeatureArea();
  renderHistory();
  if (ACTIVATION_TOKEN) activateIfToken();

  // Optional: open widget if URL has ?openmascot
  if (location.search.includes("openmascot")) launcher.click();

})();
