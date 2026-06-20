import "dotenv/config";
import { Command } from "commander";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { takeScreenshot } from "./screenshot.js";
import { analyzeScreenshot } from "./vision.js";

const program = new Command();

program.name("freely").description("AI screen assistant");

program.command("ask").action(() => {
  console.log("Hello from Freely");
});

program.command("screenshot [question]").action(async (question?: string) => {
  try {
    const path = await takeScreenshot();
    console.log(`Screenshot saved to ${path}`);
    console.log("Analyzing...");
    await analyzeScreenshot(path, question);
  } catch (e) {
    console.error("Failed to take or analyze screenshot", e);
  }
});

async function startInteractive() {
  const rl = readline.createInterface({ input, output });
  console.log("Freely started.");
  console.log("Type /help for commands.");
  console.log("Type /exit to quit.");

  rl.on("SIGINT", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });

  while (true) {
    const answer = await rl.question("\nFreely > ");

    if (answer.trim() === "/exit") {
      console.log("Goodbye!");
      process.exit(0);
    } else if (answer.trim() === "/help") {
      console.log(
        "Commands: /help, /exit. Any other text will be sent to the AI with a screenshot.",
      );
    } else if (answer.trim() !== "") {
      try {
        console.log("Taking screenshot...");
        const path = await takeScreenshot();
        console.log(`Screenshot saved to ${path}`);
        console.log("Analyzing...");
        await analyzeScreenshot(path, answer);
      } catch (e) {
        console.error("Error during analysis:", e);
      }
    }
  }
}

if (process.argv.length === 2) {
  startInteractive();
} else {
  program.parse();
}
