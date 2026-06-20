import net from "net";
import fs from "fs";
import os from "os";
import path from "path";
import { takeScreenshot } from "../screenshot.js";
import { analyzeScreenshot } from "../ai.js";
import { ui } from "../../ui/renderer.js";

const SOCKET_PATH =
  process.platform === "win32"
    ? "\\\\.\\pipe\\freely"
    : path.join(os.tmpdir(), "freely.sock");

export async function startDaemon() {
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  const server = net.createServer((socket) => {
    socket.on("data", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log("Received command:", message);

        const actions: Record<string, (args: string[]) => Promise<void>> = {
          screenshot: handleScreenshotTrigger,
        };

        if (message.action && actions[message.action]) {
          const action = actions[message.action];

          if (!action) {
            console.error(`Unknown action: ${message.action}`);
            return;
          }

          await action(message.args || []);
        } else {
          console.error("Unknown action:", message.action);
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });
  });

  server.listen(SOCKET_PATH, () => {
    console.log(`Daemon listening on ${SOCKET_PATH}`);
  });
  server.on("error", (err) => {
    console.error("Server error:", err);
  });
  server.on("connection", (socket) => {
    console.log("Client connected");
  });
}

async function handleScreenshotTrigger(args: string[]) {
  // This is currently hardcoded but the server structure is generic
  try {
    ui.showStatus("capturing");
    const path = await takeScreenshot();

    ui.showStatus("analyzing");
    let fullResponse = "";
    for await (const chunk of analyzeScreenshot(path, args[0])) {
      fullResponse += chunk;
    }

    ui.showStatus("complete");
    ui.renderResponse(fullResponse);
  } catch (e) {
    ui.showStatus("failed", e instanceof Error ? e.message : String(e));
  }
}
