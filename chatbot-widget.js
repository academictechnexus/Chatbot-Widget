/* widget.js — FULL PRODUCTION FILE (PART 1/2)
   UI updated to professional dark chat
   Backend logic untouched
*/

(function () {
  "use strict";

  // ================= CONFIG =================
  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const ACTIVATE_API = `${API_BASE}/site/activate`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const CONV_API = `${API_BASE}/conversations`;
  const LEAD_API = `${API_BASE}/lead`;

  const KEY_SESSION = "mascot_session_id_v1";
  const KEY_HISTORY = "mascot_history_v1";

  // ================= HELPERS =================
  const nowIso = () => new Date().toISOString();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s =>
    s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : "";

  function renderMarkdown(md) {
    if (!md) return "";
    const escp = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    md = md.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${escp(c)}</code></pre>`);
    md = md.replace(/`([^`]+)`/g, (_, c) => `<code>${escp(c)}</code>`);
    md = md.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/\*(.*?)\*/g, "<em>$1</em>");
    md = md.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return md.split(/\n{2,}/).map(t => `<p>${t}</p>`).join("");
  }

  // ================= SCRIPT DETECTION =================
  function findScript() {
    if (document.currentScript) return document.currentScript;
    const scripts = Array.from(document.getElementsByTagName("script"));
    return scripts[scripts.length - 1];
  }

  const script = findScript();
  const PLAN = script?.dataset?.plan || window.__MASCOT_PLAN || "basic";
  const TOKEN = script?.dataset?.token || window.__MASCOT_TOKEN || null;
  const SITE_OVERRIDE = script?.dataset?.site || undefined;
  const EFFECTIVE_PLAN =
    ["basic","pro","advanced"].includes(PLAN.toLowerCase()) ? PLAN.toLowerCase() : "basic";

  // ================= SESSION =================
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
      return JSON.parse(localStorage.getItem(KEY_HISTORY)) || [];
    } catch {
      return [];
    }
  }
  function saveHistory(arr) {
    try {
      localStorage.setItem(KEY_HISTORY, JSON.stringify(arr.slice(-200)));
    } catch {}
  }

  let history = loadHistory();

  // ================= DOM READY =================
  function domReady(cb){
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", cb);
    else cb();
  }

  domReady(initWidget);

  // ================= INIT =================
  function initWidget(){

    // -------- Launcher --------
    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3z"/>
      </svg>`;
    document.body.appendChild(launcher);

    // -------- Wrapper --------
    const wrapper = document.createElement("div");
    wrapper.className = "cb-wrapper";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <div class="cb-card">
        <div class="cb-header">
          <span class="cb-title">AI Assistant</span>
          <button class="cb-close">×</button>
        </div>

        <div class="cb-body">
          <div class="cb-messages" id="cb-messages"></div>
        </div>

        <div class="cb-footer">
          <div class="cb-input-shell">
            <input id="cb-input" placeholder="Type your message..." />
            <button id="cb-send" class="cb-send-btn">
              <svg viewBox="0 0 24 24">
                <path d="M4 20l16-8L4 4v6l10 2-10 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const messagesEl = wrapper.querySelector("#cb-messages");
    const inputEl = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");
    const closeBtn = wrapper.querySelector(".cb-close");

    // ================= UI HELPERS =================
    function createBubble(role, html) {
      const d = document.createElement("div");
      d.className = "cb-msg " + (role === "user" ? "cb-msg-user" : "cb-msg-bot");
      d.innerHTML = html;
      return d;
    }

    function addUser(text) {
      messagesEl.appendChild(createBubble("user", esc(text)));
      history.push({ role:"user", text, ts: nowIso() });
      saveHistory(history);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addBot(text) {
      messagesEl.appendChild(createBubble("bot", renderMarkdown(text)));
      history.push({ role:"bot", text, ts: nowIso() });
      saveHistory(history);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showTyping(){
      const t = document.createElement("div");
      t.className = "cb-msg cb-msg-bot cb-typing";
      t.innerHTML = `<span class="cb-typing-dot"></span><span class="cb-typing-dot"></span><span class="cb-typing-dot"></span>`;
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    function removeTyping(){
      const t = messagesEl.querySelector(".cb-typing");
      if (t) t.remove();
    }
    // ================= NETWORK =================
    async function postWithRetries(url, body, opts = {}) {
      const retries = opts.retries ?? 2;
      let attempt = 0;
      let lastErr = null;

      while (attempt <= retries) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            opts.timeoutMs || 20000
          );

          const resp = await fetch(url, {
            method: opts.method || "POST",
            headers: opts.isForm
              ? undefined
              : opts.headers || { "Content-Type": "application/json" },
            body: opts.isForm ? body : JSON.stringify(body),
            signal: controller.signal,
            mode: "cors",
          });

          clearTimeout(timeout);
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

    // ================= HISTORY RESTORE =================
    async function fetchServerHistory(site, session) {
      try {
        const url = new URL(CONV_API);
        if (site) url.searchParams.set("site", site);
        if (session) url.searchParams.set("sessionId", session);

        const resp = await fetch(url.toString(), { mode: "cors" });
        if (!resp.ok) return null;

        const data = await resp.json();
        if (!data || !Array.isArray(data.messages)) return null;

        return data.messages.map(m => ({
          role: m.role,
          text: m.text,
          ts: m.ts || nowIso()
        }));
      } catch {
        return null;
      }
    }

    // ================= ACTIVATION =================
    let activeSite = null;
    let demoRemaining = null;

    async function activateIfNeeded() {
      if (!TOKEN) return;

      try {
        const resp = await postWithRetries(
          ACTIVATE_API,
          { token: TOKEN },
          { retries: 1, timeoutMs: 8000 }
        );

        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.site) {
          activeSite = data.site;

          if (activeSite.status === "demo") {
            demoRemaining =
              (activeSite.demo_message_limit || 0) -
              (activeSite.demo_message_used || 0);
          }
        }
      } catch (e) {
        console.warn("Activation failed", e);
      }
    }

    // ================= SEND MESSAGE =================
    let sending = false;

    async function sendMessage() {
      if (sending) return;
      const text = inputEl.value.trim();
      if (!text) return;

      addUser(text);
      inputEl.value = "";
      showTyping();
      sending = true;

      const payload = {
        sessionId,
        message: text,
        pageUrl: window.location.href,
        site: SITE_OVERRIDE,
      };

      try {
        const resp = await postWithRetries(CHAT_API, payload, {
          retries: 2,
          timeoutMs: 25000,
        });

        const data = await resp.json().catch(() => ({}));
        removeTyping();
        sending = false;

        if (!resp.ok) {
          if (resp.status === 402 || data.error === "demo_limit_reached") {
            addBot(data.message || "Demo limit reached.");
            inputEl.disabled = true;
            sendBtn.disabled = true;
            return;
          }
          if (resp.status === 429) {
            addBot(data.message || "Daily limit reached.");
            return;
          }
          addBot(data.message || "Server error.");
          return;
        }

        addBot(data.reply || data.text || "No reply");

        if (typeof data.remaining === "number") {
          demoRemaining = data.remaining;
          if (demoRemaining <= 0) {
            inputEl.disabled = true;
            sendBtn.disabled = true;
            addBot("Demo exhausted. Please upgrade.");
          }
        }
      } catch (err) {
        removeTyping();
        sending = false;
        addBot("Network error. Try again later.");
      }
    }

    // ================= UPLOAD =================
    async function uploadFile(file) {
      if (!file) return;
      addBot(`Uploading ${file.name}...`);

      const form = new FormData();
      form.append("mascot", file, file.name);

      try {
        const resp = await postWithRetries(UPLOAD_API, form, {
          isForm: true,
          retries: 2,
        });
        const data = await resp.json();

        if (resp.ok && data.url) {
          addBot(`Upload complete: ${data.url}`);
          inputEl.value = data.url;
        } else {
          addBot("Upload failed.");
        }
      } catch {
        addBot("Upload error.");
      }
    }

    // ================= OPEN / CLOSE =================
    async function tryRestore() {
      const site = SITE_OVERRIDE || location.hostname;
      const srv = await fetchServerHistory(site, sessionId);
      if (Array.isArray(srv) && srv.length) {
        history = srv;
        saveHistory(history);
        messagesEl.innerHTML = "";
        history.forEach(m =>
          messagesEl.appendChild(
            createBubble(m.role, m.role === "user" ? esc(m.text) : renderMarkdown(m.text))
          )
        );
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return true;
      }
      return false;
    }

    async function openChat() {
      wrapper.style.display = "flex";
      await activateIfNeeded();
      const restored = await tryRestore();
      if (!restored && history.length === 0) {
        addBot("Hello! How can I help you today?");
      }
      inputEl.focus();
    }

    function closeChat() {
      wrapper.style.display = "none";
    }

    // ================= EVENTS =================
    launcher.addEventListener("click", () => {
      if (wrapper.style.display === "flex") closeChat();
      else openChat();
    });

    closeBtn.addEventListener("click", closeChat);
    sendBtn.addEventListener("click", sendMessage);

    inputEl.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });

    // ================= PUBLIC API =================
    window.__mascotWidget = {
      sessionId,
      plan: EFFECTIVE_PLAN,
      open: openChat,
      close: closeChat,
      sendMessage,
      getState: () => ({
        sessionId,
        plan: EFFECTIVE_PLAN,
        activeSite,
        demoRemaining,
        history,
      }),
    };

    // auto-open
    if (location.search.includes("openmascot")) {
      setTimeout(openChat, 400);
    }
  }
})();
