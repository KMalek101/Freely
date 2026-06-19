#!/usr/bin/env node

const { Command } = require("commander");

const program = new Command();

program.name("freely").description("AI screen assistant");

program.command("ask").action(() => {
  console.log("Hello from Freely");
});

program.parse();
