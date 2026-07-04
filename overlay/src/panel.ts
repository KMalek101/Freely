import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";

const win = getCurrentWindow();
const transcripts = document.getElementById("transcripts")!;
const minBtn = document.getElementById("panelMinBtn")!;
const closeBtn = document.getElementById("panelCloseBtn")!;
const handle = document.querySelector(".resize-handle") as HTMLElement | null;

minBtn.addEventListener("click", () => win.minimize());
closeBtn.addEventListener("click", () => win.close());

// Resize handle
if (handle) {
  let dragging = false, sx = 0, sy = 0, sw = 0, sh = 0;
  handle.addEventListener("mousedown", (e: MouseEvent) => {
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    Promise.all([win.outerSize(), win.outerPosition()]).then(([size]) => {
      sw = size.width;
      sh = size.height;
    });
  });
  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;
    const w = Math.max(200, sw + e.clientX - sx);
    const h = Math.max(200, sh + e.clientY - sy);
    win.setSize(new PhysicalSize(w, h));
  });
  document.addEventListener("mouseup", () => { dragging = false; });
}

// Transcript display
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

// Canvas waveform animation
const canvas = document.getElementById("waveform") as HTMLCanvasElement | null;
if (canvas) {
  const ctx = canvas.getContext("2d")!;
  const barCount = 13;
  const barWidth = 3;
  const gap = 3;
  const maxHeight = 32;
  const phases = [0.00, 0.10, 0.20, 0.15, 0.30, 0.05, 0.25, 0.35, 0.10, 0.20, 0.40, 0.15, 0.05];

  function draw() {
    const cvs = canvas!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    const t = performance.now() / 1000 * 5.71;
    for (let i = 0; i < barCount; i++) {
      const amplitude = 0.675 + 0.325 * Math.sin(t + phases[i] * Math.PI * 2);
      const h = maxHeight * amplitude;
      const x = i * (barWidth + gap);
      const y = cvs.height - h;
      ctx.fillStyle = "#E8A44A";
      ctx.fillRect(x, y, barWidth, h + 1);
    }
    requestAnimationFrame(draw);
  }
  draw();
}
