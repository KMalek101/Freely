import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askAI } from "./ai.js";
import { eventBus } from "./daemon/sseServer.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { RmsVad } from "./vad.js";
import pdfParse from "pdf-parse";

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
const WHISPER_MODEL = path.join(
  os.homedir(),
  ".whisper-models",
  "ggml-tiny.en.bin",
);

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SECOND = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;

// VAD config
const FRAME_SAMPLES = 480;
const FRAME_SIZE_BYTES = FRAME_SAMPLES * 2;
const FRAME_DURATION_MS = 30;
const SILENCE_TIMEOUT_FRAMES = 25;
const MIN_SPEECH_DURATION_FRAMES = 9;
const MAX_SEGMENT_DURATION_MS = 30_000;

let child: ChildProcess | null = null;
let vad: RmsVad | null = null;
let alignBuffer = Buffer.alloc(0);
let segmentActive = false;
let speechBuffer = Buffer.alloc(0);
let silenceFrameCount = 0;
let speechFrameCount = 0;
let maxSegmentTimer: ReturnType<typeof setTimeout> | null = null;
let currentTurn = "";
let turnTimer: ReturnType<typeof setTimeout> | null = null;
let cvContext = "";

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
      fs.unlink(filePath, () => {});

      if (err) return;
      const text = stdout.trim();
      if (!text) return;

      console.log(text);
      eventBus.emit("message", { type: "transcript", content: text });
      currentTurn += (currentTurn ? " " : "") + text;
      resetTurnTimer();
    },
  );
}

function resetTurnTimer(): void {
  if (turnTimer) clearTimeout(turnTimer);
  turnTimer = setTimeout(async () => {
    const text = currentTurn;
    currentTurn = "";
    turnTimer = null;
    if (!text) return;
    const prompt = cvContext
      ? `The user has provided the following background about themselves:\n\n${cvContext}\n\n===\n\n${SYSTEM_PROMPT}`
      : SYSTEM_PROMPT;
    try {
      for await (const chunk of askAI(text, prompt)) {
        eventBus.emit("message", { type: "ai-chunk", content: chunk });
      }
    } catch (e) {
      eventBus.emit("message", {
        type: "error",
        content: e instanceof Error ? e.message : String(e),
      });
    }
  }, 2000);
}

function flushSpeechSegment(): void {
  if (speechBuffer.length === 0) return;

  if (maxSegmentTimer) {
    clearTimeout(maxSegmentTimer);
    maxSegmentTimer = null;
  }

  const timestamp = Date.now();
  const filePath = `/tmp/freely-audio-${timestamp}.wav`;
  writeWav(speechBuffer, filePath);
  console.log(
    `[vad] wrote speech segment (${speechBuffer.length} bytes) -> ${filePath}`,
  );
  transcribeFile(filePath);
}

function resetSegmentState(): void {
  speechBuffer = Buffer.alloc(0);
  speechFrameCount = 0;
  silenceFrameCount = 0;
  segmentActive = false;
  if (maxSegmentTimer) {
    clearTimeout(maxSegmentTimer);
    maxSegmentTimer = null;
  }
}

function processPcmFrame(frameBuf: Buffer): void {
  const copy = Buffer.alloc(FRAME_SIZE_BYTES);
  frameBuf.copy(copy);
  const frame = new Int16Array(copy.buffer, copy.byteOffset, FRAME_SAMPLES);

  const speaking = vad!.isSpeech(frame);

  if (speaking) {
    silenceFrameCount = 0;
    speechFrameCount++;
    speechBuffer = Buffer.concat([speechBuffer, copy]);

    if (!segmentActive) {
      segmentActive = true;
      maxSegmentTimer = setTimeout(() => {
        if (segmentActive && speechFrameCount >= MIN_SPEECH_DURATION_FRAMES) {
          console.log(
            `[vad] max segment duration reached (${speechFrameCount * FRAME_DURATION_MS}ms)`,
          );
          flushSpeechSegment();
        }
        resetSegmentState();
      }, MAX_SEGMENT_DURATION_MS);
      console.log("[vad] speech started");
    }
  } else {
    if (segmentActive) {
      silenceFrameCount++;
      speechBuffer = Buffer.concat([speechBuffer, copy]);

      if (silenceFrameCount >= SILENCE_TIMEOUT_FRAMES) {
        if (speechFrameCount >= MIN_SPEECH_DURATION_FRAMES) {
          console.log(
            `[vad] speech ended (${speechFrameCount * FRAME_DURATION_MS}ms)`,
          );
          flushSpeechSegment();
        } else {
          console.log(
            `[vad] discarded short burst (${speechFrameCount * FRAME_DURATION_MS}ms)`,
          );
        }
        resetSegmentState();
      }
    }
  }
}

function processPcmData(data: Buffer): void {
  const aligned = Buffer.concat([alignBuffer, data]);
  let offset = 0;

  try {
    while (offset + FRAME_SIZE_BYTES <= aligned.length) {
      const frameBuf = aligned.subarray(offset, offset + FRAME_SIZE_BYTES);
      processPcmFrame(frameBuf);
      offset += FRAME_SIZE_BYTES;
    }
  } catch (err) {
    console.error("[pcm] frame processing crashed:", err);
  }

  alignBuffer = aligned.subarray(offset);
}

function resetSpeechState(): void {
  resetSegmentState();
  alignBuffer = Buffer.alloc(0);
  currentTurn = "";
  if (turnTimer) {
    clearTimeout(turnTimer);
    turnTimer = null;
  }
  vad?.reset();
}

export async function startAudioCapture(): Promise<void> {
  if (child) {
    console.warn("audio-capture-helper already running");
    return;
  }

  const configPath = path.join(
    os.homedir(),
    ".config",
    "freely",
    "config.json",
  );
  let device: string;
  try {
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    device = config.device;
    if (!device) throw new Error();
  } catch {
    throw new Error(
      "No device configured. Run `freely` first to select an audio device.",
    );
  }

  const configDir = path.join(os.homedir(), ".config", "freely");
  const cvTxtPath = path.join(configDir, "cv.txt");
  const cvPdfPath = path.join(configDir, "cv.pdf");
  if (fs.existsSync(cvTxtPath)) {
    cvContext = await readFile(cvTxtPath, "utf-8");
    console.log("[cv] loaded cv.txt");
  } else if (fs.existsSync(cvPdfPath)) {
    const buf = await readFile(cvPdfPath);
    const parsed = await pdfParse(buf);
    cvContext = parsed.text;
    console.log("[cv] loaded cv.pdf");
  } else {
    console.log(
      "[cv] No cv.txt or cv.pdf found in ~/.config/freely/.\n      Drop one there to inject your background into the AI context.",
    );
  }

  child = spawn(HELPER_BINARY, [device], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  vad = new RmsVad();
  resetSpeechState();

  let headerRead = false;
  let headerAcc = Buffer.alloc(0);

  child.stdout?.on("data", (data: Buffer) => {
    if (!headerRead) {
      headerAcc = Buffer.concat([headerAcc, data]);
      const nl = headerAcc.indexOf(0x0a);
      if (nl !== -1) {
        headerRead = true;
        console.log(
          "audio-capture-helper:",
          headerAcc.subarray(0, nl).toString(),
        );
        const pcmStart = nl + 1;
        if (pcmStart < headerAcc.length) {
          processPcmData(headerAcc.subarray(pcmStart));
        }
        headerAcc = Buffer.alloc(0);
        return;
      }
      return;
    }

    processPcmData(data);
  });

  child.on("exit", (code, signal) => {
    if (segmentActive && speechFrameCount >= MIN_SPEECH_DURATION_FRAMES) {
      flushSpeechSegment();
    }
    resetSpeechState();
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

  if (segmentActive && speechFrameCount >= MIN_SPEECH_DURATION_FRAMES) {
    flushSpeechSegment();
  }
  resetSpeechState();
  child.kill("SIGTERM");
  child = null;
}
