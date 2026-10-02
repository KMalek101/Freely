import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

import { IS_WINDOWS } from "./paths.js";

const execFileAsync = promisify(execFile);

// Grabs the whole virtual screen, so it also works with multiple monitors.
// The overlay windows set WDA_EXCLUDEFROMCAPTURE, so they stay out of the shot.
const PS_CAPTURE = [
  "Add-Type -AssemblyName System.Windows.Forms,System.Drawing",
  "$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen",
  "$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)",
  "$gfx = [System.Drawing.Graphics]::FromImage($bmp)",
  "$gfx.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bmp.Size)",
  "$bmp.Save($env:FREELY_SCREENSHOT_PATH, [System.Drawing.Imaging.ImageFormat]::Png)",
  "$gfx.Dispose()",
  "$bmp.Dispose()",
].join("; ");

export async function takeScreenshot(): Promise<string> {
  const screenshotsDir = path.join(process.cwd(), "screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const filename = path.join(screenshotsDir, `screenshot-${Date.now()}.png`);

  if (IS_WINDOWS) {
    // The path goes through the environment rather than the script body so it
    // needs no escaping, whatever the user's home directory is called.
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", PS_CAPTURE],
      { env: { ...process.env, FREELY_SCREENSHOT_PATH: filename } },
    );
  } else {
    await execFileAsync("spectacle", [
      "--background",
      "--nonotify",
      "--output",
      filename,
    ]);
  }

  return filename;
}
