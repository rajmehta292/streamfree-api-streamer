import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Mirror management
  primaryMirror: process.env.STREAMFREE_PRIMARY_MIRROR || 'https://strmfree.st',
  fallbackMirrors: (process.env.STREAMFREE_FALLBACK_MIRRORS || 'https://streamfree.top,https://strmfree.link,https://strmfree.pk')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean),

  // Caching
  cacheTtlStreamsMs: parseInt(process.env.CACHE_TTL_STREAMS_MS || '30000', 10),
  cacheTtlSourcesMs: parseInt(process.env.CACHE_TTL_SOURCES_MS || '15000', 10),
  cacheTtlCategoriesMs: parseInt(process.env.CACHE_TTL_CATEGORIES_MS || '3600000', 10),

  // Background refresh interval
  autoRefreshIntervalMs: parseInt(process.env.AUTO_REFRESH_INTERVAL_MS || '30000', 10),

  // Flags
  enableCustomStreams: process.env.ENABLE_CUSTOM_STREAMS !== 'false',
  allowDirectHlsProxy: process.env.ALLOW_DIRECT_HLS_PROXY !== 'false',
};

