import type { FastifyPluginAsync } from 'fastify';
import { chatService } from '../services/chat-service.js';

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/chat/:stream_key/messages
   * Returns recent chat messages for a stream
   */
  fastify.get<{
    Params: { stream_key: string };
    Querystring: { limit?: string };
  }>('/chat/:stream_key/messages', {
    schema: {
      description: 'Get recent live chat messages for a stream',
      tags: ['Live Chat'],
      params: {
        type: 'object',
        properties: { stream_key: { type: 'string' } },
        required: ['stream_key'],
      },
    },
  }, async (request, reply) => {
    const { stream_key } = request.params;
    const limit = parseInt(request.query.limit || '50', 10);
    const messages = chatService.getMessages(stream_key, limit);
    return reply.send({ stream_key, count: messages.length, messages });
  });

  /**
   * POST /api/v1/chat/:stream_key/messages
   * Send a new message to the stream chat room
   */
  fastify.post<{
    Params: { stream_key: string };
    Body: { username: string; message: string };
  }>('/chat/:stream_key/messages', {
    schema: {
      description: 'Send a message to a live stream chat room',
      tags: ['Live Chat'],
      params: {
        type: 'object',
        properties: { stream_key: { type: 'string' } },
        required: ['stream_key'],
      },
      body: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['message'],
      },
    },
  }, async (request, reply) => {
    const { stream_key } = request.params;
    const { username, message } = request.body || {};

    if (!message || !message.trim()) {
      return reply.status(400).send({ error: 'Message cannot be empty' });
    }

    const created = chatService.addMessage(stream_key, username || 'Fan', message);
    return reply.status(201).send(created);
  });

  /**
   * GET /api/v1/chat/:stream_key/events
   * Real-time SSE stream for incoming chat messages
   */
  fastify.get<{
    Params: { stream_key: string };
  }>('/chat/:stream_key/events', {
    schema: {
      description: 'Subscribe to real-time chat SSE updates for a specific stream',
      tags: ['Live Chat'],
      params: {
        type: 'object',
        properties: { stream_key: { type: 'string' } },
        required: ['stream_key'],
      },
    },
  }, async (request, reply) => {
    const { stream_key } = request.params;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const subId = `chatsub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    chatService.subscribe(subId, stream_key, reply);

    request.raw.on('close', () => {
      chatService.unsubscribe(subId);
    });

    return new Promise<void>(() => {});
  });
};

