import type { FastifyReply } from 'fastify';

export interface ChatMessage {
  id: string;
  stream_key: string;
  username: string;
  message: string;
  timestamp: number;
  badge?: string;
}

interface ChatSubscriber {
  id: string;
  streamKey: string;
  reply: FastifyReply;
}

class ChatService {
  private messagesByStream: Map<string, ChatMessage[]> = new Map();
  private subscribers: Map<string, ChatSubscriber> = new Map();

  constructor() {
    // Add welcome message for demo stream
    this.addMessage('custom-demo-stream', 'StreamBot', 'Welcome to the live chat room! Enjoy the stream 🎉', 'Mod');
  }

  getMessages(streamKey: string, limit: number = 50): ChatMessage[] {
    const list = this.messagesByStream.get(streamKey) || [];
    return list.slice(-limit);
  }

  addMessage(streamKey: string, username: string, message: string, badge: string = 'Viewer'): ChatMessage {
    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      stream_key: streamKey,
      username: username.slice(0, 24).trim() || 'Anonymous',
      message: message.slice(0, 500).trim(),
      timestamp: Date.now(),
      badge,
    };

    if (!this.messagesByStream.has(streamKey)) {
      this.messagesByStream.set(streamKey, []);
    }

    const list = this.messagesByStream.get(streamKey)!;
    list.push(msg);

    // Keep last 100 messages in memory per stream
    if (list.length > 100) {
      list.shift();
    }

    // Broadcast to stream chat subscribers
    this.broadcast(streamKey, msg);

    return msg;
  }

  subscribe(id: string, streamKey: string, reply: FastifyReply): void {
    this.subscribers.set(id, { id, streamKey, reply });

    // Send history
    const history = this.getMessages(streamKey);
    this.send(reply, 'history', history);
  }

  unsubscribe(id: string): void {
    this.subscribers.delete(id);
  }

  private broadcast(streamKey: string, message: ChatMessage): void {
    const payload = `event: chat_message\ndata: ${JSON.stringify(message)}\n\n`;
    for (const [id, sub] of this.subscribers.entries()) {
      if (sub.streamKey === streamKey) {
        try {
          sub.reply.raw.write(payload);
        } catch (e) {
          this.subscribers.delete(id);
        }
      }
    }
  }

  private send(reply: FastifyReply, event: string, data: any): void {
    try {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {}
  }
}

export const chatService = new ChatService();

