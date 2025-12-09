// chatbot-widget.js
(function () {

    const API_URL = "https://mascot.academictechnexus.com/api/message";
    const sessionId = "sess_" + Math.random().toString(36).substr(2, 9);

    // Inject CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://academictechnexus.com/chatbot/chatbot-widget.css";
    document.head.appendChild(css);

    // Floating button
    const btn = document.createElement("div");
    btn.className = "chatbot-launcher";
    btn.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/134/134914.png" />`;
    document.body.appendChild(btn);

    // Chat window
    const frame = document.createElement("div");
    frame.className = "chatbot-window";
    frame.innerHTML = `
        <div class="chatbot-header">Chat Support</div>
        <div class="chatbot-messages" id="cb-messages"></div>
        <div class="chatbot-input-area">
            <input id="cb-input" placeholder="Type your message..." />
            <button id="cb-send">Send</button>
        </div>
    `;
    document.body.appendChild(frame);

    // Toggle chat window
    btn.onclick = () => {
        frame.style.display = frame.style.display === "flex" ? "none" : "flex";
    };

    const messagesEl = document.getElementById("cb-messages");
    const inputEl = document.getElementById("cb-input");
    const sendEl = document.getElementById("cb-send");

    function addMessage(text, sender) {
        const div = document.createElement("div");
        div.className = "msg " + (sender === "user" ? "msg-user" : "msg-bot");
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function sendMessage() {
        const text = inputEl.value.trim();
        if (!text) return;

        addMessage(text, "user");
        inputEl.value = "";

        addMessage("Typing...", "bot");

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, sessionId })
            });

            const data = await res.json();

            // Remove "typing..."
            messagesEl.querySelector(".msg-bot:last-child").remove();

            addMessage(data.text, "bot");

        } catch (err) {
            console.error(err);
            messagesEl.querySelector(".msg-bot:last-child").remove();
            addMessage("? Error connecting to server", "bot");
        }
    }

    sendEl.onclick = sendMessage;
    inputEl.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

})();
