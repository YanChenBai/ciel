// @env node

import { PassThrough, Readable } from 'node:stream';

export const LIVE_MEDIA_SCHEME = 'ciel-media';

const MAX_PENDING_BYTES = 32 * 1024 * 1024;

interface PlaybackSession {
  readonly id: number;
  readonly pending: Buffer[];
  pendingBytes: number;
  readonly subscribers: Set<PassThrough>;
}

export class LivePlayback {
  private generation = 0;
  private session?: PlaybackSession;

  open(): string {
    this.close();
    const session: PlaybackSession = {
      id: ++this.generation,
      pending: [],
      pendingBytes: 0,
      subscribers: new Set(),
    };
    this.session = session;
    return `${LIVE_MEDIA_SCHEME}://live/${session.id}`;
  }

  handle(request: Request): Response {
    const url = new URL(request.url);
    const id = Number(url.pathname.slice(1));
    const session = this.session;
    if (
      request.method !== 'GET' ||
      url.host !== 'live' ||
      !Number.isSafeInteger(id) ||
      session?.id !== id
    ) {
      return new Response('Live stream not found', { status: 404 });
    }

    const stream = new PassThrough({ highWaterMark: 2 * 1024 * 1024 });
    session.subscribers.add(stream);
    for (const chunk of session.pending) stream.write(chunk);
    session.pending.length = 0;
    session.pendingBytes = 0;
    const detach = (): void => {
      session.subscribers.delete(stream);
    };
    stream.once('close', detach);
    stream.once('error', detach);
    request.signal.addEventListener('abort', () => stream.destroy(), { once: true });

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Type': 'video/mp4',
      },
    });
  }

  write(chunk: Buffer): void {
    const session = this.session;
    if (!session) return;
    if (session.subscribers.size === 0) {
      if (session.pendingBytes + chunk.byteLength <= MAX_PENDING_BYTES) {
        session.pending.push(chunk);
        session.pendingBytes += chunk.byteLength;
      }
      return;
    }
    for (const subscriber of session.subscribers) subscriber.write(chunk);
  }

  close(): void {
    const session = this.session;
    this.session = undefined;
    if (!session) return;
    session.pending.length = 0;
    session.pendingBytes = 0;
    for (const subscriber of session.subscribers) subscriber.end();
    session.subscribers.clear();
  }
}
