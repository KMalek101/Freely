import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import pdfParse from "pdf-parse-debugging-disabled";

import { CV_PDF_PATH as CV_PDF, CV_TXT_PATH as CV_TXT } from "./paths.js";

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
