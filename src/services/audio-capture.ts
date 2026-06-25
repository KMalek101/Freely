import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const HELPER_BINARY = path.join(
  PROJECT_ROOT,
  "audio-capture-helper",
  "target",
  "release",
  "audio-capture-helper",
);

const WHISPER_CLI = path.join(
  PROJECT_ROOT,
  "node_modules",
  "nodejs-whisper",
  "cpp",
  "whisper.cpp",
  "build",
  "bin",
  "whisper-cli",
);
const WHISPER_MODEL = path.join(os.homedir(), ".whisper-models", "ggml-tiny.en.bin");

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SECOND = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
const FLUSH_INTERVAL_MS = 5000;

let child: ChildProcess | null = null;
let pcmBuffer = Buffer.alloc(0);
let flushTimer: ReturnType<typeof setInterval> | null = null;

function writeWav(data: Buffer, filePath: string): void {
  const dataSize = data.length;
  const fileSize = 36 + dataSize;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE((CHANNELS * BITS_PER_SAMPLE) / 8, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(filePath, Buffer.concat([header, data]));
}

function transcribeFile(filePath: string): void {
  execFile(
    WHISPER_CLI,
    ["-m", WHISPER_MODEL, "-f", filePath, "-ng", "-nt", "--no-timestamps"],
    { timeout: 30000, maxBuffer: 1024 * 1024 },
    (err, stdout) => {
      if (err) return;
      const text = stdout.trim();
      if (text) {
        console.log(text);
      }
    },
  );
}

function flushBuffer(): void {
  if (pcmBuffer.length === 0) return;

  const timestamp = Date.now();
  const filePath = `/tmp/freely-audio-${timestamp}.wav`;
  writeWav(pcmBuffer, filePath);
  console.log(`audio-capture-helper: wrote ${pcmBuffer.length} bytes -> ${filePath}`);
  pcmBuffer = Buffer.alloc(0);
  transcribeFile(filePath);
}

export function startAudioCapture(): void {
  if (child) {
    console.warn("audio-capture-helper already running");
    return;
  }

  child = spawn(HELPER_BINARY, [], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  let headerRead = false;
  let headerAcc = Buffer.alloc(0);

  child.stdout?.on("data", (data: Buffer) => {
    if (!headerRead) {
      headerAcc = Buffer.concat([headerAcc, data]);
      const nl = headerAcc.indexOf(0x0a);
      if (nl !== -1) {
        headerRead = true;
        console.log("audio-capture-helper:", headerAcc.subarray(0, nl).toString());
        // Everything after the newline is PCM
        const pcmStart = nl + 1;
        if (pcmStart < headerAcc.length) {
          pcmBuffer = Buffer.concat([pcmBuffer, headerAcc.subarray(pcmStart)]);
        }
        headerAcc = Buffer.alloc(0);
        flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);
        return;
      }
      return;
    }

    pcmBuffer = Buffer.concat([pcmBuffer, data]);
  });

  child.on("exit", (code, signal) => {
    // Flush remaining PCM before cleanup
    flushBuffer();
    if (flushTimer) clearInterval(flushTimer);
    console.log(`audio-capture-helper exited (code=${code}, signal=${signal})`);
    child = null;
  });

  child.on("error", (err) => {
    console.error("audio-capture-helper failed to start:", err.message);
    child = null;
  });
}

export function stopAudioCapture(): void {
  if (!child) return;

  flushBuffer();
  if (flushTimer) clearInterval(flushTimer);
  child.kill("SIGTERM");
  child = null;
}
