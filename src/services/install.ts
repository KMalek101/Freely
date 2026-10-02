import https from "https";
import fs from "fs";

import {
  BIN_DIR,
  HELPER_BINARY,
  IS_WINDOWS,
  MODELS_DIR,
  OVERLAY_BINARY,
  WHISPER_CLI,
  WHISPER_MODEL,
  platformKey,
} from "./paths.js";

const REPO = "KMalek101/Freely";
const RELEASE_TAG = "v1.0.0";
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";

const PLATFORM_MAP: Record<string, string | undefined> = {
  "linux-x64": "whisper-linux-x64",
  "darwin-x64": "whisper-darwin-x64",
  "darwin-arm64": "whisper-darwin-arm64",
  "win32-x64": "whisper-win32-x64.exe",
};

const HELPER_PLATFORM_MAP: Record<string, string | undefined> = {
  "linux-x64": "audio-capture-helper-linux-x64",
  "darwin-x64": "audio-capture-helper-darwin-x64",
  "darwin-arm64": "audio-capture-helper-darwin-arm64",
  "win32-x64": "audio-capture-helper-win32-x64.exe",
};

const OVERLAY_PLATFORM_MAP: Record<string, string | undefined> = {
  "linux-x64": "freely-overlay-linux-x86_64.AppImage",
  "win32-x64": "freely-overlay-win32-x64.exe",
};

function getBinaryName(): string | undefined {
  return PLATFORM_MAP[platformKey()];
}

// Windows has no execute bit, and chmod there only toggles the read-only flag.
function makeExecutable(filePath: string): void {
  if (!IS_WINDOWS) fs.chmodSync(filePath, 0o755);
}

// Downloads land next to the target and are moved into place at the very end.
// A 404 or a Ctrl-C used to leave an empty file behind, which the next run then
// reported as "already present" and happily tried to execute.
function downloadFile(url: string, destPath: string, label: string): Promise<void> {
  const partPath = `${destPath}.part`;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(partPath);
    let downloaded = 0;
    let total = 0;

    const makeRequest = (url: string) => {
      https
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return makeRequest(res.headers.location!);
          }
          if (res.statusCode !== 200) {
            file.destroy();
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
          res.on("error", reject);

          // "finish" rather than the response "end": the bytes have to be
          // flushed to disk before the file can be moved into place.
          file.on("finish", () => {
            process.stdout.write("\n");
            try {
              fs.renameSync(partPath, destPath);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        })
        .on("error", reject);
    };

    makeRequest(url);
    file.on("error", reject);
  });
}

function ensureDirs(): void {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

export async function ensureBinaries(): Promise<void> {
  const binaryName = getBinaryName();

  if (!binaryName) {
    console.error(`Unsupported platform: ${platformKey()}`);
    console.error(`  Freely supports: ${Object.keys(PLATFORM_MAP).join(", ")}`);
    process.exit(1);
  }

  ensureDirs();

  // whisper binary
  if (fs.existsSync(WHISPER_CLI)) {
    console.log("[install] whisper binary already present, skipping.");
  } else {
    const binUrl = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${binaryName}`;
    console.log(`[install] Downloading whisper binary (${platformKey()})...`);
    try {
      await downloadFile(binUrl, WHISPER_CLI, "whisper");
      makeExecutable(WHISPER_CLI);
      console.log("[install] whisper binary ready.");
    } catch (e) {
      console.error(`[install] Failed to download whisper binary: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  }

  // overlay binary
  const overlayName = OVERLAY_PLATFORM_MAP[platformKey()];
  if (fs.existsSync(OVERLAY_BINARY)) {
    console.log("[install] overlay binary already present, skipping.");
  } else if (!overlayName) {
    // no overlay build for this platform, skip silently
  } else {
    const overlayUrl = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${overlayName}`;
    console.log("[install] Downloading overlay binary...");
    try {
      await downloadFile(overlayUrl, OVERLAY_BINARY, "overlay");
      makeExecutable(OVERLAY_BINARY);
      console.log("[install] overlay binary ready.");
    } catch (e) {
      console.warn(`[install] Could not download overlay binary: ${e instanceof Error ? e.message : e}`);
      console.warn("[install] Overlay features will be unavailable.");
    }
  }

  // audio-capture-helper binary
  const helperName = HELPER_PLATFORM_MAP[platformKey()];
  if (fs.existsSync(HELPER_BINARY)) {
    console.log("[install] audio-capture-helper already present, skipping.");
  } else if (!helperName) {
    console.warn(`[install] No audio-capture-helper binary for ${platformKey()}. Audio capture unavailable.`);
  } else {
    const helperUrl = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${helperName}`;
    console.log("[install] Downloading audio-capture-helper...");
    try {
      await downloadFile(helperUrl, HELPER_BINARY, "audio-capture-helper");
      makeExecutable(HELPER_BINARY);
      console.log("[install] audio-capture-helper ready.");
    } catch (e) {
      console.warn(`[install] Could not download audio-capture-helper: ${e instanceof Error ? e.message : e}`);
      console.warn("[install] Audio capture will be unavailable.");
    }
  }

  // whisper model
  if (fs.existsSync(WHISPER_MODEL)) {
    console.log("[install] whisper model already present, skipping.");
  } else {
    console.log("[install] Downloading whisper model (~75MB, one-time)...");
    try {
      await downloadFile(MODEL_URL, WHISPER_MODEL, "ggml-tiny.en");
      console.log("[install] model ready.");
    } catch (e) {
      console.error(`[install] Failed to download model: ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }
  }
}
