import net from "net";
import fs from "fs";
import os from "os";
import path from "path";
import { takeScreenshot } from "../screenshot.js";
import { analyzeScreenshot } from "../ai.js";
import { ui } from "../../ui/renderer.js";

import { startSseServer, eventBus } from "./sseServer.js";
import { askAI } from "../ai.js";
import { startAudioCapture, stopAudioCapture } from "../audio-capture.js";

const SOCKET_PATH =
  process.platform === "win32"
    ? "\\\\.\\pipe\\freely"
    : path.join(os.tmpdir(), "freely.sock");

export async function startDaemon() {
  startSseServer();
  startAudioCapture();

  process.on("SIGINT", () => {
    stopAudioCapture();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopAudioCapture();
    process.exit(0);
  });

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
          "emit-test": async () => {
            eventBus.emit("message", { type: "message", content: "Hello from CLI" });
          },
          ask: async (args: string[]) => {
            const question = args.join(" ");
            for await (const chunk of askAI(question)) {
              eventBus.emit("message", { type: "ai-chunk", content: chunk });
            }
          },
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
  try {
    const path = await takeScreenshot();

    const question = args[0] || "";
    for await (const chunk of analyzeScreenshot(path, question)) {
      eventBus.emit("message", { type: "ai-chunk", content: chunk });
    }
  } catch (e) {
    eventBus.emit("message", { type: "error", content: e instanceof Error ? e.message : String(e) });
  }
}
