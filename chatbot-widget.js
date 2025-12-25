/* chatbot-widget.js — BASELINE + EDIT LAST MESSAGE + ICON POLISH */

(function () {
  "use strict";

  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const KEY_SESSION = "mascot_session_id_v1";
  const DEMO_LEFT = window.__MASCOT_DEMO_REMAINING;

  const esc = s => s ? s.replace(/[&<>]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])) : "";

  function getSession(){
    let s=localStorage.getItem(KEY_SESSION);
    if(!s){
      s="sess-"+Math.random().toString(36).slice(2);
      localStorage.setItem(KEY_SESSION,s);
    }
    return s;
  }

  const sessionId=getSession();
  document.addEventListener("DOMContentLoaded",init);

  function init(){

    let isSending=false;
    let isVoiceActive=false;
    let lastUserMsgEl=null;
    let lastUserText="";

    /* ---------- Launcher ---------- */
    const launcher=document.createElement("button");
    launcher.className="cb-launcher";
    launcher.innerHTML=`<svg viewBox="0 0 24 24"><path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>`;
    document.body.appendChild(launcher);

    /* ---------- Widget ---------- */
    const wrapper=document.createElement("div");
    wrapper.className="cb-wrapper";
    wrapper.innerHTML=`
      <div class="cb-card">
        <div class="cb-header">
          <div class="cb-header-left">
            <div class="cb-ai-icon">
              <svg viewBox="0 0 24 24"><path d="M12 2l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>
            </div>
            AI Assistant
            ${DEMO_LEFT!=null?`<span class="cb-plan">· Demo ${DEMO_LEFT} left</span>`:""}
          </div>
          <button id="cb-close">×</button>
        </div>

        <div class="cb-body">
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
            <button id="cb-upload" title="Upload">
              <svg viewBox="0 0 24 24"><path d="M12 16V4M12 4l-4 4M12 4l4 4M4 20h16"/></svg>
            </button>
            <button id="cb-mic" title="Voice">
              <svg viewBox="0 0 24 24">
                <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"/>
                <path d="M19 11a7 7 0 01-14 0"/>
              </svg>
            </button>
            <input id="cb-input" placeholder="Message…" />
            <button id="cb-send" class="cb-send-btn" title="Send">
              <svg viewBox="0 0 24 24"><path d="M4 20l16-8L4 4v6l9 2-9 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const msgs=wrapper.querySelector("#msgs");
    const input=wrapper.querySelector("#cb-input");
    const sendBtn=wrapper.querySelector("#cb-send");
    const micBtn=wrapper.querySelector("#cb-mic");
    const uploadBtn=wrapper.querySelector("#cb-upload");
    const intro=wrapper.querySelector("#cb-intro");

    function removeIntro(){ if(intro) intro.remove(); }

    launcher.onclick=()=>{wrapper.style.display="flex";input.focus();};
    wrapper.querySelector("#cb-close").onclick=()=>wrapper.style.display="none";

    /* ---------- Send ---------- */
    async function send(text){
      if(isSending) return;
      isSending=true;
      removeIntro();

      const user=document.createElement("div");
      user.className="cb-msg cb-msg-user";
      user.textContent=text;

      const editBtn=document.createElement("span");
      editBtn.className="cb-edit-btn";
      editBtn.innerHTML=`<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4z"/></svg>`;
      user.appendChild(editBtn);

      msgs.appendChild(user);
      lastUserMsgEl=user;
      lastUserText=text;

      editBtn.onclick=()=>{
        input.value=lastUserText;
        user.remove();
        isSending=false;
        input.focus();
      };

      input.value="";

      const bot=document.createElement("div");
      bot.className="cb-msg cb-msg-bot";
      bot.innerHTML=`<span class="cb-cursor">▍</span>`;
      msgs.appendChild(bot);

      try{
        const r=await fetch(CHAT_API,{
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ sessionId,message:text })
        });
        bot.innerHTML="";
        const j=await r.json();
        bot.innerHTML=esc(j.reply||j.message||"No response");
      }catch{
        bot.textContent="Network error.";
      }finally{
        isSending=false;
        input.focus();
      }
    }

    sendBtn.onclick=()=>input.value.trim()&&send(input.value.trim());
    input.onkeydown=e=>{
      if(e.key==="Enter"&&input.value.trim()){
        e.preventDefault();
        send(input.value.trim());
      }
    };

    /* ---------- Voice ---------- */
    const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(SpeechAPI){
      const recog=new SpeechAPI();
      recog.lang="en-US";
      recog.continuous=true;

      micBtn.onclick=()=>{
        isVoiceActive=!isVoiceActive;
        micBtn.classList.toggle("cb-mic-active",isVoiceActive);
        isVoiceActive?recog.start():recog.stop();
      };

      recog.onresult=e=>{
        const t=e.results[e.results.length-1][0].transcript.trim();
        if(t) send(t);
      };

      recog.onend=()=>isVoiceActive&&recog.start();
    }

    /* ---------- Upload ---------- */
    const fileInput=document.createElement("input");
    fileInput.type="file";
    fileInput.multiple=true;
    fileInput.style.display="none";
    document.body.appendChild(fileInput);

    uploadBtn.onclick=()=>fileInput.click();
    fileInput.onchange=e=>{
      [...e.target.files].forEach(f=>{
        removeIntro();
        const card=document.createElement("div");
        card.className="cb-file";
        card.innerHTML=`<strong>${f.name}</strong><br><small>Uploading…</small>`;
        msgs.appendChild(card);

        const fd=new FormData();
        fd.append("mascot",f,f.name);
        fetch(UPLOAD_API,{method:"POST",body:fd})
          .then(()=>card.querySelector("small").textContent="Uploaded")
          .catch(()=>card.querySelector("small").textContent="Upload failed");
      });
    };
  }
})();
