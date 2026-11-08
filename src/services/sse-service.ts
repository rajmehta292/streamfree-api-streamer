import type { FastifyReply } from 'fastify';
import { streamFreeClient } from './streamfree-client.js';
import { config } from '../config.js';

interface SSEClient {
  id: string;
  reply: FastifyReply;
}

class SSEService {
  private clients: Map<string, SSEClient> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private lastStreamsHash: string = '';

  constructor() {
    this.startBackgroundPoller();
  }

  addClient(id: string, reply: FastifyReply): void {
    this.clients.set(id, { id, reply });

    // Send initial ping and current state
    this.sendToClient(reply, 'connected', { status: 'ok', clientId: id, timestamp: Date.now() });

    // Send current streams snapshot
    streamFreeClient.getStreams().then(data => {
      this.sendToClient(reply, 'snapshot', data);
    }).catch(() => {});
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: string, data: any): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, client] of this.clients.entries()) {
      try {
        client.reply.raw.write(payload);
      } catch (err) {
        this.clients.delete(id);
      }
    }
  }

  private sendToClient(reply: FastifyReply, event: string, data: any): void {
    try {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // client disconnected
    }
  }

  private startBackgroundPoller(): void {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(async () => {
      if (this.clients.size === 0) return; // Don't poll upstream if no active listeners

      try {
        const streamsData = await streamFreeClient.getStreams();
        const currentHash = `${streamsData.count}-${streamsData.streams.map(s => `${s.stream_key}:${s.viewers}`).join(',')}`;

        if (currentHash !== this.lastStreamsHash) {
          this.lastStreamsHash = currentHash;
          this.broadcast('streams_update', {
            timestamp: Date.now(),
            count: streamsData.count,
            streams: streamsData.streams,
          });
        }
      } catch (err) {
        // silently ignore background sync errors
      }
    }, config.autoRefreshIntervalMs);

    // Unref timer so it does not block node process exit (e.g. in tests or shutdowns)
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const sseService = new SSEService();
