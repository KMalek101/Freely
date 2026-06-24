import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();

const app = new Hono();

app.get('/events', (c) => {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const listener = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        eventBus.on('message', listener);
        
        c.req.raw.signal.addEventListener('abort', () => {
          eventBus.removeListener('message', listener);
          controller.close();
        });
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});

export function startSseServer() {
  serve({
    fetch: app.fetch,
    port: 3001,
  }, (info) => {
    console.log(`SSE server listening on port ${info.port}`);
  });
}
