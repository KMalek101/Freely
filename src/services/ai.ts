import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import { getSystemPrompt } from "./prompts.js";

export async function* askAI(question: string): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  const result = await model.generateContentStream([
    question
  ]);

  for await (const chunk of result.stream) {
    yield chunk.text();
  }
}

export async function* analyzeScreenshot(imagePath: string, question?: string): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const systemPrompt = getSystemPrompt('structured', question);

  const result = await model.generateContentStream([
    systemPrompt,
    {
      inlineData: {
        data: base64Image,
        mimeType: "image/png",
      },
    },
  ]);

  for await (const chunk of result.stream) {
    yield chunk.text();
  }
}
