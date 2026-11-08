import type { FastifyPluginAsync } from 'fastify';
import { streamFreeClient } from '../services/streamfree-client.js';

export const embedRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /embed/:category/:stream_key
   * Responsive stream embed matching the StreamFree API spec
   */
  fastify.get<{
    Params: { category: string; stream_key: string };
    Querystring: { autoplay?: string; muted?: string; quality?: string };
  }>('/embed/:category/:stream_key', async (request, reply) => {
    const { category, stream_key } = request.params;
    const { autoplay, muted, quality } = request.query;

    const stream = await streamFreeClient.getStreamByKey(stream_key);
    const activeMirror = streamFreeClient.getActiveMirror();

    // Determine default video source URL
    let defaultSourceUrl = '';
    let isLive = false;
    let availableSources: any[] = [];

    if (stream && stream.sources && stream.sources.length > 0) {
      availableSources = stream.sources;
      const liveSource = stream.sources.find(s => s.live) || stream.sources[0];
      defaultSourceUrl = liveSource.url;
      isLive = stream.sources.some(s => s.live);
    } else {
      defaultSourceUrl = `${activeMirror}/embed/${encodeURIComponent(category)}/${encodeURIComponent(stream_key)}`;
    }

    const title = stream ? `${stream.name} | StreamFree Player` : 'Live Stream';
    const autoPlayBool = autoplay !== '0' && autoplay !== 'false';
    const mutedBool = muted === '1' || muted === 'true';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: #090a0f;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    .player-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    iframe.fallback-frame {
      width: 100%;
      height: 100%;
      border: 0;
    }
    .stream-overlay {
      position: absolute;
      top: 14px;
      left: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(8px);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      pointer-events: none;
      z-index: 10;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      box-shadow: 0 0 10px #ef4444;
      animation: pulse 1.5s infinite;
    }
    .waiting-box {
      display: ${isLive ? 'none' : 'flex'};
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: absolute;
      inset: 0;
      background: rgba(10, 12, 18, 0.95);
      z-index: 20;
      gap: 16px;
      text-align: center;
      padding: 24px;
    }
    .waiting-box h2 { font-size: 20px; font-weight: 700; color: #fff; }
    .waiting-box p { font-size: 14px; color: #94a3b8; max-width: 440px; }
    .btn-action {
      background: #9146ff;
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-action:hover { background: #7c2cf5; }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
  </style>
</head>
<body>
  <div class="player-container">
    <div class="stream-overlay">
      <span class="live-dot" style="${isLive ? '' : 'background: #eab308; box-shadow: 0 0 8px #eab308;'}"></span>
      <span>${isLive ? 'LIVE' : 'WAITING FOR BROADCAST'}</span>
      <span style="opacity: 0.6;">•</span>
      <span>${category.toUpperCase()}</span>
    </div>

    <div class="waiting-box" id="waiting-banner">
      <h2>Stream Starting Soon</h2>
      <p>${stream ? stream.name : stream_key} will be broadcasted once the event commences.</p>
      <button class="btn-action" onclick="checkLiveStatus()">Check Live Status</button>
    </div>

    <!-- Direct or Upstream Player -->
    <div id="player-mount" style="width: 100%; height: 100%;">
      ${
        defaultSourceUrl.endsWith('.m3u8')
          ? `<video id="video-el" controls ${mutedBool ? 'muted' : ''} ${autoPlayBool ? 'autoplay' : ''} playsinline></video>`
          : `<iframe id="stream-frame" class="fallback-frame" src="${defaultSourceUrl}" allow="fullscreen; picture-in-picture; autoplay" allowfullscreen></iframe>`
      }
    </div>
  </div>

  <script>
    const streamKey = ${JSON.stringify(stream_key)};
    const directUrl = ${JSON.stringify(defaultSourceUrl)};
    const isM3U8 = directUrl.endsWith('.m3u8');

    if (isM3U8) {
      const video = document.getElementById('video-el');
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(directUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          ${autoPlayBool ? 'video.play().catch(() => {});' : ''}
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = directUrl;
        ${autoPlayBool ? 'video.play().catch(() => {});' : ''}
      }
    }

    async function checkLiveStatus() {
      try {
        const res = await fetch('/api/v1/sources/' + encodeURIComponent(streamKey));
        if (res.ok) {
          const data = await res.json();
          const hasLive = (data.sources || []).some(s => s.live);
          if (hasLive) {
            document.getElementById('waiting-banner').style.display = 'none';
            location.reload();
          } else {
            alert('Event broadcast has not started yet. Polling will resume automatically.');
          }
        }
      } catch (err) {}
    }

    // Auto-poll if waiting
    if (!${isLive}) {
      setInterval(async () => {
        try {
          const res = await fetch('/api/v1/sources/' + encodeURIComponent(streamKey));
          if (res.ok) {
            const data = await res.json();
            if ((data.sources || []).some(s => s.live)) {
              location.reload();
            }
          }
        } catch (e) {}
      }, 15000);
    }
  </script>
</body>
</html>`;

    reply.type('text/html');
    return reply.send(html);
  });
};

