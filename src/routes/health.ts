import type { FastifyPluginAsync } from 'fastify';
import { streamFreeClient } from '../services/streamfree-client.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', {
    schema: {
      description: 'System health check & diagnostics',
      tags: ['Diagnostics'],
    },
  }, async (_request, reply) => {
    const memory = process.memoryUsage();
    return reply.send({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      activeMirror: streamFreeClient.getActiveMirror(),
      memory: {
        rssMB: (memory.rss / (1024 * 1024)).toFixed(2),
        heapUsedMB: (memory.heapUsed / (1024 * 1024)).toFixed(2),
        heapTotalMB: (memory.heapTotal / (1024 * 1024)).toFixed(2),
      },
    });
  });
};

