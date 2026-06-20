import "dotenv/config";
import { Command } from "commander";
import { startInteractiveLoop } from "./interactive/loop.js";
import { takeScreenshot } from "./services/screenshot.js";
import { analyzeScreenshot } from "./services/ai.js";
import { ui } from "./ui/renderer.js";

const program = new Command();

program.name("freely").description("AI screen assistant");

program.command("ask").action(() => {
  console.log("Hello from Freely");
});

program.command("screenshot [question]").action(async (question?: string) => {
  try {
    ui.showStatus("capturing");
    const path = await takeScreenshot();

    ui.showStatus("analyzing");
    let fullResponse = "";
    for await (const chunk of analyzeScreenshot(path, question)) {
      fullResponse += chunk;
    }

    ui.showStatus("complete");
    ui.renderResponse(fullResponse);
  } catch (e) {
    ui.showStatus("failed", e instanceof Error ? e.message : String(e));
  }
});

if (process.argv.length === 2) {
  startInteractiveLoop();
} else {
  program.parse();
}
