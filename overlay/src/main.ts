import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();
const loader = document.getElementById("loader")!;
const messages = document.getElementById("messages")!;
const minBtn = document.getElementById("minBtn")!;
const closeBtn = document.getElementById("closeBtn")!;

minBtn.addEventListener("click", () => win.minimize());
closeBtn.addEventListener("click", () => win.close());

function appendMessage(content: string) {
  const entry = document.createElement("div");
  entry.className = "message-entry";
  entry.textContent = content;
  messages.appendChild(entry);
  messages.scrollTop = messages.scrollHeight;
}

const eventSource = new EventSource("http://localhost:3001/events");

eventSource.onmessage = (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (loader && !loader.classList.contains("hidden")) {
    loader.classList.add("hidden");
  }

  if (data.type === "ai-chunk") {
    appendMessage(data.content);
  }
};

eventSource.onerror = () => {
  appendMessage("[Connection lost]");
};
