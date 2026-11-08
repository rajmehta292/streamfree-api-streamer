import { LRUCache } from 'lru-cache';
import { config } from '../config.js';
import type { CategoriesResponse, SourcesResponse, StreamItem, StreamsResponse } from '../types/stream.js';

class CacheService {
  private categoriesCache: LRUCache<string, CategoriesResponse>;
  private streamsCache: LRUCache<string, StreamsResponse>;
  private singleStreamCache: LRUCache<string, StreamItem>;
  private sourcesCache: LRUCache<string, SourcesResponse>;

  constructor() {
    this.categoriesCache = new LRUCache<string, CategoriesResponse>({
      max: 10,
      ttl: config.cacheTtlCategoriesMs,
    });

    this.streamsCache = new LRUCache<string, StreamsResponse>({
      max: 50,
      ttl: config.cacheTtlStreamsMs,
    });

    this.singleStreamCache = new LRUCache<string, StreamItem>({
      max: 500,
      ttl: config.cacheTtlStreamsMs,
    });

    this.sourcesCache = new LRUCache<string, SourcesResponse>({
      max: 500,
      ttl: config.cacheTtlSourcesMs,
    });
  }

  // Categories
  getCategories(): CategoriesResponse | undefined {
    return this.categoriesCache.get('categories');
  }

  setCategories(data: CategoriesResponse): void {
    this.categoriesCache.set('categories', data);
  }

  // Streams list
  getStreams(category?: string): StreamsResponse | undefined {
    const key = category ? `streams:cat:${category}` : 'streams:all';
    return this.streamsCache.get(key);
  }

  setStreams(data: StreamsResponse, category?: string): void {
    const key = category ? `streams:cat:${category}` : 'streams:all';
    this.streamsCache.set(key, data);
  }

  // Single stream
  getStream(streamKey: string): StreamItem | undefined {
    return this.singleStreamCache.get(streamKey);
  }

  setStream(streamKey: string, data: StreamItem): void {
    this.singleStreamCache.set(streamKey, data);
  }

  // Sources
  getSources(streamKey: string): SourcesResponse | undefined {
    return this.sourcesCache.get(streamKey);
  }

  setSources(streamKey: string, data: SourcesResponse): void {
    this.sourcesCache.set(streamKey, data);
  }

  clear(): void {
    this.categoriesCache.clear();
    this.streamsCache.clear();
    this.singleStreamCache.clear();
    this.sourcesCache.clear();
  }
}

export const cacheService = new CacheService();

