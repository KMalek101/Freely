import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "freely");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export type Provider = "gemini" | "anthropic" | "openai";

export interface AppConfig {
  device?: string;
  provider?: Provider;
  apiKey?: string;
  model?: string;
}

export interface AudioSource {
  name: string;
  state: string;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function listAudioSources(): AudioSource[] {
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

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const existing = await loadConfig();
  const updated = { ...existing, ...partial };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(updated, null, 2) + "\n");
  return updated;
}

export function printConfig(config: AppConfig): void {
  console.log("Current configuration:\n");
  console.log(`  Device:   ${config.device ?? "not set"}`);
  console.log(`  Provider: ${config.provider ?? "not set"}`);
  console.log(`  API Key:  ${config.apiKey ? "********" : "not set"}`);
  console.log(`  Model:    ${config.model ?? "not set"}`);
  console.log("");
}

export async function interactiveConfig(): Promise<void> {
  const config = await loadConfig();
  const { select, text, isCancel } = await import("@clack/prompts");

  console.log("");
  printConfig(config);

  while (true) {
    const action = await select({
      message: "What would you like to change?",
      options: [
        { value: "provider", label: "AI provider" },
        { value: "apikey", label: "API key" },
        { value: "model", label: "Model name" },
        { value: "device", label: "Audio device" },
        { value: "done", label: "Done" },
      ],
    });

    if (isCancel(action) || action === "done") {
      console.log("");
      break;
    }

    switch (action) {
      case "provider": {
        const provider = await select({
          message: "Select AI provider:",
          options: [
            { value: "gemini", label: "Gemini (Google)" },
            { value: "anthropic", label: "Anthropic (Claude)" },
            { value: "openai", label: "OpenAI (GPT)" },
          ],
        });
        if (typeof provider === "string") {
          await saveConfig({ provider });
          console.log(`  Provider updated to: ${provider}\n`);
        }
        break;
      }
      case "apikey": {
        const apiKey = await text({
          message: "Enter your new API key:",
          validate: (v) => (!v ? "API key is required" : undefined),
        });
        if (typeof apiKey === "string" && apiKey) {
          await saveConfig({ apiKey });
          console.log("  API key updated.\n");
        }
        break;
      }
      case "model": {
        const model = await text({
          message: "Enter model name:",
          validate: (v) => (!v ? "Model name is required" : undefined),
        });
        if (typeof model === "string" && model) {
          await saveConfig({ model });
          console.log(`  Model updated to: ${model}\n`);
        }
        break;
      }
      case "device": {
        let devices: AudioSource[];
        try {
          devices = listAudioSources();
        } catch {
          console.error("  Could not list audio sources. Is PipeWire/PulseAudio running?\n");
          break;
        }
        if (devices.length === 0) {
          console.error("  No audio sources found.\n");
          break;
        }
        const device = await select({
          message: "Select audio source:",
          options: devices.map((d) => ({
            label: `${d.name}  (${d.state})`,
            value: d.name,
          })),
        });
        if (typeof device === "string") {
          await saveConfig({ device });
          console.log(`  Device updated to: ${device}\n`);
        }
        break;
      }
    }
  }
}

export async function editConfigInEditor(): Promise<void> {
  const editor = process.env.EDITOR || "vim";

  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_PATH)) {
    await saveConfig({});
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [CONFIG_PATH], {
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`\nConfig saved to ${CONFIG_PATH}`);
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
    child.on("error", (err) => {
      reject(new Error(`Could not launch editor '${editor}': ${err.message}`));
    });
  });
}
