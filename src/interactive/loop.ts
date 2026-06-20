import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { ui } from '../ui/renderer.js';
import { takeScreenshot } from '../services/screenshot.js';
import { analyzeScreenshot } from '../services/ai.js';

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
            console.log("Commands: /help, /exit. Any other text will be sent to the AI with a screenshot.");
        } else if (command !== '') {
            try {
                ui.showStatus('capturing');
                const path = await takeScreenshot();
                
                ui.showStatus('analyzing');
                let fullResponse = '';
                
                for await (const chunk of analyzeScreenshot(path, command)) {
                    fullResponse += chunk;
                }
                
                ui.showStatus('complete');
                ui.renderResponse(fullResponse);
            } catch (e) {
                ui.showStatus('failed', e instanceof Error ? e.message : String(e));
            }
        }
    }
}
