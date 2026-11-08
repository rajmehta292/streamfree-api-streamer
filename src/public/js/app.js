// StreamFree API Streamer - Frontend Application

let state = {
  categories: [],
  streams: [],
  selectedCategory: '',
  searchQuery: '',
  liveOnly: false,
  sortBy: 'viewers',
  activeStream: null,
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadCategories();
  loadStreams();
  setupSSE();
  fetchMirrorStatus();
});

// Setup DOM Event Listeners
function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('search-input');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      renderStreams();
    }, 250);
  });

  // Live only toggle
  document.getElementById('live-only-toggle').addEventListener('change', (e) => {
    state.liveOnly = e.target.checked;
    renderStreams();
  });

  // Sort select
  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderStreams();
  });

  // Video Player Modal
  const playerModal = document.getElementById('player-modal');
  document.getElementById('modal-close-btn').addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayerModal();
  });

  // Modal actions
  document.getElementById('modal-popout-btn').addEventListener('click', () => {
    if (state.activeStream) {
      window.open(`/embed/${encodeURIComponent(state.activeStream.category)}/${encodeURIComponent(state.activeStream.stream_key)}`, '_blank');
    }
  });

  document.getElementById('modal-copy-embed').addEventListener('click', () => {
    if (state.activeStream) {
      copyStreamEmbed(state.activeStream);
    }
  });

  // Embed Generator Modal
  const embedModal = document.getElementById('embed-generator-modal');
  document.getElementById('open-embed-modal').addEventListener('click', () => {
    populateEmbedModal();
    embedModal.classList.add('show');
  });
  document.getElementById('embed-modal-close-btn').addEventListener('click', () => {
    embedModal.classList.remove('show');
  });

  // Custom Stream Modal
  const customModal = document.getElementById('custom-stream-modal');
  const openCustomBtn = document.getElementById('open-custom-stream-modal');
  const closeCustomBtn = document.getElementById('custom-stream-close-btn');
  const customForm = document.getElementById('custom-stream-form');

  if (openCustomBtn) {
    openCustomBtn.addEventListener('click', () => {
      customModal.classList.add('show');
    });
  }
  if (closeCustomBtn) {
    closeCustomBtn.addEventListener('click', () => {
      customModal.classList.remove('show');
    });
  }
  if (customModal) {
    customModal.addEventListener('click', (e) => {
      if (e.target === customModal) customModal.classList.remove('show');
    });
  }

  if (customForm) {
    customForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('cs-name').value.trim();
      const cat = document.getElementById('cs-category').value.trim();
      const league = document.getElementById('cs-league').value.trim();
      const key = document.getElementById('cs-key').value.trim();
      const sourceUrl = document.getElementById('cs-source-url').value.trim();
      const thumbnail = document.getElementById('cs-thumbnail').value.trim();

      const payload = {
        name,
        category: cat,
        league: league || 'Custom League',
        stream_key: key,
        thumbnail_url: thumbnail || undefined,
        sources: [
          { quality: 'FHD', url: sourceUrl, live: true },
          { quality: 'SD', url: sourceUrl, live: true },
        ],
      };

      try {
        const res = await fetch('/api/v1/custom-streams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const created = await res.json();
          customModal.classList.remove('show');
          customForm.reset();
          showToast(`Stream "${name}" published successfully!`, 'success');
          // Reload streams
          loadStreams();
          loadCategories();
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.message || 'Failed to add stream', 'error');
        }
      } catch (err) {
        showToast('Network error while adding stream', 'error');
      }
    });
  }
  embedModal.addEventListener('click', (e) => {
    if (e.target === embedModal) embedModal.classList.remove('show');
  });

  // Embed generator inputs
  ['embed-stream-select', 'embed-width', 'embed-height'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateEmbedSnippet);
    document.getElementById(id)?.addEventListener('change', updateEmbedSnippet);
  });

  document.getElementById('copy-snippet-btn').addEventListener('click', () => {
    const text = document.getElementById('generated-snippet').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copy-snippet-btn');
      const original = btn.textContent;
      btn.textContent = 'Copied to Clipboard!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePlayerModal();
      embedModal.classList.remove('show');
    }
  });
}

// Fetch Categories
async function loadCategories() {
  try {
    const res = await fetch('/api/v1/categories');
    if (res.ok) {
      const data = await res.json();
      state.categories = data.categories || [];
      renderCategoryPills();
    }
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

// Render Category Navigation Pills
function renderCategoryPills() {
  const container = document.getElementById('category-pills');
  container.innerHTML = `
    <button class="category-pill ${state.selectedCategory === '' ? 'active' : ''}" data-category="">
      All Sports
    </button>
  `;

  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `category-pill ${state.selectedCategory === cat ? 'active' : ''}`;
    btn.dataset.category = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      state.selectedCategory = cat;
      document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      renderStreams();
    });
    container.appendChild(btn);
  });

  // All button listener
  container.querySelector('.category-pill[data-category=""]').addEventListener('click', (e) => {
    state.selectedCategory = '';
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    renderStreams();
  });
}

// Fetch Streams from API
async function loadStreams() {
  try {
    const res = await fetch('/api/v1/streams');
    if (res.ok) {
      const data = await res.json();
      state.streams = data.streams || [];
      renderStreams();
    }
  } catch (err) {
    console.error('Failed to load streams:', err);
  }
}

// Filter and Render Streams Grid
function renderStreams() {
  let filtered = [...state.streams];

  // Category filter
  if (state.selectedCategory) {
    filtered = filtered.filter(s => s.category.toLowerCase() === state.selectedCategory.toLowerCase());
  }

  // Search filter
  if (state.searchQuery) {
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(state.searchQuery) ||
      (s.league && s.league.toLowerCase().includes(state.searchQuery)) ||
      (s.team1 && s.team1.name.toLowerCase().includes(state.searchQuery)) ||
      (s.team2 && s.team2.name.toLowerCase().includes(state.searchQuery)) ||
      s.stream_key.toLowerCase().includes(state.searchQuery)
    );
  }

  // Live only filter
  if (state.liveOnly) {
    filtered = filtered.filter(s => (s.sources || []).some(src => src.live));
  }

  // Sort
  if (state.sortBy === 'viewers') {
    filtered.sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
  } else if (state.sortBy === 'time') {
    filtered.sort((a, b) => a.match_timestamp - b.match_timestamp);
  } else if (state.sortBy === 'name') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Update header count
  document.getElementById('streams-count').textContent = `(${filtered.length} available)`;

  const grid = document.getElementById('streams-grid');
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-dim); background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--border-color);">
        <h3>No streams match your filter criteria</h3>
        <p style="margin-top: 8px; font-size: 13px;">Try switching categories or clearing search keywords.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(stream => {
    const isLive = (stream.sources || []).some(src => src.live);
    const highestQuality = (stream.sources || []).find(s => s.quality === 'FHD')?.quality || (stream.sources || [])[0]?.quality || 'HD';
    const matchTime = formatTimestamp(stream.match_timestamp);

    return `
      <div class="stream-card">
        <div class="card-preview">
          ${stream.thumbnail_url
            ? `<img class="thumbnail" src="${escapeHtml(stream.thumbnail_url)}" alt="${escapeHtml(stream.name)}" loading="lazy">`
            : ''
          }
          ${(!stream.thumbnail_url && stream.team1 && stream.team2) ? `
            <div class="teams-vs">
              <div class="team-box">
                <img class="team-logo" src="${escapeHtml(stream.team1.logo)}" alt="${escapeHtml(stream.team1.name)}">
                <span class="team-name">${escapeHtml(stream.team1.name)}</span>
              </div>
              <span class="vs-badge">VS</span>
              <div class="team-box">
                <img class="team-logo" src="${escapeHtml(stream.team2.logo)}" alt="${escapeHtml(stream.team2.name)}">
                <span class="team-name">${escapeHtml(stream.team2.name)}</span>
              </div>
            </div>
          ` : ''}

          <div class="card-badges">
            <span class="status-badge ${isLive ? 'is-live' : 'is-upcoming'}">
              <span class="dot" style="${isLive ? '' : 'background: #eab308; box-shadow: 0 0 6px #eab308;'}"></span>
              ${isLive ? 'LIVE' : 'UPCOMING'}
            </span>
            <span class="quality-tag">${highestQuality}</span>
          </div>
        </div>

        <div class="card-content">
          <div class="card-title">${escapeHtml(stream.name)}</div>
          <div class="card-meta">
            <span class="league-info">
              <span>🏆</span>
              <span>${escapeHtml(stream.league || stream.category.toUpperCase())}</span>
            </span>
            <span>${matchTime}</span>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-dim); margin-top: 4px;">
            <span>Category: <strong style="color: #cbd5e1; text-transform: capitalize;">${escapeHtml(stream.category)}</strong></span>
            <span>👥 ${(stream.viewers || 0).toLocaleString()} watching</span>
          </div>

          <div class="card-footer" style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="openPlayerModal('${escapeHtml(stream.stream_key)}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Watch
            </button>
            <a href="/player.html?key=${encodeURIComponent(stream.stream_key)}&category=${encodeURIComponent(stream.category)}" class="btn btn-outline" style="font-size: 12px; padding: 7px 11px;">
              Pro Player
            </a>
            <button class="btn btn-outline" style="font-size: 12px; padding: 7px 11px;" onclick="openEmbedForStream('${escapeHtml(stream.stream_key)}')">
              Embed
            </button>
            <button class="btn btn-outline" style="font-size: 12px; padding: 7px 10px;" title="Copy M3U8 Proxy URL" onclick="copyProxyForStream('${escapeHtml(stream.stream_key)}', '${escapeHtml(stream.category)}')">
              M3U8
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Open Watch Modal
window.openPlayerModal = function(streamKey) {
  const stream = state.streams.find(s => s.stream_key === streamKey);
  if (!stream) return;

  state.activeStream = stream;
  const modal = document.getElementById('player-modal');
  const iframe = document.getElementById('modal-iframe');
  const title = document.getElementById('player-modal-title');
  const details = document.getElementById('modal-stream-details');

  title.textContent = stream.name;
  details.innerHTML = `<strong>${stream.league || stream.category}</strong> &bull; ${(stream.viewers || 0).toLocaleString()} viewers &bull; Sources: ${(stream.sources || []).map(s => s.quality).join(', ')}`;

  iframe.src = `/embed/${encodeURIComponent(stream.category)}/${encodeURIComponent(stream.stream_key)}`;
  modal.classList.add('show');
};

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  const iframe = document.getElementById('modal-iframe');
  iframe.src = '';
  modal.classList.remove('show');
  state.activeStream = null;
}

// Embed Helpers
function copyStreamEmbed(stream) {
  const code = `<iframe src="${window.location.origin}/embed/${encodeURIComponent(stream.category)}/${encodeURIComponent(stream.stream_key)}" width="100%" height="480" allow="fullscreen; picture-in-picture" allowfullscreen frameborder="0"></iframe>`;
  navigator.clipboard.writeText(code).then(() => {
    showToast('Embed code copied to clipboard!', 'success');
  });
}

window.copyProxyForStream = function(streamKey, category) {
  const stream = state.streams.find(s => s.stream_key === streamKey);
  const liveSource = stream && stream.sources ? (stream.sources.find(s => s.live) || stream.sources[0]) : null;
  const targetUrl = liveSource ? liveSource.url : `${window.location.origin}/embed/${encodeURIComponent(category)}/${encodeURIComponent(streamKey)}`;
  const proxyUrl = `${window.location.origin}/api/v1/proxy/m3u8?url=${encodeURIComponent(targetUrl)}`;

  navigator.clipboard.writeText(proxyUrl).then(() => {
    showToast('Direct M3U8 proxy URL copied for VLC / IPTV players!', 'success');
  });
};

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#9146ff');
  toast.style.cssText = `
    background: #181b26;
    border-left: 4px solid ${bg};
    color: #fff;
    padding: 12px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 8px 30px rgba(0,0,0,0.6);
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.25s ease;
  `;

  toast.innerHTML = `<span>⚡</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Remove after 3.5s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.openEmbedForStream = function(streamKey) {
  populateEmbedModal(streamKey);
  document.getElementById('embed-generator-modal').classList.add('show');
};

function populateEmbedModal(selectedKey) {
  const select = document.getElementById('embed-stream-select');
  select.innerHTML = state.streams.map(s => `
    <option value="${s.stream_key}" data-category="${s.category}" ${s.stream_key === selectedKey ? 'selected' : ''}>
      ${escapeHtml(s.name)} (${s.category})
    </option>
  `).join('');

  updateEmbedSnippet();
}

function updateEmbedSnippet() {
  const select = document.getElementById('embed-stream-select');
  const width = document.getElementById('embed-width').value || '100%';
  const height = document.getElementById('embed-height').value || '480';
  const selectedOption = select.options[select.selectedIndex];

  if (!selectedOption) return;
  const key = selectedOption.value;
  const category = selectedOption.dataset.category || 'sports';

  const embedUrl = `${window.location.origin}/embed/${encodeURIComponent(category)}/${encodeURIComponent(key)}`;
  const code = `<iframe src="${embedUrl}" width="${escapeHtml(width)}" height="${escapeHtml(height)}" allow="fullscreen; picture-in-picture" allowfullscreen frameborder="0"></iframe>`;

  document.getElementById('generated-snippet').textContent = code;
}

// Real-Time Server-Sent Events (SSE)
function setupSSE() {
  const statusPill = document.getElementById('connection-status');
  const statusText = document.getElementById('connection-text');

  try {
    const es = new EventSource('/api/v1/events/live-updates');

    es.addEventListener('connected', () => {
      statusText.textContent = 'Real-Time Sync Active';
    });

    es.addEventListener('snapshot', (e) => {
      const data = JSON.parse(e.data);
      if (data && data.streams) {
        state.streams = data.streams;
        renderStreams();
      }
    });

    es.addEventListener('streams_update', (e) => {
      const data = JSON.parse(e.data);
      if (data && data.streams) {
        state.streams = data.streams;
        renderStreams();
      }
    });

    es.onerror = () => {
      statusText.textContent = 'Reconnecting...';
    };
  } catch (err) {
    console.error('SSE initialization error:', err);
  }
}

// Fetch Active Mirror Diagnostics
async function fetchMirrorStatus() {
  try {
    const res = await fetch('/api/v1/mirrors');
    if (res.ok) {
      const data = await res.json();
      const statusEl = document.getElementById('mirror-status');
      if (statusEl) {
        statusEl.innerHTML = `Connected to Upstream: <strong style="color: #a78bfa;">${data.activeMirror}</strong>`;
      }
    }
  } catch (err) {}
}

// Utilities
function formatTimestamp(ts) {
  if (!ts) return 'Live Now';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffHours = (d.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours < 0 && diffHours > -4) {
    return 'In Progress';
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

