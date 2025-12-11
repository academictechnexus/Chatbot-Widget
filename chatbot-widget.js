// chatbot-widget.js - upgraded: persistence + server-backed history + upload + markdown + retry/backoff + structured responses
(function () {
  // ---- CONFIG ----
  const API_URL = "https://mascot.academictechnexus.com/chat";
  const CONV_URL = "https://mascot.academictechnexus.com/conversations"; // NEW endpoint to fetch conversation messages
  const UPLOAD_URL = "https://mascot.academictechnexus.com/mascot/upload";
  const KEY_SESSION = "mascot_session_id";
  const KEY_HISTORY = "mascot_history_v1";

  // ---- UTILITIES ----
  function nowIso() { return new Date().toISOString(); }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // minimal safe markdown renderer (same as earlier)
  function renderMarkdown(md) {
    if (!md) return "";
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    md = md.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${esc(code)}</code></pre>`);
    md = md.replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`);
    md = md.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    md = md.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    md = md.replace(/^# (.*$)/gim, "<h1>$1</h1>");
    md = md.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/(^|[^*])\*(?!\*)(.*?)\*(?!\*)/g, "$1<em>$2</em>");
    md = md.replace(/_(.*?)_/g, "<em>$1</em>");
    md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    md = md.replace(/^\s*[-*]\s+(.*)/gm, "<li>$1</li>");
    md = md.replace(/(<li>.*<\/li>)/gms, "<ul>$1</ul>");
    const blockTags = ["h1","h2","h3","pre","ul","ol","p","blockquote"];
    const lines = md.split(/\n{2,}/).map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return "";
      const isBlock = blockTags.some(tag => trimmed.startsWith(`<${tag}`) || trimmed.endsWith(`</${tag}>`));
      return isBlock ? trimmed : `<p>${trimmed}</p>`;
    });
    return lines.join("\n");
  }

  // ---- PERSISTENCE ----
  function getOrCreateSessionId() {
    try {
      const existing = localStorage.getItem(KEY_SESSION);
      if (existing) return existing;
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
    } catch (e) {
      return [];
    }
  }
  function saveHistory(arr) {
    try { localStorage.setItem(KEY_HISTORY, JSON.stringify(arr.slice(-200))); } catch {}
  }
  function clearHistory() { try { localStorage.removeItem(KEY_HISTORY); } catch {} }

  let history = loadHistory();

  // ---- DOM SETUP (UI unchanged) ----
  const scriptEl = document.currentScript || document.querySelector('script[src*="chatbot-widget"]');
  const cssHref = scriptEl ? new URL("chatbot-widget.css", scriptEl.src).href : "chatbot-widget.css";
  const cssLink = document.createElement("link"); cssLink.rel = "stylesheet"; cssLink.href = cssHref; document.head.appendChild(cssLink);

  const launcher = document.createElement("button");
  launcher.type = "button"; launcher.className = "cb-launcher";
  launcher.innerHTML = `<span class="cb-launcher-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3V5z"/></svg></span>`;
  document.body.appendChild(launcher);

  const wrapper = document.createElement("div");
  wrapper.className = "cb-wrapper";
  wrapper.style.display = "none";
  wrapper.innerHTML = `
    <div class="cb-card" role="dialog" aria-modal="false" aria-label="AI Assistant">
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

  // hidden file input
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.style.display = "none"; document.body.appendChild(fileInput);

  // ---- UI state ----
  let isOpen = false;
  let hasGreeted = false;
  let sending = false;

  // analytics hook
  function emitEvent(name, payload = {}) {
    try {
      if (window.__mascotWidget && typeof window.__mascotWidget.onEvent === "function") {
        window.__mascotWidget.onEvent({ name, sessionId, ts: nowIso(), ...payload });
      }
    } catch (e) { console.warn("Event hook error", e); }
  }

  // ---- RENDER / HISTORY ----
  function escapeHtml(s) { return s ? s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""; }
  function escapeAttr(s) { return s ? s.replace(/"/g,"&quot;").replace(/'/g,"&#39;") : ""; }

  function createBubbleEl(role, contentHtml, ts) {
    const bubble = document.createElement("div");
    bubble.className = "cb-msg " + (role === "user" ? "cb-msg-user" : "cb-msg-bot");
    if (ts) bubble.dataset.ts = ts;
    bubble.innerHTML = contentHtml;
    return bubble;
  }

  function addMessageToHistory(role, text, extra = {}) {
    const item = { id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, role, text, ts: nowIso(), extra };
    history.push(item);
    saveHistory(history);
    return item;
  }

  function renderCardHtml(extra) {
    const title = extra.title ? `<div class="cb-card-title">${escapeHtml(extra.title)}</div>` : "";
    const body = extra.body ? `<div class="cb-card-body">${renderMarkdown(extra.body)}</div>` : "";
    const actions = Array.isArray(extra.actions) && extra.actions.length ? `<div class="cb-card-actions">${extra.actions.map(a => `<a class="cb-card-act" href="${escapeAttr(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.label || a.url)}</a>`).join(" ")}</div>` : "";
    return `<div class="cb-rich-card">${title}${body}${actions}</div>`;
  }

  function renderButtonsHtml(extra) {
    if (!Array.isArray(extra.buttons)) return "";
    return `<div class="cb-quick-buttons">${extra.buttons.map((b,i)=>`<button class="cb-quick-btn" data-idx="${i}">${escapeHtml(b.label || b.text || "Option")}</button>`).join(" ")}</div>`;
  }

  function attachQuickButtonsHandlers(container) {
    const btns = container.querySelectorAll(".cb-quick-btn");
    if (!btns.length) return;
    btns.forEach((b) => {
      b.addEventListener("click", (e) => {
        const idx = b.dataset.idx;
        const bubbleTs = container.dataset.ts;
        const histItem = history.find(h => h.role === "bot" && h.ts === bubbleTs);
        const def = histItem?.extra;
        const buttonDef = def?.buttons?.[idx];
        const payload = buttonDef?.payload || buttonDef?.text || buttonDef?.label;
        if (payload) {
          inputEl.value = payload;
          inputEl.focus();
          sendMessage();
        }
      });
    });
  }

  function renderHistory() {
    messagesEl.innerHTML = "";
    for (const m of history) {
      if (m.role === "user") {
        messagesEl.appendChild(createBubbleEl("user", `<div class="cb-text">${escapeHtml(m.text)}</div>`, m.ts));
      } else {
        if (m.extra && (m.extra.type === "card")) {
          messagesEl.appendChild(createBubbleEl("bot", renderCardHtml(m.extra), m.ts));
        } else if (m.extra && m.extra.type === "buttons") {
          const el = createBubbleEl("bot", renderButtonsHtml(m.extra), m.ts);
          messagesEl.appendChild(el);
          attachQuickButtonsHandlers(el);
        } else {
          messagesEl.appendChild(createBubbleEl("bot", `<div class="cb-text">${renderMarkdown(m.text)}</div>`, m.ts));
        }
      }
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(text, sender, extra = {}) {
    if (sender === "user") {
      const itm = addMessageToHistory("user", text);
      const el = createBubbleEl("user", `<div class="cb-text">${escapeHtml(text)}</div>`, itm.ts);
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      emitEvent("send", { text });
      return itm;
    } else {
      const itm = addMessageToHistory("bot", text, extra);
      let el;
      if (extra && extra.type === "card") {
        el = createBubbleEl("bot", renderCardHtml(extra), itm.ts);
      } else if (extra && extra.type === "buttons") {
        el = createBubbleEl("bot", renderButtonsHtml(extra), itm.ts);
      } else {
        el = createBubbleEl("bot", `<div class="cb-text">${renderMarkdown(text)}</div>`, itm.ts);
      }
      messagesEl.appendChild(el);
      attachQuickButtonsHandlers(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      emitEvent("reply", { text, extra });
      return itm;
    }
  }

  function addTyping() {
    const bubble = document.createElement("div");
    bubble.className = "cb-msg cb-msg-bot cb-typing";
    bubble.innerHTML = `<span class="cb-typing-dot"></span><span class="cb-typing-dot"></span><span class="cb-typing-dot"></span>`;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function removeTyping() { const t = messagesEl.querySelector(".cb-typing"); if (t) t.remove(); }

  // ---- Network helpers with retries ----
  async function postWithRetries(url, bodyObj, opts = {}) {
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
          body: opts.isForm ? bodyObj : JSON.stringify(bodyObj),
          signal: controller.signal,
          mode: "cors",
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

  // ---- Fetch server conversation if available ----
  async function fetchServerHistory(site, sessionId) {
    try {
      const url = new URL(CONV_URL);
      url.searchParams.set("site", site);
      url.searchParams.set("sessionId", sessionId);
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url.toString(), { method: "GET", signal: controller.signal, mode: "cors" });
      clearTimeout(t);
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      if (!data || !Array.isArray(data.messages)) return null;
      // Map server messages to widget history shape
      const mapped = data.messages.map(m => ({ id: `srv-${m.ts}-${Math.random().toString(36).slice(2,6)}`, role: m.role, text: m.text, ts: m.ts || nowIso(), extra: m.extra || null }));
      return mapped;
    } catch (e) {
      console.warn("Could not fetch server history:", e);
      return null;
    }
  }

  // ---- SEND message (main) ----
  async function sendMessage() {
    if (sending) return;
    const text = inputEl.value.trim();
    if (!text) return;

    addMessage(text, "user");
    inputEl.value = "";
    addTyping();
    sending = true;

    const pageUrl = window.location.href;
    const title = document.title || "";
    const metaDescription = Array.from(document.querySelectorAll("meta[name='description']")).map(m=>m.content).join(" ");
    const bodyText = (document.body?.innerText || "").replace(/\s+/g," ").slice(0,1200);
    const context = [`PAGE TITLE: ${title}`, `META: ${metaDescription}`, `URL: ${pageUrl}`, `SNIPPET: ${bodyText}`].join("\n\n");

    const payload = { sessionId, text, pageUrl, site: (scriptEl && scriptEl.dataset && scriptEl.dataset.site) ? scriptEl.dataset.site.trim() : window.location.hostname, context };

    emitEvent("send_attempt", { text });

    try {
      const resp = await postWithRetries(API_URL, payload, { retries: 2, timeoutMs: 20000 });
      let data = {};
      try { data = await resp.json(); } catch (e) {}
      removeTyping();

      if ((resp.ok || data.reply || data.message || data.error) && (data.reply || data.text || data.message || data.error || data.type)) {
        if (data.type || data.extra) {
          const extra = data.extra || { type: data.type, title: data.title, body: data.body, actions: data.actions, buttons: data.buttons };
          const textToShow = data.reply || data.message || (data.body || "");
          addMessage(textToShow, "bot", extra);
        } else {
          const replyText = data.reply || data.text || data.message || data.error;
          addMessage(replyText, "bot");
        }
        if (data.error === "daily_limit_reached" || resp.status === 429) {
          inputEl.disabled = true; sendBtn.disabled = true;
        }
        sending = false;
        emitEvent("send_ok", { status: resp.status, data });
        return;
      }

      if (resp.status === 429) {
        addMessage(data.message || "Daily chat limit reached.", "bot");
        inputEl.disabled = true; sendBtn.disabled = true;
        sending = false;
        emitEvent("send_rate_limited", { status: resp.status });
        return;
      }

      console.error("Bad backend response:", resp.status, resp.statusText, data);
      addMessage(data.message || data.reply || `Server error: ${resp.status} ${resp.statusText}`, "bot");
      emitEvent("send_error", { status: resp.status, data });
    } catch (err) {
      removeTyping();
      console.error("Request failed:", err);
      if (err.name === "AbortError") addMessage("Request timed out. Try again.", "bot");
      else addMessage("Network error: please try again in a moment.", "bot");
      emitEvent("send_exception", { error: String(err) });
    } finally {
      sending = false;
    }
  }

  // ---- UPLOAD (drag + Ctrl/Cmd+U) ----
  async function uploadFile(file) {
    addMessage(`Uploading ${file.name}...`, "bot", { type: "info" });
    const form = new FormData(); form.append("mascot", file, file.name);
    emitEvent("upload_start", { name: file.name, size: file.size });
    try {
      const resp = await postWithRetries(UPLOAD_URL, form, { retries: 2, timeoutMs: 20000, isForm: true });
      let data = {}; try { data = await resp.json(); } catch (e) {}
      if (resp.ok && data && data.url) {
        addMessage(`Upload complete: ${data.url}`, "bot");
        emitEvent("upload_ok", { file: file.name, url: data.url });
        inputEl.value = data.url;
      } else {
        console.error("Upload failed:", resp.status, data);
        addMessage(data.error || "Upload failed.", "bot");
        emitEvent("upload_error", { status: resp.status, data });
      }
    } catch (err) {
      console.error("Upload exception:", err);
      addMessage("Upload failed due to network error.", "bot");
      emitEvent("upload_exception", { error: String(err) });
    }
  }

  messagesEl.addEventListener("dragover", (e) => { e.preventDefault(); wrapper.classList.add("cb-dragover"); });
  messagesEl.addEventListener("dragleave", (e) => { wrapper.classList.remove("cb-dragover"); });
  messagesEl.addEventListener("drop", (e) => { e.preventDefault(); wrapper.classList.remove("cb-dragover"); const f = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null; if (f) uploadFile(f); });

  wrapper.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); fileInput.value = ""; });

  // ---- TOGGLE / INIT: on open try to fetch server history, fall back to local ----
  async function tryRestoreServerHistory() {
    const site = (scriptEl && scriptEl.dataset && scriptEl.dataset.site) ? scriptEl.dataset.site.trim() : window.location.hostname;
    const srv = await fetchServerHistory(site, sessionId).catch(() => null);
    if (Array.isArray(srv) && srv.length) {
      history = srv;
      saveHistory(history);
      renderHistory();
      emitEvent("history_restored", { source: "server", count: srv.length });
      return true;
    }
    emitEvent("history_restore_skipped", { reason: "empty_or_error" });
    return false;
  }

  async function toggleChat() {
    isOpen = !isOpen;
    wrapper.style.display = isOpen ? "flex" : "none";
    if (isOpen) {
      // first try server restore; if not, render local history
      const restored = await tryRestoreServerHistory();
      if (!restored) renderHistory();
      if (!hasGreeted && (!history || history.length === 0)) {
        addMessage("Hello! I'm your AI assistant. How can I help you today?", "bot");
      }
      hasGreeted = true;
      setTimeout(() => inputEl.focus(), 120);
      emitEvent("open", {});
    }
  }

  launcher.addEventListener("click", toggleChat);
  wrapper.querySelector(".cb-close").addEventListener("click", toggleChat);

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

  // expose debug helpers
  window.__mascotWidget = Object.assign(window.__mascotWidget || {}, {
    sendMessageDebug: sendMessage,
    sessionId,
    getState: () => ({ sessionId, site: (scriptEl && scriptEl.dataset && scriptEl.dataset.site) ? scriptEl.dataset.site.trim() : window.location.hostname, history }),
    clearConversation: () => { history = []; saveHistory(history); renderHistory(); },
    onEvent: window.__mascotWidget?.onEvent || null,
  });

  // initial render (local)
  renderHistory();

  // accessibility
  wrapper.setAttribute("tabindex", "-1");

})();
