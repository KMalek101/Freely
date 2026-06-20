import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

export async function takeScreenshot(): Promise<string> {
  const screenshotsDir = path.join(process.cwd(), "screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const filename = path.join(screenshotsDir, `screenshot-${Date.now()}.png`);
  await execAsync(`spectacle --background --nonotify --output "${filename}"`);
  return filename;
}
