/* chatbot-widget.js — BASELINE + TYPING CURSOR + MULTI FILE UPLOAD */

(function () {
  "use strict";

  const API_BASE = window.__MASCOT_API_BASE || "https://mascot.academictechnexus.com";
  const CHAT_API = `${API_BASE}/chat`;
  const UPLOAD_API = `${API_BASE}/mascot/upload`;
  const KEY_SESSION = "mascot_session_id_v1";
  const DEMO_LEFT = window.__MASCOT_DEMO_REMAINING;

  const esc=s=>s?s.replace(/[&<>]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])):"";

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
            <button id="cb-emoji-btn" title="Emoji">😊</button>
            <button id="cb-upload" title="Upload files">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4M4 20h16"/>
              </svg>
            </button>
            <button id="cb-mic" title="Voice input">
              <svg viewBox="0 0 24 24">
                <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"/>
                <path d="M19 11a7 7 0 01-14 0"/>
              </svg>
            </button>
            <input id="cb-input" placeholder="Message…" />
            <button id="cb-send" class="cb-send-btn">
              <svg viewBox="0 0 24 24"><path d="M4 20l16-8L4 4v6l9 2-9 2z"/></svg>
            </button>
          </div>
          <div class="cb-emoji" id="cb-emoji">
            <span>😀</span><span>😂</span><span>😍</span><span>🤔</span>
            <span>👍</span><span>🎉</span><span>🚀</span><span>🔥</span>
            <span>💡</span><span>❤️</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const msgs=wrapper.querySelector("#msgs");
    const input=wrapper.querySelector("#cb-input");
    const sendBtn=wrapper.querySelector("#cb-send");
    const emojiBtn=wrapper.querySelector("#cb-emoji-btn");
    const emojiBox=wrapper.querySelector("#cb-emoji");
    const micBtn=wrapper.querySelector("#cb-mic");
    const uploadBtn=wrapper.querySelector("#cb-upload");
    const intro=wrapper.querySelector("#cb-intro");

    function removeIntro(){ if(intro) intro.remove(); }

    launcher.onclick=()=>{wrapper.style.display="flex";input.focus();};
    wrapper.querySelector("#cb-close").onclick=()=>wrapper.style.display="none";

    /* ---------- Emoji ---------- */
    emojiBtn.onclick=()=>emojiBox.style.display=emojiBox.style.display==="flex"?"none":"flex";
    emojiBox.onclick=e=>{
      if(e.target.tagName==="SPAN"){
        input.value+=e.target.textContent;
        input.focus();
      }
    };

    /* ---------- Multi-file upload ---------- */
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
        card.innerHTML=`<strong>📄 ${f.name}</strong><br><small>Uploading…</small>`;
        msgs.appendChild(card);

        const fd=new FormData();
        fd.append("mascot",f,f.name);
        fetch(UPLOAD_API,{method:"POST",body:fd})
          .then(()=>card.querySelector("small").textContent="Uploaded")
          .catch(()=>card.querySelector("small").textContent="Upload failed");
      });
      msgs.scrollTop=msgs.scrollHeight;
    };

    /* ---------- Send ---------- */
    async function send(text){
      removeIntro();
      const u=document.createElement("div");
      u.className="cb-msg cb-msg-user";
      u.textContent=text;
      msgs.appendChild(u);
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

        if(r.body){
          const reader=r.body.getReader();
          const decoder=new TextDecoder();
          bot.innerHTML="";
          while(true){
            const {value,done}=await reader.read();
            if(done) break;
            bot.innerHTML+=esc(decoder.decode(value)) + `<span class="cb-cursor">▍</span>`;
            msgs.scrollTop=msgs.scrollHeight;
          }
        }else{
          const j=await r.json();
          bot.textContent=j.reply||j.message||"No response";
        }
      }catch{
        bot.textContent="Network error.";
      }
    }

    sendBtn.onclick=()=>input.value.trim()&&send(input.value.trim());
    input.onkeydown=e=>e.key==="Enter"&&input.value.trim()&&send(input.value.trim());

    /* ---------- Voice ---------- */
    const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(SpeechAPI){
      const recog=new SpeechAPI();
      recog.lang="en-US";
      recog.continuous=true;
      recog.interimResults=true;

      let voiceOn=false;
      let preview=null;

      micBtn.onclick=()=>{
        voiceOn=!voiceOn;
        micBtn.classList.toggle("cb-mic-active",voiceOn);
        voiceOn?recog.start():recog.stop();
      };

      recog.onresult=e=>{
        removeIntro();
        const txt=e.results[e.results.length-1][0].transcript;
        if(!preview){
          preview=document.createElement("div");
          preview.className="cb-msg cb-msg-bot";
          preview.style.fontStyle="italic";
          msgs.appendChild(preview);
        }
        preview.textContent=txt;
        if(e.results[e.results.length-1].isFinal){
          preview.remove();
          preview=null;
          send(txt.trim());
        }
      };

      recog.onend=()=>voiceOn&&recog.start();
    }
  }
})();
