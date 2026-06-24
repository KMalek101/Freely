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

program.command("ask <question...>").action(async (question: string[]) => {
  const net = await import("net");
  const os = await import("os");
  const path = await import("path");
  
  const SOCKET_PATH = process.platform === "win32" 
    ? "\\\\.\\pipe\\freely" 
    : path.join(os.tmpdir(), "freely.sock");

  const client = net.createConnection(SOCKET_PATH);
  client.on("connect", () => {
    client.write(JSON.stringify({ action: "ask", args: question }));
    client.end();
    process.exit(0);
  });
});

program.command("screenshot [question]").action(async (question?: string) => {
  const net = await import("net");
  const os = await import("os");
  const path = await import("path");
  
  const SOCKET_PATH = process.platform === "win32" 
    ? "\\\\.\\pipe\\freely" 
    : path.join(os.tmpdir(), "freely.sock");

  const client = net.createConnection(SOCKET_PATH);
  client.on("connect", () => {
    client.write(JSON.stringify({ action: "screenshot", args: question ? [question] : [] }));
    client.end();
    process.exit(0);
  });
});

if (process.argv.length === 2) {
  startInteractiveLoop();
} else {
  program.parse();
}
