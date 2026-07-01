import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import pdfParse from "pdf-parse";

const CV_TXT = join(homedir(), ".config", "freely", "cv.txt");
const CV_PDF = join(homedir(), ".config", "freely", "cv.pdf");

export async function loadCvContext(): Promise<string> {
  if (existsSync(CV_TXT)) {
    return await readFile(CV_TXT, "utf-8");
  }
  if (existsSync(CV_PDF)) {
    const buf = await readFile(CV_PDF);
    const parsed = await pdfParse(buf);
    return parsed.text;
  }
  return "";
}

export function buildSystemPrompt(cvContext: string, systemPrompt: string): string {
  if (!cvContext) return systemPrompt;
  return `The user has provided the following background about themselves:\n\n${cvContext}\n\n===\n\n${systemPrompt}`;
}
