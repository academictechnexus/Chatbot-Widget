// chatbot-widget.js
(function () {
  // ---- CONFIG ----
  // Make sure this is your correct HTTPS backend URL
  const API_URL = "https://mascot.academictechnexus.com/chat";

  // Get or create a persistent session ID per browser
  function getOrCreateSessionId() {
    const KEY = "mascot_session_id";
    try {
      const existing = localStorage.getItem(KEY);
      if (existing) return existing;
      const id = "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(KEY, id);
      return id;
    } catch (e) {
      // If localStorage fails, fall back to random per load
      return "sess-" + Math.random().toString(36).slice(2) + "-" + Date.now();
    }
  }
  const sessionId = getOrCreateSessionId();

  // Resolve CSS path based on where this script is hosted
  const scriptEl =
    document.currentScript ||
    document.querySelector('script[src*="chatbot-widget"]');
  const cssHref = scriptEl
    ? new URL("chatbot-widget.css", scriptEl.src).href
    : "chatbot-widget.css";

  // ---- INJECT CSS ----
  const cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = cssHref;
  document.head.appendChild(cssLink);

  // ---- CREATE LAUNCHER BUTTON ----
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "cb-launcher";

  // simple chat icon as inline SVG (no external assets)
  launcher.innerHTML = `
    <span class="cb-launcher-icon">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5l-3.5 3.5A1 1 0 0 1 8 18v-3H7a3 3 0 0 1-3-3V5z"/>
      </svg>
    </span>
  `;
  document.body.appendChild(launcher);

  // ---- CREATE CHAT WINDOW ----
  const wrapper = document.createElement("div");
  wrapper.className = "cb-wrapper";
  wrapper.innerHTML = `
    <div class="cb-card">
      <div class="cb-header">
        <span class="cb-title">AI Assistant</span>
        <button type="button" class="cb-close" aria-label="Close chat">×</button>
      </div>
      <div class="cb-body">
        <div class="cb-messages" id="cb-messages"></div>
      </div>
      <div class="cb-footer">
        <div class="cb-input-shell">
          <input id="cb-input" type="text" placeholder="Type your message..." />
          <button id="cb-send" type="button" class="cb-send-btn" aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20l16-8L4 4v5l9 3-9 3v5z"/>
            </svg>
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

  let isOpen = false;
  let hasGreeted = false;
  let sending = false;

  function toggleChat() {
    isOpen = !isOpen;
    wrapper.style.display = isOpen ? "flex" : "none";

    if (isOpen && !hasGreeted) {
      addMessage(
        "Hello! I'm your AI assistant. How can I help you today?",
        "bot"
      );
      hasGreeted = true;
      inputEl.focus();
    }
  }

  launcher.addEventListener("click", toggleChat);
  closeBtn.addEventListener("click", toggleChat);

  // ---- MESSAGE HELPERS ----
  function addMessage(text, sender) {
    const bubble = document.createElement("div");
    bubble.className =
      "cb-msg " + (sender === "user" ? "cb-msg-user" : "cb-msg-bot");
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addTyping() {
    const bubble = document.createElement("div");
    bubble.className = "cb-msg cb-msg-bot cb-typing";
    bubble.innerHTML = `
      <span class="cb-typing-dot"></span>
      <span class="cb-typing-dot"></span>
      <span class="cb-typing-dot"></span>
    `;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const typing = messagesEl.querySelector(".cb-typing");
    if (typing) typing.remove();
  }

  // Figure out site identifier (supports data-site override for demos / trials)
  const siteOverride = scriptEl && scriptEl.dataset ? scriptEl.dataset.site : null;
  const siteId =
    siteOverride && siteOverride.trim()
      ? siteOverride.trim()
      : window.location.hostname;

  // ---- SEND MESSAGE (with RAG context + limit handling) ----
  async function sendMessage() {
    if (sending) return;
    const text = inputEl.value.trim();
    if (!text) return;

    sending = true;
    addMessage(text, "user");
    inputEl.value = "";
    addTyping();

    // light RAG-style context from the current page
    const pageUrl = window.location.href;
    const title = document.title || "";
    const metaDescription = Array.from(
      document.querySelectorAll("meta[name='description']")
    )
      .map((m) => m.content)
      .join(" ");
    const bodyText = (document.body?.innerText || "")
      .replace(/\s+/g, " ")
      .slice(0, 1200);

    const context = [
      `PAGE TITLE: ${title}`,
      `META: ${metaDescription}`,
      `URL: ${pageUrl}`,
      `SNIPPET: ${bodyText}`,
    ].join("\n\n");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          text,
          pageUrl,
          site: siteId,
          context,
        }),
      });

      const data = await res.json().catch(() => ({}));
      removeTyping();

      // daily limit hit
      if (res.status === 429) {
        addMessage(
          data.message ||
            "Daily chat limit has been reached for this site. Please try again tomorrow.",
          "bot"
        );
        inputEl.disabled = true;
        sendBtn.disabled = true;
        return;
      }

      if (res.ok && data && (data.reply || data.text)) {
        const replyText = data.reply || data.text;
        addMessage(replyText, "bot");
      } else {
        console.error("Bad response from backend:", data);
        addMessage(
          "Sorry, I couldn't get a response from the server.",
          "bot"
        );
      }
    } catch (err) {
      console.error("Request failed:", err);
      removeTyping();
      addMessage(
        "Network error: please try again in a moment.",
        "bot"
      );
    } finally {
      sending = false;
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
})();
