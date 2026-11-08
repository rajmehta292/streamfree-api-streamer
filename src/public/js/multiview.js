// StreamFree Multi-View Engine

let allStreams = [];
let currentLayout = 4;
let tileStreams = [];

document.addEventListener('DOMContentLoaded', async () => {
  setupLayoutButtons();
  await loadStreams();
  renderGrid();
});

function setupLayoutButtons() {
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLayout = parseInt(btn.dataset.layout, 10);
      renderGrid();
    });
  });
}

async function loadStreams() {
  try {
    const res = await fetch('/api/v1/streams');
    if (res.ok) {
      const data = await res.json();
      allStreams = data.streams || [];
      // Pick initial streams for tiles
      tileStreams = allStreams.slice(0, 4);
    }
  } catch (err) {
    console.error('Failed to load streams for multi-view:', err);
  }
}

function renderGrid() {
  const container = document.getElementById('multiview-container');
  container.className = `multiview-grid grid-${currentLayout}`;
  container.innerHTML = '';

  for (let i = 0; i < currentLayout; i++) {
    const selectedStream = tileStreams[i] || allStreams[i % allStreams.length];
    const tile = createTileElement(i, selectedStream);
    container.appendChild(tile);
  }
}

function createTileElement(index, stream) {
  const tile = document.createElement('div');
  tile.className = 'multiview-tile';

  const selectOptions = allStreams.map(s => `
    <option value="${s.stream_key}" ${stream && s.stream_key === stream.stream_key ? 'selected' : ''}>
      ${s.name} (${s.category})
    </option>
  `).join('');

  tile.innerHTML = `
    <div class="tile-header">
      <div style="font-weight: 700; font-size: 12px; color: var(--accent);">Screen ${index + 1}</div>
      <select id="tile-select-${index}">
        ${selectOptions}
      </select>
      <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="fullscreenTile(${index})">
        Fullscreen
      </button>
    </div>
    <div class="tile-body" id="tile-body-${index}">
      ${stream ? `
        <iframe
          src="/embed/${encodeURIComponent(stream.category)}/${encodeURIComponent(stream.stream_key)}?muted=${index === 0 ? '0' : '1'}"
          allow="fullscreen; picture-in-picture; autoplay"
          allowfullscreen
        ></iframe>
      ` : '<div style="padding: 40px; text-align: center; color: var(--text-dim);">No stream selected</div>'}
    </div>
  `;

  const selectEl = tile.querySelector(`#tile-select-${index}`);
  selectEl.addEventListener('change', (e) => {
    const chosenKey = e.target.value;
    const newStream = allStreams.find(s => s.stream_key === chosenKey);
    tileStreams[index] = newStream;
    const body = tile.querySelector(`#tile-body-${index}`);
    if (newStream) {
      body.innerHTML = `
        <iframe
          src="/embed/${encodeURIComponent(newStream.category)}/${encodeURIComponent(newStream.stream_key)}?muted=${index === 0 ? '0' : '1'}"
          allow="fullscreen; picture-in-picture; autoplay"
          allowfullscreen
        ></iframe>
      `;
    }
  });

  return tile;
}

window.fullscreenTile = function(index) {
  const body = document.getElementById(`tile-body-${index}`);
  if (body) {
    if (body.requestFullscreen) {
      body.requestFullscreen();
    } else if (body.webkitRequestFullscreen) {
      body.webkitRequestFullscreen();
    }
  }
};

