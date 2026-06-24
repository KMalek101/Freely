#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { startInteractiveLoop } from "./interactive/loop.js";
import { startDaemon } from "./services/daemon/server.js";
import { takeScreenshot } from "./services/screenshot.js";
import { analyzeScreenshot } from "./services/ai.js";
import { ui } from "./ui/renderer.js";

const program = new Command();

program.name("freely").description("AI screen assistant");

program.command("daemon").action(async () => {
  await startDaemon();
});

program.command("trigger <action> [args...]").action(async (action: string, args: string[]) => {
  const net = await import("net");
  const os = await import("os");
  const path = await import("path");
  
  const SOCKET_PATH = process.platform === "win32" 
    ? "\\\\.\\pipe\\freely" 
    : path.join(os.tmpdir(), "freely.sock");

  const client = net.createConnection(SOCKET_PATH);
  client.on("connect", () => {
    client.write(JSON.stringify({ action, args }));
    client.end();
    process.exit(0);
  });
  client.on("error", (err) => {
    console.error("Could not connect to daemon. Is it running?", err);
    process.exit(1);
  });
});

program.command("ask").action(() => {
  console.log("Hello from Freely");
});

program.command("test-sse").action(async () => {
  const net = await import("net");
  const os = await import("os");
  const path = await import("path");
  
  const SOCKET_PATH = process.platform === "win32" 
    ? "\\\\.\\pipe\\freely" 
    : path.join(os.tmpdir(), "freely.sock");

  const client = net.createConnection(SOCKET_PATH);
  client.on("connect", () => {
    client.write(JSON.stringify({ action: "emit-test" }));
    client.end();
    process.exit(0);
  });
});

program.command("screenshot [question]").action(async (question?: string) => {
  try {
    ui.showStatus("capturing");
    const path = await takeScreenshot();

    ui.showStatus("analyzing");
    let fullResponse = "";
    for await (const chunk of analyzeScreenshot(path, question)) {
      fullResponse += chunk;
    }

    ui.showStatus("complete");
    ui.renderResponse(fullResponse);
  } catch (e) {
    ui.showStatus("failed", e instanceof Error ? e.message : String(e));
  }
});

if (process.argv.length === 2) {
  startInteractiveLoop();
} else {
  program.parse();
}
