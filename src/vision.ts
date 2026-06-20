import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";

export async function analyzeScreenshot(imagePath: string): Promise<void> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const prompt = "Describe this screenshot.";

  const result = await model.generateContentStream([
    prompt,
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
