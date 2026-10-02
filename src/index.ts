#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { spawn } from "child_process";
import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import fs from "fs";
import { resolve, extname } from "path";

import { startInteractiveLoop } from "./interactive/loop.js";
import { startDaemon } from "./services/daemon/server.js";
import { takeScreenshot } from "./services/screenshot.js";
import { listAudioSources } from "./services/config.js";
import { ensureBinaries } from "./services/install.js";
import type { AudioSource } from "./services/config.js";
import {
  CONFIG_DIR,
  CONFIG_PATH,
  CV_PDF_PATH,
  CV_TXT_PATH,
  DAEMON_PID_FILE,
  IS_WINDOWS,
  OVERLAY_BINARY,
  OVERLAY_PID_FILE,
  SOCKET_PATH,
} from "./services/paths.js";

const program = new Command();

program.name("freely").description("AI screen assistant");

async function ensureDevice() {
  try {
    const existing = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
    if (existing.device) return;
  } catch {}

  if (!process.stdin.isTTY) {
    console.error("No device configured. Run 'freely' interactively first.");
    process.exit(1);
  }

  let devices: AudioSource[];
  try {
    devices = listAudioSources();
  } catch {
    console.error(
      IS_WINDOWS
        ? "Could not list audio devices. Is the audio-capture-helper installed?"
        : "Could not list audio sources. Is PipeWire/PulseAudio running?",
    );
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

  await mkdir(CONFIG_DIR, { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  } catch {}
  await writeFile(
    CONFIG_PATH,
    JSON.stringify({ ...existing, device }, null, 2) + "\n",
  );
  console.log(`Device saved to ${CONFIG_PATH}`);
}

async function ensureCv() {
  if (fs.existsSync(CV_TXT_PATH) || fs.existsSync(CV_PDF_PATH)) return;
  if (!process.stdin.isTTY) return;

  const { text } = await import("@clack/prompts");
  const input = await text({
    message:
      "Enter path to your CV or background file\n  (.txt or .pdf, press Enter to skip):",
  });

  if (!input || typeof input !== "string" || !input.trim()) {
    console.log(
      `[cv] Skipped — drop cv.txt or cv.pdf in ${CONFIG_DIR} anytime to inject your background into the AI context.`,
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

  const dest = ext === ".txt" ? CV_TXT_PATH : CV_PDF_PATH;
  await copyFile(resolvedPath, dest);
  console.log(`[cv] Saved to ${dest}`);
}

function readPid(): number | null {
  try {
    const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(pid: number): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(DAEMON_PID_FILE, String(pid));
}

function deletePid(): void {
  try {
    fs.unlinkSync(DAEMON_PID_FILE);
  } catch {}
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureDaemon(): void {
  const pid = readPid();
  if (pid !== null) {
    if (isProcessAlive(pid)) return;
    deletePid();
  }

  const entry = process.argv[1]!;
  const args = entry.endsWith(".ts")
    ? ["--import", "tsx", entry, "daemon"]
    : [entry, "daemon"];

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  writePid(child.pid!);
}

function ensureOverlay(): void {
  try {
    const overlayPid = parseInt(fs.readFileSync(OVERLAY_PID_FILE, "utf-8").trim(), 10);
    if (!isNaN(overlayPid) && isProcessAlive(overlayPid)) return;
  } catch {}

  if (!fs.existsSync(OVERLAY_BINARY)) {
    console.warn("[overlay] Binary not found at " + OVERLAY_BINARY);
    return;
  }

  const child = spawn(OVERLAY_BINARY, [], { detached: true, stdio: "ignore" });
  child.unref();
  fs.writeFileSync(OVERLAY_PID_FILE, String(child.pid!));
}

async function ensureProvider() {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  } catch {}

  if (existing.provider && existing.apiKey && existing.model) return;

  if (!process.stdin.isTTY) {
    console.error("Incomplete AI provider config. Run 'freely' interactively first.");
    process.exit(1);
  }

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
    CONFIG_PATH,
    JSON.stringify({ ...existing, provider, apiKey, model }, null, 2) + "\n",
  );
  console.log(`AI provider saved to ${CONFIG_PATH}`);
}

program.command("daemon").action(async () => {
  // Binaries first: on Windows the device list comes from the helper.
  await ensureBinaries();
  await ensureDevice();
  await ensureProvider();
  await ensureCv();
  writePid(process.pid);
  ensureOverlay();
  await startDaemon();
});

program.command("stop").description("Stop the background daemon").action(() => {
  try {
    const overlayPid = parseInt(fs.readFileSync(OVERLAY_PID_FILE, "utf-8").trim(), 10);
    if (!isNaN(overlayPid)) {
      try { process.kill(overlayPid, "SIGTERM"); } catch {}
    }
  } catch {}
  try { fs.unlinkSync(OVERLAY_PID_FILE); } catch {}

  const pid = readPid();
  if (pid !== null && isProcessAlive(pid)) {
    process.kill(pid, "SIGTERM");
    deletePid();
    console.log("Daemon stopped.");
  } else {
    console.log("Daemon is not running.");
    deletePid();
  }
  process.exit(0);
});

program.command("trigger <action> [args...]").action(async (action: string, args: string[]) => {
  const net = await import("net");

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

  const client = net.createConnection(SOCKET_PATH);
  client.on("connect", () => {
    client.write(JSON.stringify({ action: "ask", args: question }));
    client.end();
    process.exit(0);
  });
});

program.command("screenshot [question]").action(async (question?: string) => {
  const net = await import("net");

  const client = net.createConnection(SOCKET_PATH);
  client.on("connect", () => {
    client.write(JSON.stringify({ action: "screenshot", args: question ? [question] : [] }));
    client.end();
    process.exit(0);
  });
});

const configCmd = program.command("config").description("Manage configuration");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    const { loadConfig, printConfig } = await import("./services/config.js");
    const config = await loadConfig();
    printConfig(config);
  });

configCmd
  .command("edit")
  .description("Open config file in $EDITOR (or notepad/vim)")
  .action(async () => {
    const { editConfigInEditor } = await import("./services/config.js");
    try {
      await editConfigInEditor();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

configCmd.action(async () => {
  const { interactiveConfig } = await import("./services/config.js");
  await interactiveConfig();
});

if (process.argv.length === 2) {
  // Binaries first: on Windows the device list comes from the helper.
  await ensureBinaries();
  await ensureDevice();
  await ensureProvider();
  await ensureCv();
  ensureDaemon();
  ensureOverlay();
  await startInteractiveLoop();
} else {
  program.parse();
}
