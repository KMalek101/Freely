import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, existsSync } from "fs";

const DIST_PROMPT = "./dist/services/prompts.js";

if (!existsSync(DIST_PROMPT)) {
  console.error("Build not found. Run `npm run build` first.");
  process.exit(1);
}

const { SYSTEM_PROMPT } = await import(DIST_PROMPT);

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_API_KEY is not set");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite",
  systemInstruction: SYSTEM_PROMPT,
});

const dataset = JSON.parse(readFileSync("eval_dataset.json", "utf-8"));

const results = [];

for (const testCase of dataset) {
  console.log(`\n[${testCase.context}] ${testCase.label}`);

  const history = [];

  for (const chunk of testCase.chunks) {
    if (chunk.delayMs > 0) {
      await new Promise((r) => setTimeout(r, chunk.delayMs));
    }

    history.push({ role: "user", parts: [{ text: chunk.text }] });

    const result = await model.generateContent({ contents: history });
    const text = result.response.text();
    history.push({ role: "model", parts: [{ text }] });

    console.log(`  chunk "${chunk.text.slice(0, 50)}..." → got response`);
  }

  const lastResponse = history.at(-1).parts[0].text;
  results.push({ testCase, lastResponse });
}

let md = "";
for (const r of results) {
  md += `## ${r.testCase.label} — ${r.testCase.context}\n\n`;
  md += "**Chunks:**\n";
  for (let i = 0; i < r.testCase.chunks.length; i++) {
    const c = r.testCase.chunks[i];
    md += `${i + 1}. "${c.text}" (+${c.delayMs}ms)\n`;
  }
  md += `\n**Final response:**\n${r.lastResponse}\n\n---\n\n`;
}

writeFileSync("eval_results.md", md);
console.log("\nDone — eval_results.md written");
