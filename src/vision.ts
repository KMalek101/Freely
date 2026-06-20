import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";

export async function analyzeScreenshot(imagePath: string, question?: string): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const systemPrompt = `You are Freely, an AI assistant that helps users based on what is currently visible on their screen.

Your task is to understand the screen context and provide practical assistance.

Guidelines:
* Carefully identify the application, website, editor, terminal, document, or content currently visible.
* Infer what the user is trying to accomplish.
* Focus on helping the user make progress.
* Be concise and practical.
* Do not describe every visible detail unless it is relevant.
* If the user asks a question, prioritize answering it.
* If the user does not ask a question, explain:
  * what is happening on the screen,
  * what the user is likely trying to do,
  * the most useful next step.

For technical screens:
* Identify errors, warnings, stack traces, failed commands, and debugging clues.
* Suggest concrete fixes.
* Reference visible code when relevant.

For educational content:
* Explain concepts clearly.
* Guide the user toward understanding instead of only giving answers.

DO NOT USE MARKDOWN FOR GENERATION ALWAYS GIVE RAW TEXT 

${question ? `User Question: ${question}` : "No specific question provided. Analyze the screen and provide context and recommendations."}`;

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
    process.stdout.write(chunk.text());
  }
  console.log(); // Add a newline at the end
}
