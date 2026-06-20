import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';
import { ui } from '../ui/renderer.js';
import { askAI, analyzeScreenshot } from '../services/ai.js';
import { takeScreenshot } from '../services/screenshot.js';


export async function startInteractiveLoop() {
    ui.showBanner();
    console.log("Type /help for commands.");
    console.log("Type /exit to quit.");

    const rl = readline.createInterface({ input, output });

    rl.on('SIGINT', () => {
        console.log("\nGoodbye!");
        process.exit(0);
    });

    while (true) {
        ui.showPrompt();
        const answer = await rl.question("");
        const command = answer.trim();
        
        if (command === '/exit') {
            console.log("Goodbye!");
            process.exit(0);
        } else if (command === '/help') {
            console.log("Commands: /help, /exit, /screenshot [question]. Any other text will be sent to the AI.");
        } else if (command.startsWith('/screenshot')) {
            const question = command.replace('/screenshot', '').trim();
            try {
                ui.showStatus('capturing');
                const path = await takeScreenshot();
                ui.showStatus('analyzing');
                console.log(chalk.bold('\nFreely >\n'));
                for await (const chunk of analyzeScreenshot(path, question)) {
                    process.stdout.write(chunk);
                }
                ui.showStatus('complete');
            } catch (e) {
                ui.showStatus('failed', e instanceof Error ? e.message : String(e));
            }
        } else if (command !== '') {
            try {
                ui.showStatus('analyzing');
                console.log(chalk.bold('\nFreely >\n'));
                
                for await (const chunk of askAI(command)) {
                    process.stdout.write(chunk);
                }
                
                ui.showStatus('complete');
            } catch (e) {
                ui.showStatus('failed', e instanceof Error ? e.message : String(e));
            }
        }
    }
}
