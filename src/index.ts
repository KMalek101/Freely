#!/usr/bin/env node

import { Command } from "commander";
import { takeScreenshot } from "./screenshot.js";

const program = new Command();

program.name("freely").description("AI screen assistant");

program.command("ask").action(() => {
  console.log("Hello from Freely");
});

program.command("screenshot").action(async () => {
    try {
        const path = await takeScreenshot();
        console.log(`Screenshot saved to ${path}`);
    } catch (e) {
        console.error("Failed to take screenshot", e);
    }
});

program.parse();
