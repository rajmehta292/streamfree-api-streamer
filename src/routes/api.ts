import type { FastifyPluginAsync } from 'fastify';
import { streamFreeClient } from '../services/streamfree-client.js';
import { customStreamsService } from '../services/custom-streams.js';
import { sseService } from '../services/sse-service.js';
import { sportsIntelService } from '../services/sports-intel-service.js';
import type { FeedbackInput, StreamItem } from '../types/stream.js';

export const apiRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/categories
   * List all stream categories
   */
  fastify.get('/categories', {
    schema: {
      description: 'Get all available sports and media categories',
      tags: ['Catalog'],
      response: {
        200: {
          type: 'object',
          properties: {
            categories: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const data = await streamFreeClient.getCategories();
    return reply.send(data);
  });

  /**
   * GET /api/v1/streams
   * List all active and scheduled streams with filtering
   */
  fastify.get<{
    Querystring: {
      category?: string;
      search?: string;
      q?: string;
      live?: string;
      sort?: 'viewers' | 'time' | 'name';
    };
  }>('/streams', {
    schema: {
      description: 'Get list of active and scheduled streams with optional category, search, and live filter',
      tags: ['Streams'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category (e.g. soccer, basketball, hockey)' },
          search: { type: 'string', description: 'Search by team name, match name, or league' },
          q: { type: 'string', description: 'Alias for search' },
          live: { type: 'string', description: 'Set to "true" to return only streams with an active live source' },
          sort: { type: 'string', enum: ['viewers', 'time', 'name'], description: 'Sort order' },
        },
      },
    },
  }, async (request, reply) => {
    const { category, search, q, live, sort } = request.query;
    const filterTerm = (search || q || '').toLowerCase().trim();
    const filterLiveOnly = live === 'true' || live === '1';

    let data = await streamFreeClient.getStreams(category);
    let streams = [...data.streams];

    if (filterTerm) {
      streams = streams.filter(s =>
        s.name.toLowerCase().includes(filterTerm) ||
        (s.league && s.league.toLowerCase().includes(filterTerm)) ||
        (s.team1 && s.team1.name.toLowerCase().includes(filterTerm)) ||
        (s.team2 && s.team2.name.toLowerCase().includes(filterTerm)) ||
        s.stream_key.toLowerCase().includes(filterTerm)
      );
    }

    if (filterLiveOnly) {
      streams = streams.filter(s => s.sources.some(src => src.live));
    }

    if (sort === 'viewers') {
      streams.sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
    } else if (sort === 'time') {
      streams.sort((a, b) => a.match_timestamp - b.match_timestamp);
    } else if (sort === 'name') {
      streams.sort((a, b) => a.name.localeCompare(b.name));
    }

    return reply.send({
      count: streams.length,
      streams,
    });
  });

  /**
   * GET /api/v1/streams/:stream_key
   * Get single stream details
   */
  fastify.get<{
    Params: { stream_key: string };
  }>('/streams/:stream_key', {
    schema: {
      description: 'Get details for a single stream by key',
      tags: ['Streams'],
      params: {
        type: 'object',
        properties: {
          stream_key: { type: 'string' },
        },
        required: ['stream_key'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            category: { type: 'string' },
            league: { type: 'string' },
            stream_key: { type: 'string' },
            match_timestamp: { type: 'number' },
            viewers: { type: 'number' },
            is_external: { type: 'boolean' },
            thumbnail_url: { type: 'string' },
            sources: { type: 'array' },
            team1: { type: 'object' },
            team2: { type: 'object' },
            custom: { type: 'boolean' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { stream_key } = request.params;
    const stream = await streamFreeClient.getStreamByKey(stream_key);
    if (!stream) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Stream '${stream_key}' is not active or does not exist.`,
      });
    }
    return reply.send(stream);
  });

  /**
   * GET /api/v1/sources/:stream_key
   * Lightweight source list for single stream
   */
  fastify.get<{
    Params: { stream_key: string };
  }>('/sources/:stream_key', {
    schema: {
      description: 'Get source URLs and live statuses for a stream',
      tags: ['Streams'],
      params: {
        type: 'object',
        properties: {
          stream_key: { type: 'string' },
        },
        required: ['stream_key'],
      },
    },
  }, async (request, reply) => {
    const { stream_key } = request.params;
    const sources = await streamFreeClient.getSources(stream_key);
    if (!sources) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Stream sources for '${stream_key}' were not found.`,
      });
    }
    return reply.send(sources);
  });

  /**
   * GET /api/v1/intel/:stream_key
   * Live gamecast statistics, box score, key leaders (StatMuse/Reference), win probability, and news
   */
  fastify.get<{
    Params: { stream_key: string };
  }>('/intel/:stream_key', {
    schema: {
      description: 'Get deep gamecast live stats, boxscore, team comparison, StatMuse-style leaders, and news',
      tags: ['Sports Intelligence'],
      params: {
        type: 'object',
        properties: {
          stream_key: { type: 'string' },
        },
        required: ['stream_key'],
      },
    },
  }, async (request, reply) => {
    const { stream_key } = request.params;
    let stream: StreamItem | null = await streamFreeClient.getStreamByKey(stream_key);
    if (!stream) {
      const cleanKey = decodeURIComponent(stream_key).replace(/[-_]/g, ' ');
      stream = {
        id: stream_key,
        name: cleanKey.replace(/\b\w/g, l => l.toUpperCase()),
        category: 'football',
        league: 'NFL',
        stream_key,
        match_timestamp: Math.floor(Date.now() / 1000),
        sources: [],
      };
    }

    const intel = await sportsIntelService.getGamecastIntel(stream);
    return reply.send(intel);
  });

  /**
   * GET /api/v1/athlete/:sport/:league/:athlete_id
   * Deep player profile bio, physical measurements, college, draft, and statistics
   */
  fastify.get<{
    Params: { sport: string; league: string; athlete_id: string };
  }>('/athlete/:sport/:league/:athlete_id', {
    schema: {
      description: 'Get deep StatMuse/Reference-style athlete bio, season stats, height, weight, and college',
      tags: ['Sports Intelligence'],
      params: {
        type: 'object',
        properties: {
          sport: { type: 'string' },
          league: { type: 'string' },
          athlete_id: { type: 'string' },
        },
        required: ['sport', 'league', 'athlete_id'],
      },
    },
  }, async (request, reply) => {
    const { sport, league, athlete_id } = request.params;
    const profile = await sportsIntelService.getAthleteProfile(sport, league, athlete_id);
    return reply.send(profile);
  });

  /**
   * GET /api/v1/events/live-updates
   * Real-time Server-Sent Events stream for connected clients
   */
  fastify.get('/events/live-updates', {
    schema: {
      description: 'Subscribe to real-time Server-Sent Events (SSE) for live stream updates',
      tags: ['Real-Time'],
    },
  }, async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    sseService.addClient(clientId, reply);

    request.raw.on('close', () => {
      sseService.removeClient(clientId);
    });

    // Keep connection alive
    return new Promise<void>(() => {});
  });

  /**
   * POST /api/v1/custom-streams
   * Add a custom stream
   */
  fastify.post<{
    Body: StreamItem;
  }>('/custom-streams', {
    schema: {
      description: 'Add a custom user stream (local HLS or external source)',
      tags: ['Custom Streams'],
    },
  }, async (request, reply) => {
    const body = request.body;
    if (!body || !body.name || !body.stream_key || !body.category || !Array.isArray(body.sources)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'name, stream_key, category, and sources array are required.',
      });
    }

    const created = customStreamsService.addStream({
      ...body,
      id: body.id || body.stream_key,
      match_timestamp: body.match_timestamp || Math.floor(Date.now() / 1000),
      custom: true,
    });

    return reply.status(201).send(created);
  });

  /**
   * DELETE /api/v1/custom-streams/:stream_key
   */
  fastify.delete<{
    Params: { stream_key: string };
  }>('/custom-streams/:stream_key', {
    schema: {
      description: 'Remove a custom stream',
      tags: ['Custom Streams'],
    },
  }, async (request, reply) => {
    const success = customStreamsService.removeStream(request.params.stream_key);
    if (!success) {
      return reply.status(404).send({ error: 'Not Found', message: 'Custom stream not found' });
    }
    return reply.send({ success: true, message: 'Custom stream removed' });
  });

  /**
   * GET /api/v1/mirrors
   * Get mirror status and failover stats
   */
  fastify.get('/mirrors', {
    schema: {
      description: 'Get upstream StreamFree mirrors status and health',
      tags: ['Diagnostics'],
    },
  }, async (_request, reply) => {
    return reply.send({
      activeMirror: streamFreeClient.getActiveMirror(),
      mirrors: streamFreeClient.getMirrors(),
      sseClients: sseService.getClientCount(),
    });
  });

  /**
   * POST /api/feedback
   * Mirrors the StreamFree feedback API
   */
  fastify.post<{
    Body: FeedbackInput;
  }>('/feedback', {
    schema: {
      description: 'Submit stream feedback or report an issue',
      tags: ['Feedback'],
    },
  }, async (request, reply) => {
    const { message, stream_key, category } = request.body || {};
    if (!message || !message.trim()) {
      return reply.status(400).send({ error: 'Please write some feedback first.' });
    }

    fastify.log.info({ feedback: { message, stream_key, category } }, 'User feedback received');
    return reply.send({ ok: true, message: 'Thanks! Your feedback was received.' });
  });
};

