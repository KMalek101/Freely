#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { execFileSync } from "child_process";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import fs from "fs";
import { homedir } from "os";
import { join, resolve, extname } from "path";
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
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf-8"));
  } catch {}
  await writeFile(
    configPath,
    JSON.stringify({ ...existing, device }, null, 2) + "\n",
  );
  console.log(`Device saved to ${configPath}`);
}

async function ensureCv() {
  const configDir = join(homedir(), ".config", "freely");
  const cvTxtPath = join(configDir, "cv.txt");
  const cvPdfPath = join(configDir, "cv.pdf");

  if (fs.existsSync(cvTxtPath) || fs.existsSync(cvPdfPath)) return;

  const { text } = await import("@clack/prompts");
  const input = await text({
    message:
      "Enter path to your CV or background file\n  (.txt or .pdf, press Enter to skip):",
  });

  if (!input || typeof input !== "string" || !input.trim()) {
    console.log(
      "[cv] Skipped — drop cv.txt or cv.pdf in ~/.config/freely/ anytime to inject your background into the AI context.",
    );
    return;
  }

  const resolvedPath = resolve(input.trim());
  const ext = extname(resolvedPath).toLowerCase();

  if (ext !== ".txt" && ext !== ".pdf") {
    console.log("[cv] Only .txt and .pdf files are supported. Skipping.");
    return;
  }

  if (!fs.existsSync(resolvedPath)) {
    console.log("[cv] File not found. Skipping.");
    return;
  }

  const dest = ext === ".txt" ? cvTxtPath : cvPdfPath;
  await copyFile(resolvedPath, dest);
  console.log(`[cv] Saved to ${dest}`);
}

async function ensureProvider() {
  const configDir = join(homedir(), ".config", "freely");
  const configPath = join(configDir, "config.json");

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf-8"));
  } catch {}

  if (existing.provider && existing.apiKey && existing.model) return;

  const { select, text, isCancel } = await import("@clack/prompts");

  const provider = await select({
    message: "Select AI provider:",
    options: [
      { value: "gemini", label: "Gemini (Google)" },
      { value: "anthropic", label: "Anthropic (Claude)" },
      { value: "openai", label: "OpenAI (GPT)" },
    ],
  });

  if (isCancel(provider) || typeof provider !== "string") {
    console.error("No provider selected.");
    process.exit(1);
  }

  const apiKey = await text({
    message: "Enter your API key:",
    validate: (value) => {
      if (!value) return "API key is required";
    },
  });

  if (isCancel(apiKey) || typeof apiKey !== "string" || !apiKey) {
    console.error("No API key provided.");
    process.exit(1);
  }

  const model = await text({
    message:
      "Enter model name\n  (e.g. gpt-4o, claude-3-5-sonnet-latest, gemini-2.0-flash):",
    validate: (value) => {
      if (!value) return "Model name is required";
    },
  });

  if (isCancel(model) || typeof model !== "string" || !model) {
    console.error("No model name provided.");
    process.exit(1);
  }

  await writeFile(
    configPath,
    JSON.stringify({ ...existing, provider, apiKey, model }, null, 2) + "\n",
  );
  console.log(`AI provider saved to ${configPath}`);
}

program.command("daemon").action(async () => {
  await ensureDevice();
  await ensureProvider();
  await ensureCv();
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
  await ensureProvider();
  await ensureCv();
  await startInteractiveLoop();
} else {
  program.parse();
}
