import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();
const transcripts = document.getElementById("transcripts")!;
const minBtn = document.getElementById("panelMinBtn")!;
const closeBtn = document.getElementById("panelCloseBtn")!;

minBtn.addEventListener("click", () => win.minimize());
closeBtn.addEventListener("click", () => win.close());

function appendTranscript(content: string) {
  const entry = document.createElement("div");
  entry.className = "transcript-entry";
  entry.textContent = content;
  transcripts.appendChild(entry);
  transcripts.scrollTop = transcripts.scrollHeight;
}

const eventSource = new EventSource("http://localhost:3001/events");

eventSource.onmessage = (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  if (data.type === "transcript") {
    appendTranscript(data.content);
  }
};

eventSource.onerror = () => {
  appendTranscript("[Connection lost]");
};
