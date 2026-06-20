import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

marked.setOptions({
  renderer: new TerminalRenderer()
});

export const renderMarkdown = (text: string): string => {
  return marked(text);
};
