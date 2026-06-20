import chalk from 'chalk';

export const showStatus = (status: 'capturing' | 'analyzing' | 'complete' | 'failed', message?: string) => {
  switch (status) {
    case 'capturing':
      console.log(chalk.yellow('Capturing screenshot...'));
      break;
    case 'analyzing':
      console.log(chalk.blueBright('Analyzing screen...'));
      break;
    case 'complete':
      console.log(chalk.green('Analysis complete.'));
      break;
    case 'failed':
      console.log(chalk.red('Analysis failed.'));
      if (message) console.log(chalk.red(message));
      break;
  }
};
