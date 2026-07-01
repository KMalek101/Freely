#!/usr/bin/env node
import https from "https";
import fs from "fs";
import path from "path";
import { homedir, platform, arch } from "os";

const REPO = "KMalek101/Freely"; 
const RELEASE_TAG = "v1.0.0";
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";

const PLATFORM_MAP = {
  "linux-x64": "whisper-linux-x64",
  "darwin-x64": "whisper-darwin-x64",
  "darwin-arm64": "whisper-darwin-arm64",
};

const key = `${platform()}-${arch()}`;
const binaryName = PLATFORM_MAP[key];

const FREELY_DIR = path.join(homedir(), ".config", "freely");
const BIN_DIR = path.join(FREELY_DIR, "bin");
const MODEL_DIR = path.join(FREELY_DIR, "models");
const BIN_PATH = path.join(BIN_DIR, "whisper");
const MODEL_PATH = path.join(MODEL_DIR, "ggml-tiny.en.bin");

function ensureDirs() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.mkdirSync(MODEL_DIR, { recursive: true });
}

function download(url, destPath, label) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let total = 0;

    const makeRequest = (url) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return makeRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        total = parseInt(res.headers["content-length"] || "0", 10);

        res.on("data", (chunk) => {
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
      }).on("error", reject);
    };

    makeRequest(url);
    file.on("error", reject);
  });
}

async function setup() {
  if (!binaryName) {
    console.error(`❌ Unsupported platform: ${key}`);
    console.error(`   Freely currently supports: ${Object.keys(PLATFORM_MAP).join(", ")}`);
    process.exit(1);
  }

  ensureDirs();

  // --- whisper binary ---
  if (fs.existsSync(BIN_PATH)) {
    console.log("✅ whisper binary already present, skipping.");
  } else {
    const binUrl = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${binaryName}`;
    console.log(`📥 Downloading whisper binary (${key})...`);
    try {
      await download(binUrl, BIN_PATH, "whisper");
      fs.chmodSync(BIN_PATH, 0o755);
      console.log("✅ whisper binary ready.");
    } catch (e) {
      console.error(`❌ Failed to download whisper binary: ${e.message}`);
      console.error(`   URL tried: ${binUrl}`);
      process.exit(1);
    }
  }

  // --- tiny.en model ---
  if (fs.existsSync(MODEL_PATH)) {
    console.log("✅ tiny.en model already present, skipping.");
  } else {
    console.log("📥 Downloading tiny.en model (~75MB, one-time)...");
    try {
      await download(MODEL_URL, MODEL_PATH, "ggml-tiny.en");
      console.log("✅ Model ready.");
    } catch (e) {
      console.error(`❌ Failed to download model: ${e.message}`);
      process.exit(1);
    }
  }

  console.log("\n🎉 Freely setup complete. Run: freely\n");
}

setup();