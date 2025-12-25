
const launcher = document.getElementById("cb-launcher");
const panel = document.getElementById("cb-panel");
const closeBtn = document.getElementById("cb-close");
const sendBtn = document.getElementById("cb-send");
const input = document.getElementById("cb-text");
const messages = document.getElementById("messages");

launcher.onclick = () => panel.classList.remove("hidden");
closeBtn.onclick = () => panel.classList.add("hidden");

document.querySelectorAll(".cb-cards button").forEach(btn => {
  btn.onclick = () => {
    addMessage("You: " + btn.dataset.prompt);
    addMessage("Bot: (demo response)");
  };
});

sendBtn.onclick = () => {
  if (!input.value) return;
  addMessage("You: " + input.value);
  addMessage("Bot: (demo response)");
  input.value = "";
};

function addMessage(text) {
  const div = document.createElement("div");
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}
