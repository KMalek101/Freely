import { marked } from 'marked';
import chalk from 'chalk';

export const renderMarkdown = (text: string): string => {
  const tokens = marked.lexer(text);
  return renderTokens(tokens as any);
};

function renderTokens(tokens: any[]): string {
  return tokens.map(renderToken).join('');
}

function renderToken(token: any): string {
  switch (token.type) {
    case 'heading':
      const text = renderTokens(token.tokens || []);
      if (token.depth === 1) return `\n${chalk.bold.underline(text)}\n\n`;
      if (token.depth === 2) return `\n${chalk.bold(text)}\n${'═'.repeat(text.length)}\n\n`;
      return `\n${chalk.bold(text)}\n`;
    case 'list':
      return renderTokens(token.items) + '\n';
    case 'list_item':
      return `• ${renderTokens(token.tokens || [])}\n`;
    case 'text':
      if (token.tokens) return renderTokens(token.tokens);
      return token.text;
    case 'strong':
      return chalk.bold(renderTokens(token.tokens || []));
    case 'em':
      return chalk.italic(renderTokens(token.tokens || []));
    case 'codespan':
      return chalk.magenta(` ${token.text} `);
    case 'code':
      return `\n${chalk.bgGray.white(' ' + token.text.trim() + ' ')}\n\n`;
    case 'paragraph':
      return renderTokens(token.tokens || []) + '\n\n';
    case 'space':
      return '\n';
    default:
      return token.raw || '';
  }
}
