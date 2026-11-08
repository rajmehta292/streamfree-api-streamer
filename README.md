# ⚡ StreamFree API Streamer

A high-performance streaming application, API server, and live sports aggregation engine built with **Node.js**, **Fastify**, and **TypeScript**.

Fully implements the complete **[StreamFree API specification](https://strmfree.st/api)** with automatic upstream mirror failover, in-memory sub-millisecond LRU caching, real-time Server-Sent Events (SSE), multi-view synchronized playback, ad-free custom video player embeds, and custom stream injection.

---

## 🌟 Key Features

- **Full StreamFree API Spec Compliance**: Drop-in compatible with all StreamFree endpoints:
  - `GET /api/v1/categories` — List all categories (`soccer`, `basketball`, `hockey`, `combat`, `baseball`, `football`, `racing`, `tennis`, `cricket`)
  - `GET /api/v1/streams` — Live & scheduled streams with multi-quality sources (FHD 1080p, SD 540p, 4K)
  - `GET /api/v1/streams/:stream_key` — Detailed stream metadata with team logos and timestamps
  - `GET /api/v1/sources/:stream_key` — Lightweight live status & source polling endpoint
  - `GET /embed/:category/:stream_key` — Responsive player embed (`<iframe src="/embed/{category}/{stream_key}">`)
  - `POST /api/feedback` — Submit feedback or stream issue reports
- **Ultra-High Performance**: Built on **Fastify** (2-3x faster than Express) with in-memory LRU caching and background revalidation.
- **Mirror Resilience & Automatic Failover**: Seamlessly cycles between upstream mirrors (`https://strmfree.st`, `https://streamfree.top`, `https://strmfree.link`, `https://strmfree.pk`) to eliminate downtime if a domain is blocked or offline.
- **Real-Time Live Updates (SSE)**: Built-in Server-Sent Events (`/api/v1/events/live-updates`) pushes live stream changes and viewer counts directly to connected clients without aggressive polling.
- **Multi-View Sports Wall (`/multiview.html`)**: Watch up to 4+ live games simultaneously in split or quad (2x2) layouts with solo audio switching.
- **Modern Streaming Dashboard (`/`)**: Dark-mode web interface with live badges, team logos, match countdowns, instant search, and category pills.
- **Embed Generator**: Built-in tool to generate customizable iframe code snippets for any match.
- **Interactive OpenAPI / Swagger Documentation**: Available at `/docs`.
- **Custom Streams Store**: Register your own custom RTMP/HLS feeds or external media sources via `POST /api/v1/custom-streams`.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ (tested on Node.js v24)
- **npm** v9+

### Installation

```bash
# Navigate to the project directory
cd C:\Projects\streamfree-api-streamer

# Install dependencies (if not already installed)
npm install
```

### Running in Development Mode

```bash
npm run dev
```

The server will start with hot-reload enabled via `tsx`.

### Building and Running in Production

```bash
# Compile TypeScript to dist/ and copy static assets
npm run build

# Start the production server
npm start
```

Default server address: **`http://localhost:3000`**

---

## 📡 API Reference

### 1. Categories Catalog
**`GET /api/v1/categories`**

Returns an array of all available sports and media categories.

```json
{
  "categories": [
    "soccer",
    "basketball",
    "hockey",
    "combat",
    "baseball",
    "football",
    "racing",
    "tennis",
    "cricket"
  ]
}
```

---

### 2. Stream Discovery & Filtering
**`GET /api/v1/streams`**

Retrieve all currently active and upcoming broadcasts.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `category` | `string` | Filter by category (e.g. `?category=soccer`) |
| `search` / `q` | `string` | Search by match name, league, or team (e.g. `?search=Madrid`) |
| `live` | `string` | Filter for live streams only (`?live=true`) |
| `sort` | `string` | Sort order: `viewers`, `time`, or `name` (e.g. `?sort=viewers`) |

**Sample Response:**
```json
{
  "count": 1,
  "streams": [
    {
      "id": "juventus-vs-fiorentina",
      "name": "Juventus vs Fiorentina",
      "category": "soccer",
      "league": "Serie A",
      "stream_key": "juventus-vs-fiorentina",
      "match_timestamp": 1794167100,
      "viewers": 797,
      "is_external": false,
      "thumbnail_url": "https://streamfree.top/thumbnails/soccer_juventus-vs-fiorentina",
      "sources": [
        {
          "quality": "FHD",
          "url": "https://strmfree.st/embed/soccer/juventus-vs-fiorentina1080p",
          "live": true
        },
        {
          "quality": "SD",
          "url": "https://strmfree.st/embed/soccer/juventus-vs-fiorentina540p",
          "live": false
        }
      ],
      "team1": {
        "name": "Juventus",
        "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/111.png"
      },
      "team2": {
        "name": "Fiorentina",
        "logo": "https://a.espncdn.com/i/teamlogos/soccer/500/109.png"
      }
    }
  ]
}
```

---

### 3. Single Stream Details
**`GET /api/v1/streams/:stream_key`**

Returns metadata for a specific match. Returns `404 Not Found` if the match is offline or non-existent.

---

### 4. Sources & Quality Polling
**`GET /api/v1/sources/:stream_key`**

Lightweight endpoint returning only the playable variants and their live state. Used for syncing quality controls without refetching full metadata.

```json
{
  "stream_key": "juventus-vs-fiorentina",
  "sources": [
    {
      "quality": "FHD",
      "url": "https://strmfree.st/embed/soccer/juventus-vs-fiorentina1080p",
      "live": true
    },
    {
      "quality": "SD",
      "url": "https://strmfree.st/embed/soccer/juventus-vs-fiorentina540p",
      "live": false
    }
  ]
}
```

---

### 5. Stream Iframe Embed
**`GET /embed/:category/:stream_key`**

Standard responsive iframe embed matching the StreamFree API specification. Drop directly into an iframe on any website:

```html
<iframe
  src="http://localhost:3000/embed/soccer/juventus-vs-fiorentina"
  width="100%"
  height="480"
  allow="fullscreen; picture-in-picture; autoplay"
  allowfullscreen
  frameborder="0"
></iframe>
```

---

### 6. Real-Time Server-Sent Events (SSE)
**`GET /api/v1/events/live-updates`**

Connect via browser `EventSource` or HTTP client to receive real-time updates when stream counts change or events start.

```javascript
const es = new EventSource('http://localhost:3000/api/v1/events/live-updates');
es.addEventListener('streams_update', (e) => {
  const data = JSON.parse(e.data);
  console.log('Live streams updated:', data.count, data.streams);
});
```

---

### 7. Custom Streams (User-Managed Feeds)
**`POST /api/v1/custom-streams`**

Register your own custom stream (local HLS, RTMP feed, or M3U8):

```json
{
  "name": "My Custom Match",
  "category": "soccer",
  "league": "Premier League",
  "stream_key": "my-custom-match",
  "sources": [
    {
      "quality": "FHD",
      "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      "live": true
    }
  ]
}
```

**`DELETE /api/v1/custom-streams/:stream_key`**  
Removes a custom stream.

---

### 8. System Diagnostics & Mirror Health
- **`GET /health`** — Process uptime, memory usage (RSS, heap), and timestamp.
- **`GET /api/v1/mirrors`** — Active upstream mirror, fallback list, and failure counts.
- **`POST /api/feedback`** — Submit user reports or feedback.

---

## 🛠️ Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the HTTP server |
| `HOST` | `0.0.0.0` | Bind host address |
| `LOG_LEVEL` | `info` | Fastify log level (`info`, `debug`, `warn`, `error`) |
| `STREAMFREE_PRIMARY_MIRROR` | `https://strmfree.st` | Primary upstream StreamFree domain |
| `STREAMFREE_FALLBACK_MIRRORS` | `https://streamfree.top,...` | Comma-separated list of fallback mirrors |
| `CACHE_TTL_STREAMS_MS` | `30000` | Streams cache TTL in milliseconds (30s) |
| `CACHE_TTL_SOURCES_MS` | `15000` | Sources cache TTL in milliseconds (15s) |
| `CACHE_TTL_CATEGORIES_MS` | `3600000` | Categories cache TTL in milliseconds (1hr) |
| `AUTO_REFRESH_INTERVAL_MS` | `30000` | Background poller interval for SSE |
| `ENABLE_CUSTOM_STREAMS` | `true` | Enable user custom streams |

---

## 🧪 Testing

Run the automated test suite verifying all endpoints, caching, and custom streams:

```bash
npm test
```

---

## 📁 Directory Structure

```
streamfree-api-streamer/
├── .env                  # Live environment variables
├── .env.example          # Template environment file
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── config.ts         # Environment & config loader
│   ├── server.ts         # Fastify server entrypoint
│   ├── types/
│   │   └── stream.ts     # TypeScript data contracts & schemas
│   ├── services/
│   │   ├── streamfree-client.ts # Mirror failover & upstream API client
│   │   ├── cache-service.ts     # LRU Cache with sub-millisecond lookups
│   │   ├── custom-streams.ts    # User custom stream store
│   │   └── sse-service.ts       # Real-time SSE broadcaster
│   ├── routes/
│   │   ├── api.ts        # /api/v1 endpoints
│   │   ├── embed.ts      # /embed/:category/:stream_key
│   │   └── health.ts     # /health & diagnostics
│   └── public/           # Built-in Frontend Web Application
│       ├── index.html    # Live Sports Dashboard
│       ├── multiview.html# Multi-View Sports Wall (Quad/Split)
│       ├── css/
│       │   └── style.css # Modern dark mode UI
│       └── js/
│           ├── app.js    # Single view & SSE logic
│           └── multiview.js # Multi-view tile manager
└── test/
    └── api.test.ts       # Automated test suite
```

---

## 📜 License

MIT License. Open-source streaming software.

