import 'dotenv/config';
import { Command } from "commander";
import { takeScreenshot } from "./screenshot.js";
import { analyzeScreenshot } from "./vision.js";

const program = new Command();

program.name("freely").description("AI screen assistant");

program.command("ask").action(() => {
  console.log("Hello from Freely");
});

program.command("screenshot").action(async () => {
    try {
        const path = await takeScreenshot();
        console.log(`Screenshot saved to ${path}`);
        console.log("Analyzing...");
        await analyzeScreenshot(path);
    } catch (e) {
        console.error("Failed to take or analyze screenshot", e);
    }
});

program.parse();
