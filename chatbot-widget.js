/* chatbot-widget.js — BASELINE PRESERVED + META START + FOLLOWUPS + EMOJI */

(function () {
  "use strict";

  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const KEY_SESSION = "mascot_session_id_v1";

  const DEMO_LEFT = window.__MASCOT_DEMO_REMAINING;

  const esc = s =>
    s ? s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) : "";

  function getSession() {
    let s = localStorage.getItem(KEY_SESSION);
    if (!s) {
      s = "sess-" + Math.random().toString(36).slice(2);
      localStorage.setItem(KEY_SESSION, s);
    }
    return s;
  }

  const sessionId = getSession();
  document.addEventListener("DOMContentLoaded", init);

  function init() {

    /* ---------- Launcher ---------- */
    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML =
      `<svg viewBox="0 0 24 24"><path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>`;
    document.body.appendChild(launcher);

    /* ---------- Widget ---------- */
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
            ${DEMO_LEFT != null ? `<span class="cb-plan">· Demo ${DEMO_LEFT} left</span>` : ""}
          </div>
          <button id="cb-close">×</button>
        </div>

        <div class="cb-body" id="cb-body">
          <div class="cb-orb" id="cb-orb"></div>
          <div class="cb-drop" id="cb-drop">Drop file to upload</div>
          <div class="cb-messages" id="msgs"></div>
        </div>

        <div class="cb-footer">
          <div class="cb-context">🔒 Using this page content to answer</div>
          <div class="cb-input-shell">
            <button id="cb-emoji-btn">😊</button>
            <button id="cb-upload">
              <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"/></svg>
            </button>
            <button id="cb-mic">
              <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z"/></svg>
            </button>
            <input id="cb-input" type="text" placeholder="Message…" />
            <button id="cb-send" class="cb-send-btn">
              <svg viewBox="0 0 24 24"><path d="M4 20l16-8L4 4v6l9 2-9 2z"/></svg>
            </button>
          </div>
          <div class="cb-emoji" id="cb-emoji">
            😀 😅 😂 🤔 👍 🎉 🚀 🔥 💡 ❤️
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    /* ---------- Elements ---------- */
    const msgs = wrapper.querySelector("#msgs");
    const input = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");
    const uploadBtn = wrapper.querySelector("#cb-upload");
    const micBtn = wrapper.querySelector("#cb-mic");
    const emojiBtn = wrapper.querySelector("#cb-emoji-btn");
    const emojiBox = wrapper.querySelector("#cb-emoji");
    const orb = wrapper.querySelector("#cb-orb");
    const drop = wrapper.querySelector("#cb-drop");
    const body = wrapper.querySelector("#cb-body");

    let firstMessageSent = false;

    /* ---------- Initial Greeting ---------- */
    function showInitialGreeting() {
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-bot";
      d.textContent = "Hello! I'm your AI assistant. How can I help you today?";
      msgs.appendChild(d);
    }

    /* ---------- Upload ---------- */
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = e => handleFile(e.target.files[0]);

    function handleFile(f) {
      if (!f) return;
      addBot(`Uploading ${f.name}…`);
      const fd = new FormData();
      fd.append("mascot", f, f.name);
      fetch(UPLOAD_API, { method: "POST", body: fd })
        .then(() => addBot("Upload complete."));
    }

    /* ---------- Drag & Drop ---------- */
    body.addEventListener("dragover", e => {
      e.preventDefault();
      drop.classList.add("active");
    });
    body.addEventListener("dragleave", () => drop.classList.remove("active"));
    body.addEventListener("drop", e => {
      e.preventDefault();
      drop.classList.remove("active");
      handleFile(e.dataTransfer.files[0]);
    });

    /* ---------- Open / Close ---------- */
    launcher.onclick = () => {
      wrapper.style.display = "flex";
      if (!msgs.hasChildNodes()) {
        orb.classList.remove("hidden");
        showInitialGreeting();
      }
      input.focus();
    };
    wrapper.querySelector("#cb-close").onclick = () => wrapper.style.display = "none";

    /* ---------- Messages ---------- */
    function addUser(t) {
      firstMessageSent = true;
      orb.classList.add("hidden");
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-user";
      d.textContent = t;
      msgs.appendChild(d);
    }

    function addBot(t) {
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-bot";
      d.innerHTML = esc(t);
      msgs.appendChild(d);

      const f = document.createElement("div");
      f.className = "cb-followups";
      ["Summarize this", "Give examples", "Explain simply"].forEach(x => {
        const b = document.createElement("button");
        b.textContent = x;
        b.onclick = () => send(x);
        f.appendChild(b);
      });
      msgs.appendChild(f);

      msgs.scrollTop = msgs.scrollHeight;
    }

    async function send(text) {
      addUser(text);
      input.value = "";

      try {
        const r = await fetch(CHAT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: text })
        });

        if (r.body) {
          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          let bot = document.createElement("div");
          bot.className = "cb-msg cb-msg-bot";
          msgs.appendChild(bot);

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bot.innerHTML += esc(decoder.decode(value));
            msgs.scrollTop = msgs.scrollHeight;
          }
        } else {
          const j = await r.json();
          addBot(j.reply || j.message || "No response");
        }
      } catch {
        addBot("Network error.");
      }
    }

    sendBtn.onclick = () => input.value.trim() && send(input.value.trim());
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && input.value.trim()) {
        send(input.value.trim());
      }
    });

    /* ---------- Emoji ---------- */
    emojiBtn.onclick = () => {
      emojiBox.style.display = emojiBox.style.display === "flex" ? "none" : "flex";
    };
    emojiBox.onclick = e => {
      if (e.target.nodeType === 3) {
        input.value += e.target.textContent.trim();
      }
    };

    /* ---------- Voice (UNCHANGED LOGIC) ---------- */
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechAPI) {
      const recog = new SpeechAPI();
      recog.lang = "en-US";
      recog.continuous = true;
      let voiceOn = false;

      micBtn.onclick = () => {
        voiceOn = !voiceOn;
        micBtn.classList.toggle("cb-mic-active", voiceOn);
        voiceOn ? recog.start() : recog.stop();
      };

      recog.onresult = e => {
        const t = e.results[e.results.length - 1][0].transcript.trim();
        if (t) send(t);
      };

      recog.onend = () => voiceOn && recog.start();
    }
  }
})();
