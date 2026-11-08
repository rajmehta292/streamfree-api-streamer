import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';

export const proxyRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/proxy/m3u8
   * Proxies HLS manifest and rewrites segment URLs to route through /api/v1/proxy/segment
   * Allows external players (VLC, Kodi, Smart TVs) or web players to bypass CORS & origin restrictions.
   */
  fastify.get<{
    Querystring: { url: string; referer?: string };
  }>('/proxy/m3u8', {
    schema: {
      description: 'CORS-bypassing proxy for HLS .m3u8 playlists with automatic URL rewriting',
      tags: ['Media Proxy'],
      querystring: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Upstream HLS playlist URL (.m3u8)' },
          referer: { type: 'string', description: 'Optional custom referer header' },
        },
        required: ['url'],
      },
    },
  }, async (request, reply) => {
    const { url, referer } = request.query;

    if (!url) {
      return reply.status(400).send({ error: 'URL query parameter is required' });
    }

    try {
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/') + 1)}`;

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
      };

      if (referer) {
        headers['Referer'] = referer;
      } else {
        headers['Referer'] = config.primaryMirror;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        return reply.status(response.status).send({
          error: `Upstream returned status ${response.status}: ${response.statusText}`,
        });
      }

      const text = await response.text();

      // Rewrite relative URLs in the playlist
      const protocol = request.protocol;
      const host = request.headers.host;
      const proxySegmentBase = `${protocol}://${host}/api/v1/proxy/segment?url=`;
      const proxyM3u8Base = `${protocol}://${host}/api/v1/proxy/m3u8?url=`;

      const rewritten = text
        .split('\n')
        .map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            // Handle URI attributes inside tags like #EXT-X-KEY or #EXT-X-MAP
            if (trimmed.includes('URI="')) {
              return line.replace(/URI="([^"]+)"/, (_match, uri) => {
                const fullUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl).toString();
                return `URI="${proxySegmentBase}${encodeURIComponent(fullUri)}"`;
              });
            }
            return line;
          }

          // Line is a media URI or sub-playlist
          const fullUri = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).toString();
          if (fullUri.includes('.m3u8')) {
            return `${proxyM3u8Base}${encodeURIComponent(fullUri)}`;
          }
          return `${proxySegmentBase}${encodeURIComponent(fullUri)}`;
        })
        .join('\n');

      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return reply.send(rewritten);
    } catch (err: any) {
      fastify.log.error({ err }, 'Failed to proxy m3u8 playlist');
      return reply.status(502).send({ error: 'Failed to proxy HLS playlist', details: err.message });
    }
  });

  /**
   * GET /api/v1/proxy/segment
   * Proxies binary media segments (.ts, .m4s, .mp4, audio chunks) with Range header support
   */
  fastify.get<{
    Querystring: { url: string; referer?: string };
  }>('/proxy/segment', {
    schema: {
      description: 'Stream binary media segments (.ts, .m4s) with Range support for low latency',
      tags: ['Media Proxy'],
      querystring: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target media segment URL' },
          referer: { type: 'string', description: 'Optional referer header' },
        },
        required: ['url'],
      },
    },
  }, async (request, reply) => {
    const { url, referer } = request.query;

    if (!url) {
      return reply.status(400).send({ error: 'URL parameter is required' });
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
      };

      if (request.headers.range) {
        headers['Range'] = request.headers.range;
      }

      if (referer) {
        headers['Referer'] = referer;
      } else {
        headers['Referer'] = config.primaryMirror;
      }

      const response = await fetch(url, { headers });

      if (!response.ok && response.status !== 206) {
        return reply.status(response.status).send({
          error: `Upstream segment returned ${response.status}`,
        });
      }

      // Propagate critical media headers
      const contentType = response.headers.get('content-type') || 'video/mp2t';
      const contentLength = response.headers.get('content-length');
      const contentRange = response.headers.get('content-range');

      reply.status(response.status);
      reply.header('Content-Type', contentType);
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Headers', 'Range, Accept-Encoding');
      reply.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      reply.header('Accept-Ranges', 'bytes');

      if (contentLength) reply.header('Content-Length', contentLength);
      if (contentRange) reply.header('Content-Range', contentRange);

      // Stream the body chunks
      const arrayBuffer = await response.arrayBuffer();
      return reply.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      fastify.log.error({ err }, 'Failed to proxy media segment');
      return reply.status(502).send({ error: 'Failed to fetch media segment', details: err.message });
    }
  });
};

