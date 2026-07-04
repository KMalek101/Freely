import https from "https";
import fs from "fs";
import os from "os";
import path from "path";

const REPO = "KMalek101/Freely";
const RELEASE_TAG = "v1.0.0";
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";

const PLATFORM_MAP: Record<string, string | undefined> = {
  "linux-x64": "whisper-linux-x64",
  "darwin-x64": "whisper-darwin-x64",
  "darwin-arm64": "whisper-darwin-arm64",
};

function getPlatformKey(): string {
  return `${os.platform()}-${os.arch()}`;
}

function getBinaryName(): string | undefined {
  return PLATFORM_MAP[getPlatformKey()];
}

function downloadFile(url: string, destPath: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let total = 0;

    const makeRequest = (url: string) => {
      https
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return makeRequest(res.headers.location!);
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }

          total = parseInt(res.headers["content-length"] || "0", 10);

          res.on("data", (chunk: Buffer) => {
            downloaded += chunk.length;
            if (total) {
              const pct = ((downloaded / total) * 100).toFixed(1);
              process.stdout.write(`\r  ${label}: ${pct}%`);
            }
          });

          res.pipe(file);
          res.on("end", () => {
            process.stdout.write("\n");
            resolve();
          });
          res.on("error", reject);
        })
        .on("error", reject);
    };

    makeRequest(url);
    file.on("error", reject);
  });
}

function getConfigDir(): string {
  return path.join(os.homedir(), ".config", "freely");
}

function getBinDir(): string {
  return path.join(getConfigDir(), "bin");
}

function getModelsDir(): string {
  return path.join(getConfigDir(), "models");
}

function ensureDirs(): void {
  fs.mkdirSync(getBinDir(), { recursive: true });
  fs.mkdirSync(getModelsDir(), { recursive: true });
}

export async function ensureBinaries(): Promise<void> {
  const binaryName = getBinaryName();

  if (!binaryName) {
    console.error(`Unsupported platform: ${getPlatformKey()}`);
    console.error(`  Freely supports: ${Object.keys(PLATFORM_MAP).join(", ")}`);
    process.exit(1);
  }

  ensureDirs();

  const binPath = path.join(getBinDir(), "whisper");
  const overlayPath = path.join(getBinDir(), "freely-overlay.AppImage");
  const modelPath = path.join(getModelsDir(), "ggml-tiny.en.bin");

  // whisper binary
  if (fs.existsSync(binPath)) {
    console.log("[install] whisper binary already present, skipping.");
  } else {
    const binUrl = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${binaryName}`;
    console.log(`[install] Downloading whisper binary (${getPlatformKey()})...`);
    try {
      await downloadFile(binUrl, binPath, "whisper");
      fs.chmodSync(binPath, 0o755);
      console.log("[install] whisper binary ready.");
    } catch (e) {
      console.error(`[install] Failed to download whisper binary: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  }

  // overlay AppImage (linux-x64 only)
  if (fs.existsSync(overlayPath)) {
    console.log("[install] overlay binary already present, skipping.");
  } else if (getPlatformKey() !== "linux-x64") {
    // not applicable, skip silently
  } else {
    const overlayUrl = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/freely-overlay-linux-x86_64.AppImage`;
    console.log("[install] Downloading overlay binary...");
    try {
      await downloadFile(overlayUrl, overlayPath, "overlay");
      fs.chmodSync(overlayPath, 0o755);
      console.log("[install] overlay binary ready.");
    } catch (e) {
      console.warn(`[install] Could not download overlay binary: ${e instanceof Error ? e.message : e}`);
      console.warn("[install] Overlay features will be unavailable.");
    }
  }

  // whisper model
  if (fs.existsSync(modelPath)) {
    console.log("[install] whisper model already present, skipping.");
  } else {
    console.log("[install] Downloading whisper model (~75MB, one-time)...");
    try {
      await downloadFile(MODEL_URL, modelPath, "ggml-tiny.en");
      console.log("[install] model ready.");
    } catch (e) {
      console.error(`[install] Failed to download model: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  }
}
