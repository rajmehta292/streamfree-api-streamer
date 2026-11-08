import type { FastifyPluginAsync } from 'fastify';
import { streamFreeClient } from '../services/streamfree-client.js';

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/export/playlist.m3u
   * Generates a standard IPTV-compatible M3U playlist file for VLC, Kodi, TiviMate, or Apple TV
   */
  fastify.get<{
    Querystring: { category?: string; quality?: string };
  }>('/export/playlist.m3u', {
    schema: {
      description: 'Export all live and active streams as an IPTV-compatible M3U playlist',
      tags: ['Export'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter playlist by category' },
          quality: { type: 'string', description: 'Preferred stream quality (FHD, HD, SD)' },
        },
      },
    },
  }, async (request, reply) => {
    const { category, quality } = request.query;
    const data = await streamFreeClient.getStreams(category);

    const protocol = request.protocol;
    const host = request.headers.host;
    const baseUrl = `${protocol}://${host}`;

    let m3u = `#EXTM3U url-tvg="${baseUrl}/api/v1/export/epg.xml"\n`;

    for (const stream of data.streams) {
      const preferred = quality
        ? (stream.sources.find(s => s.quality.toLowerCase() === quality.toLowerCase()) || stream.sources[0])
        : ((stream.sources.find(s => s.live) || stream.sources[0]));

      const targetUrl = preferred ? preferred.url : `${baseUrl}/embed/${encodeURIComponent(stream.category)}/${encodeURIComponent(stream.stream_key)}`;
      const streamUrl = targetUrl.includes('.m3u8')
        ? `${baseUrl}/api/v1/proxy/m3u8?url=${encodeURIComponent(targetUrl)}`
        : targetUrl;

      const logo = stream.thumbnail_url || (stream.team1 ? stream.team1.logo : '');
      const group = stream.league || stream.category.toUpperCase();

      m3u += `#EXTINF:-1 tvg-id="${stream.stream_key}" tvg-name="${stream.name}" tvg-logo="${logo}" group-title="${group}",${stream.name}\n`;
      m3u += `${streamUrl}\n`;
    }

    reply.header('Content-Type', 'application/x-mpegurl; charset=utf-8');
    reply.header('Content-Disposition', 'inline; filename="streamfree.m3u"');
    reply.header('Access-Control-Allow-Origin', '*');
    return reply.send(m3u);
  });

  /**
   * GET /api/v1/export/epg.xml
   * Generates an XMLTV Electronic Program Guide (EPG) file
   */
  fastify.get('/export/epg.xml', {
    schema: {
      description: 'Export Electronic Program Guide (EPG) XMLTV format for IPTV players',
      tags: ['Export'],
    },
  }, async (_request, reply) => {
    const data = await streamFreeClient.getStreams();

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<tv generator-info-name="StreamFree API Streamer">\n';

    // Channels
    for (const s of data.streams) {
      xml += `  <channel id="${s.stream_key}">\n`;
      xml += `    <display-name>${escapeXml(s.name)}</display-name>\n`;
      if (s.thumbnail_url || (s.team1 && s.team1.logo)) {
        xml += `    <icon src="${escapeXml(s.thumbnail_url || s.team1?.logo || '')}" />\n`;
      }
      xml += `  </channel>\n`;
    }

    // Programmes
    for (const s of data.streams) {
      const start = new Date(s.match_timestamp * 1000);
      const stop = new Date((s.match_timestamp + 7200) * 1000); // 2 hours duration

      const formatEpgDate = (d: Date) => {
        return d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
      };

      xml += `  <programme start="${formatEpgDate(start)}" stop="${formatEpgDate(stop)}" channel="${s.stream_key}">\n`;
      xml += `    <title lang="en">${escapeXml(s.name)}</title>\n`;
      xml += `    <desc lang="en">${escapeXml(s.league || s.category.toUpperCase())} Live broadcast with ${s.viewers || 0} active viewers.</desc>\n`;
      xml += `    <category lang="en">${escapeXml(s.category)}</category>\n`;
      xml += `  </programme>\n`;
    }

    xml += '</tv>\n';

    reply.header('Content-Type', 'application/xml; charset=utf-8');
    reply.header('Content-Disposition', 'inline; filename="streamfree_epg.xml"');
    reply.header('Access-Control-Allow-Origin', '*');
    return reply.send(xml);
  });
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
}
