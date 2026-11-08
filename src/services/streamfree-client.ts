import { config } from '../config.js';
import { cacheService } from './cache-service.js';
import { customStreamsService } from './custom-streams.js';
import type { CategoriesResponse, SourcesResponse, StreamItem, StreamsResponse } from '../types/stream.js';

export class StreamFreeClient {
  private mirrors: string[];
  private activeMirrorIndex: number = 0;
  private mirrorFailures: Map<string, number> = new Map();

  constructor() {
    this.mirrors = [config.primaryMirror, ...config.fallbackMirrors].filter(
      (m, i, arr) => arr.indexOf(m) === i
    );
  }

  getActiveMirror(): string {
    return this.mirrors[this.activeMirrorIndex] || this.mirrors[0];
  }

  getMirrors(): { mirror: string; active: boolean; failures: number }[] {
    return this.mirrors.map((m, idx) => ({
      mirror: m,
      active: idx === this.activeMirrorIndex,
      failures: this.mirrorFailures.get(m) || 0,
    }));
  }

  /**
   * Resilient fetch that rotates mirrors if an error occurs.
   */
  private async fetchWithFailover<T>(path: string, options: RequestInit = {}): Promise<T> {
    const attempts = this.mirrors.length;
    let lastError: any = null;

    for (let i = 0; i < attempts; i++) {
      const mirrorIndex = (this.activeMirrorIndex + i) % this.mirrors.length;
      const baseMirror = this.mirrors[mirrorIndex];
      const url = `${baseMirror}${path}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'User-Agent': 'StreamFree-API-Streamer/1.0',
            'Accept': 'application/json, text/plain, */*',
            ...options.headers,
          },
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          // If we succeeded on a fallback mirror, promote it to active mirror
          if (mirrorIndex !== this.activeMirrorIndex) {
            this.activeMirrorIndex = mirrorIndex;
          }
          return (await response.json()) as T;
        }

        if (response.status === 404) {
          // 404 is a definitive not found, don't failover
          throw new Error('NOT_FOUND');
        }

        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err.message === 'NOT_FOUND') {
          throw err;
        }

        // Record failure
        const currentFails = this.mirrorFailures.get(baseMirror) || 0;
        this.mirrorFailures.set(baseMirror, currentFails + 1);
      }
    }

    throw lastError || new Error('All StreamFree mirrors failed');
  }

  /**
   * GET /api/v1/categories
   */
  async getCategories(): Promise<CategoriesResponse> {
    const cached = cacheService.getCategories();
    if (cached) return cached;

    try {
      const data = await this.fetchWithFailover<CategoriesResponse>('/api/v1/categories');
      if (config.enableCustomStreams) {
        const customCategories = Array.from(
          new Set(customStreamsService.getAll().map(s => s.category.toLowerCase()))
        );
        for (const cat of customCategories) {
          if (!data.categories.includes(cat)) {
            data.categories.push(cat);
          }
        }
      }
      cacheService.setCategories(data);
      return data;
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') {
        return { categories: [] };
      }
      // Fallback categories if mirrors are completely offline
      const fallback: CategoriesResponse = {
        categories: [
          'soccer',
          'basketball',
          'hockey',
          'combat',
          'baseball',
          'football',
          'racing',
          'tennis',
          'cricket',
        ],
      };
      return fallback;
    }
  }

  /**
   * GET /api/v1/streams?category=...
   */
  async getStreams(category?: string): Promise<StreamsResponse> {
    const cached = cacheService.getStreams(category);
    if (cached) return cached;

    const path = category ? `/api/v1/streams?category=${encodeURIComponent(category)}` : '/api/v1/streams';

    try {
      const data = await this.fetchWithFailover<StreamsResponse>(path);

      if (config.enableCustomStreams) {
        const customItems = category
          ? customStreamsService.getByCategory(category)
          : customStreamsService.getAll();
        data.streams = [...customItems, ...(data.streams || [])];
        data.count = data.streams.length;
      }

      cacheService.setStreams(data, category);

      // Also prime individual stream caches
      for (const s of data.streams) {
        cacheService.setStream(s.stream_key, s);
      }

      return data;
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') {
        return { count: 0, streams: [] };
      }
      // If offline and custom streams enabled, return custom streams
      if (config.enableCustomStreams) {
        const customItems = category
          ? customStreamsService.getByCategory(category)
          : customStreamsService.getAll();
        return { count: customItems.length, streams: customItems };
      }
      throw err;
    }
  }

  /**
   * GET /api/v1/streams/:stream_key
   */
  async getStreamByKey(streamKey: string): Promise<StreamItem | null> {
    // Check custom streams first
    if (config.enableCustomStreams) {
      const custom = customStreamsService.getByKey(streamKey);
      if (custom) return custom;
    }

    const cached = cacheService.getStream(streamKey);
    if (cached) return cached;

    try {
      const stream = await this.fetchWithFailover<StreamItem>(`/api/v1/streams/${encodeURIComponent(streamKey)}`);
      cacheService.setStream(streamKey, stream);
      return stream;
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') return null;
      throw err;
    }
  }

  /**
   * GET /api/v1/sources/:stream_key
   */
  async getSources(streamKey: string): Promise<SourcesResponse | null> {
    // Check custom streams first
    if (config.enableCustomStreams) {
      const custom = customStreamsService.getByKey(streamKey);
      if (custom) {
        return {
          stream_key: custom.stream_key,
          sources: custom.sources,
        };
      }
    }

    const cached = cacheService.getSources(streamKey);
    if (cached) return cached;

    try {
      const data = await this.fetchWithFailover<SourcesResponse>(`/api/v1/sources/${encodeURIComponent(streamKey)}`);
      cacheService.setSources(streamKey, data);
      return data;
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') return null;
      throw err;
    }
  }
}

export const streamFreeClient = new StreamFreeClient();

