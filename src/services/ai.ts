import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import * as fs from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { getSystemPrompt } from "./prompts.js";

const CONFIG_PATH = join(homedir(), ".config", "freely", "config.json");

async function getConfig() {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf-8");
  } catch {
    throw new Error(
      "No configuration found. Run `freely` first to set up your AI provider.",
    );
  }
  const parsed = JSON.parse(raw);
  if (!parsed.provider || !parsed.apiKey || !parsed.model) {
    throw new Error(
      "Incomplete AI configuration. Run `freely` to set up your provider, API key, and model.",
    );
  }
  return parsed as { provider: string; apiKey: string; model: string };
}

// --- Gemini ---

async function* askGemini(
  apiKey: string,
  model: string,
  question: string,
  systemPrompt?: string,
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({
    model,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
  });
  const result = await m.generateContentStream([question]);
  for await (const chunk of result.stream) {
    yield chunk.text();
  }
}

async function* analyzeGemini(
  apiKey: string,
  model: string,
  imagePath: string,
  question?: string,
  extraSystemPrompt?: string,
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model });
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const basePrompt = getSystemPrompt(question);
  const finalPrompt = extraSystemPrompt
    ? `${extraSystemPrompt}\n\n${basePrompt}`
    : basePrompt;
  const result = await m.generateContentStream([
    finalPrompt,
    { inlineData: { data: base64Image, mimeType: "image/png" } },
  ]);
  for await (const chunk of result.stream) {
    yield chunk.text();
  }
}

// --- Anthropic ---

async function* askAnthropic(
  apiKey: string,
  model: string,
  question: string,
  systemPrompt?: string,
) {
  const client = new Anthropic({ apiKey });
  const stream = await client.messages.create({
    model,
    max_tokens: 4096,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: question }],
    stream: true,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

async function* analyzeAnthropic(
  apiKey: string,
  model: string,
  imagePath: string,
  question?: string,
  extraSystemPrompt?: string,
) {
  const client = new Anthropic({ apiKey });
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const basePrompt = getSystemPrompt(question);
  const finalPrompt = extraSystemPrompt
    ? `${extraSystemPrompt}\n\n${basePrompt}`
    : basePrompt;
  const stream = await client.messages.create({
    model,
    max_tokens: 4096,
    ...(finalPrompt ? { system: finalPrompt } : {}),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this image." },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64Image,
            },
          },
        ],
      },
    ],
    stream: true,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

// --- OpenAI ---

async function* askOpenAI(
  apiKey: string,
  model: string,
  question: string,
  systemPrompt?: string,
) {
  const client = new OpenAI({ apiKey });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: question });
  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
  });
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

async function* analyzeOpenAI(
  apiKey: string,
  model: string,
  imagePath: string,
  question?: string,
  extraSystemPrompt?: string,
) {
  const client = new OpenAI({ apiKey });
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const basePrompt = getSystemPrompt(question);
  const finalPrompt = extraSystemPrompt
    ? `${extraSystemPrompt}\n\n${basePrompt}`
    : basePrompt;
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: finalPrompt },
    {
      role: "user",
      content: [
        { type: "text", text: "Analyze this image." },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64Image}` },
        },
      ],
    },
  ];
  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
  });
  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

// --- Exported API ---

export async function* askAI(question: string, systemPrompt?: string) {
  const cfg = await getConfig();
  switch (cfg.provider) {
    case "gemini":
      yield* askGemini(cfg.apiKey, cfg.model, question, systemPrompt);
      break;
    case "anthropic":
      yield* askAnthropic(cfg.apiKey, cfg.model, question, systemPrompt);
      break;
    case "openai":
      yield* askOpenAI(cfg.apiKey, cfg.model, question, systemPrompt);
      break;
    default:
      throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}

export async function* analyzeScreenshot(
  imagePath: string,
  question?: string,
  extraSystemPrompt?: string,
) {
  const cfg = await getConfig();
  switch (cfg.provider) {
    case "gemini":
      yield* analyzeGemini(cfg.apiKey, cfg.model, imagePath, question, extraSystemPrompt);
      break;
    case "anthropic":
      yield* analyzeAnthropic(cfg.apiKey, cfg.model, imagePath, question, extraSystemPrompt);
      break;
    case "openai":
      yield* analyzeOpenAI(cfg.apiKey, cfg.model, imagePath, question, extraSystemPrompt);
      break;
    default:
      throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}
