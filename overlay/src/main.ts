import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();
const content = document.getElementById("content")!;
const loader = document.getElementById("loader")!;
const messages = document.getElementById("messages")!;
const minBtn = document.getElementById("minBtn")!;
const closeBtn = document.getElementById("closeBtn")!;

minBtn.addEventListener("click", () => win.minimize());
closeBtn.addEventListener("click", () => win.close());

const eventSource = new EventSource("http://localhost:3001/events");

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Hide loader on first message
  if (loader) {
    loader.style.display = "none";
  }

  if (data.type === "ai-chunk") {
    const span = document.createElement("span");
    span.textContent = data.content;
    messages.appendChild(span);
  }
};
