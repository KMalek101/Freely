import { showBanner } from './banner.js';
import { showStatus } from './status.js';
import { renderMarkdown } from './markdown.js';
import chalk from 'chalk';

export const ui = {
  showBanner,
  showStatus,
  renderResponse: (text: string) => {
    console.log(chalk.bold('\nFreely >\n'));
    console.log(renderMarkdown(text));
  },
  renderError: (msg: string) => console.log(chalk.red(`Error: ${msg}`)),
  showPrompt: () => process.stdout.write(chalk.bold('\nYou > ')),
};
