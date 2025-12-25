/* chatbot-widget.js — FULL BASELINE PRESERVED + META POLISH (SAFE) */

(function () {
  "use strict";

  /* ================= CONFIG (UNCHANGED) ================= */
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

    /* ================= LAUNCHER ================= */
    const launcher = document.createElement("button");
    launcher.className = "cb-launcher";
    launcher.innerHTML =
      `<svg viewBox="0 0 24 24"><path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>`;
    document.body.appendChild(launcher);

    /* ================= WIDGET ================= */
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
          <div class="cb-intro" id="cb-intro">
            <h2>Hello!</h2>
            <p>I’m your AI assistant. How can I help you today?</p>
            <div class="cb-orb"></div>
          </div>

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
            <span>😀</span><span>😅</span><span>😂</span><span>🤔</span>
            <span>👍</span><span>🎉</span><span>🚀</span><span>🔥</span>
            <span>💡</span><span>❤️</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    /* ================= ELEMENTS ================= */
    const msgs = wrapper.querySelector("#msgs");
    const input = wrapper.querySelector("#cb-input");
    const sendBtn = wrapper.querySelector("#cb-send");
    const uploadBtn = wrapper.querySelector("#cb-upload");
    const micBtn = wrapper.querySelector("#cb-mic");
    const emojiBtn = wrapper.querySelector("#cb-emoji-btn");
    const emojiBox = wrapper.querySelector("#cb-emoji");
    const intro = wrapper.querySelector("#cb-intro");
    const body = wrapper.querySelector("#cb-body");

    function removeIntro() {
      if (intro) intro.remove();
    }

    /* ================= OPEN / CLOSE ================= */
    launcher.onclick = () => {
      wrapper.style.display = "flex";
      input.focus();
    };
    wrapper.querySelector("#cb-close").onclick = () => wrapper.style.display = "none";

    /* ================= MESSAGE HELPERS ================= */
    function addUser(t) {
      removeIntro();
      const d = document.createElement("div");
      d.className = "cb-msg cb-msg-user";
      d.textContent = t;
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
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

    /* ================= FILE UPLOAD (CARD STYLE) ================= */
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    uploadBtn.onclick = () => fileInput.click();

    fileInput.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      removeIntro();

      const card = document.createElement("div");
      card.className = "cb-file";
      card.innerHTML = `<strong>📄 ${f.name}</strong><div>Uploading…</div>`;
      msgs.appendChild(card);
      msgs.scrollTop = msgs.scrollHeight;

      const fd = new FormData();
      fd.append("mascot", f, f.name);
      fetch(UPLOAD_API, { method: "POST", body: fd })
        .then(() => card.querySelector("div").textContent = "Uploaded")
        .catch(() => card.querySelector("div").textContent = "Upload failed");
    };

    body.addEventListener("dragover", e => e.preventDefault());
    body.addEventListener("drop", e => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        fileInput.onchange({ target: fileInput });
      }
    });

    /* ================= SEND ================= */
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
      if (e.key === "Enter" && input.value.trim()) send(input.value.trim());
    });

    /* ================= EMOJI (FIXED) ================= */
    emojiBtn.onclick = () => {
      emojiBox.style.display = emojiBox.style.display === "flex" ? "none" : "flex";
    };
    emojiBox.onclick = e => {
      if (e.target.tagName === "SPAN") {
        input.value += e.target.textContent;
        input.focus();
      }
    };

    /* ================= VOICE WITH PREVIEW ================= */
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechAPI) {
      const recog = new SpeechAPI();
      recog.lang = "en-US";
      recog.continuous = true;
      recog.interimResults = true;

      let voiceOn = false;
      let preview = null;

      micBtn.onclick = () => {
        voiceOn = !voiceOn;
        micBtn.classList.toggle("cb-mic-active", voiceOn);
        voiceOn ? recog.start() : recog.stop();
      };

      recog.onresult = e => {
        removeIntro();
        const txt = e.results[e.results.length - 1][0].transcript;
        if (!preview) {
          preview = document.createElement("div");
          preview.className = "cb-voice-preview";
          msgs.appendChild(preview);
        }
        preview.textContent = txt;

        if (e.results[e.results.length - 1].isFinal) {
          preview.remove();
          preview = null;
          send(txt.trim());
        }
      };

      recog.onend = () => voiceOn && recog.start();
    }
  }
})();
