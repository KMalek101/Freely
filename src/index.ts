#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { execFileSync } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { startInteractiveLoop } from "./interactive/loop.js";
import { startDaemon } from "./services/daemon/server.js";
import { takeScreenshot } from "./services/screenshot.js";
import { analyzeScreenshot } from "./services/ai.js";
import { ui } from "./ui/renderer.js";

const program = new Command();

program.name("freely").description("AI screen assistant");

interface AudioSource {
  name: string;
  state: string;
}

function listAudioSources(): AudioSource[] {
  const stdout = execFileSync("pactl", ["list", "sources", "short"], {
    timeout: 5000,
    encoding: "utf-8",
  });
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return { name: parts[1] ?? "", state: parts[3] ?? "" };
    });
}

async function ensureDevice() {
  const configDir = join(homedir(), ".config", "freely");
  const configPath = join(configDir, "config.json");

  try {
    const existing = JSON.parse(await readFile(configPath, "utf-8"));
    if (existing.device) return;
  } catch {}

  let devices: AudioSource[];
  try {
    devices = listAudioSources();
  } catch {
    console.error("Could not list audio sources. Is PipeWire/PulseAudio running?");
    process.exit(1);
  }

  if (devices.length === 0) {
    console.error("No audio sources found.");
    process.exit(1);
  }

  const { select } = await import("@clack/prompts");
  const device = await select({
    message: "Select an audio source to monitor:",
    options: devices.map((d) => ({
      label: `${d.name}  (${d.state})`,
      value: d.name,
    })),
  });

  if (typeof device !== "string") {
    console.error("No device selected.");
    process.exit(1);
  }

  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, JSON.stringify({ device }, null, 2) + "\n");
  console.log(`Device saved to ${configPath}`);
}

program.command("daemon").action(async () => {
  await ensureDevice();
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
  await ensureDevice();
  await startInteractiveLoop();
} else {
  program.parse();
}
