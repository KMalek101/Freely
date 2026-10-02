import os from "node:os";
import path from "node:path";

export const IS_WINDOWS = process.platform === "win32";

const EXE = IS_WINDOWS ? ".exe" : "";

// Windows has no ~/.config convention; %APPDATA% is the equivalent.
function resolveConfigDir(): string {
  if (!IS_WINDOWS) return path.join(os.homedir(), ".config", "freely");
  const appData =
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "freely");
}

export const CONFIG_DIR = resolveConfigDir();
export const BIN_DIR = path.join(CONFIG_DIR, "bin");
export const MODELS_DIR = path.join(CONFIG_DIR, "models");

export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
export const CV_TXT_PATH = path.join(CONFIG_DIR, "cv.txt");
export const CV_PDF_PATH = path.join(CONFIG_DIR, "cv.pdf");
export const DAEMON_PID_FILE = path.join(CONFIG_DIR, "daemon.pid");
export const OVERLAY_PID_FILE = path.join(CONFIG_DIR, "overlay.pid");

export const WHISPER_CLI = path.join(BIN_DIR, `whisper${EXE}`);
export const WHISPER_MODEL = path.join(MODELS_DIR, "ggml-tiny.en.bin");
export const HELPER_BINARY = path.join(BIN_DIR, `audio-capture-helper${EXE}`);
export const OVERLAY_BINARY = path.join(
  BIN_DIR,
  IS_WINDOWS ? "freely-overlay.exe" : "freely-overlay.AppImage",
);

export const SOCKET_PATH = IS_WINDOWS
  ? "\\\\.\\pipe\\freely"
  : path.join(os.tmpdir(), "freely.sock");

export function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}
