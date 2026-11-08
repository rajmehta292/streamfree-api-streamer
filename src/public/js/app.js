// StreamFree API Streamer - Frontend Application

let state = {
  categories: [],
  streams: [],
  selectedCategory: '',
  searchQuery: '',
  liveOnly: false,
  sortBy: 'viewers',
  activeStream: null,
  favorites: JSON.parse(localStorage.getItem('sf_favorites') || '[]'),
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

  // Athlete Profile Modal
  const profileModal = document.getElementById('player-profile-modal');
  const closeProfileBtn = document.getElementById('profile-modal-close-btn');
  if (closeProfileBtn) {
    closeProfileBtn.addEventListener('click', () => {
      if (profileModal) profileModal.classList.remove('show');
    });
  }
  if (profileModal) {
    profileModal.addEventListener('click', (e) => {
      if (e.target === profileModal) profileModal.classList.remove('show');
    });
  }

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

  document.getElementById('modal-copy-m3u8').addEventListener('click', () => {
    if (state.activeStream) {
      copyProxyForStream(state.activeStream.stream_key, state.activeStream.category);
    }
  });

  // Gamecast Tabs Switching
  document.querySelectorAll('.gamecast-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gamecast-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.gamecast-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      const targetPanel = document.getElementById(`tab-${tabId}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Modal Chat Form
  const modalChatForm = document.getElementById('modal-chat-form');
  if (modalChatForm) {
    modalChatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('modal-chat-input');
      const text = input.value.trim();
      if (!text || !state.activeStream) return;
      input.value = '';
      try {
        await fetch(`/api/v1/chat/${encodeURIComponent(state.activeStream.stream_key)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'Fan_' + Math.floor(Math.random() * 900 + 100),
            message: text,
          }),
        });
      } catch (err) {}
    });
  }

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
    <button class="category-pill ${state.selectedCategory === '__favorites__' ? 'active' : ''}" data-category="__favorites__" style="color: #facc15; border-color: rgba(250, 204, 21, 0.3);">
      ★ Watchlist (${state.favorites.length})
    </button>
  `;

  // Watchlist pill listener
  container.querySelector('.category-pill[data-category="__favorites__"]').addEventListener('click', (e) => {
    state.selectedCategory = '__favorites__';
    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    renderStreams();
  });

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
  if (state.selectedCategory === '__favorites__') {
    filtered = filtered.filter(s => state.favorites.includes(s.stream_key));
  } else if (state.selectedCategory) {
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

let modalChatEventSource = null;
let currentIntel = null;
let intelPollTimer = null;
let activeBoxScoreTeam = 'team1';
let activeBoxScoreCatIndex = 0;
let activeRosterTeam = 'team1';

// Open Watch Modal (Gamecast Hub)
window.openPlayerModal = async function(streamKey) {
  const stream = state.streams.find(s => s.stream_key === streamKey);
  if (!stream) return;

  if (intelPollTimer) {
    clearInterval(intelPollTimer);
    intelPollTimer = null;
  }

  state.activeStream = stream;
  const modal = document.getElementById('player-modal');
  const iframe = document.getElementById('modal-iframe');

  // Header Elements
  document.getElementById('player-title-text').textContent = stream.name;
  document.getElementById('player-league-badge').textContent = stream.league || stream.category.toUpperCase();

  const proPlayerLink = document.getElementById('modal-pro-player-link');
  if (proPlayerLink) {
    proPlayerLink.href = `/player.html?key=${encodeURIComponent(stream.stream_key)}&category=${encodeURIComponent(stream.category)}`;
  }

  // Set default iframe embed
  iframe.src = `/embed/${encodeURIComponent(stream.category)}/${encodeURIComponent(stream.stream_key)}`;
  modal.classList.add('show');

  // Initial Scoreboard state
  const t1Name = stream.team1?.name || stream.name.split('vs')[0]?.trim() || 'Home';
  const t2Name = stream.team2?.name || stream.name.split('vs')[1]?.trim() || 'Away';
  document.getElementById('sb-team1-name').textContent = t1Name;
  document.getElementById('sb-team2-name').textContent = t2Name;
  document.getElementById('sb-team1-logo').src = stream.team1?.logo || 'https://via.placeholder.com/80/9146ff/fff?text=' + t1Name.slice(0, 3).toUpperCase();
  document.getElementById('sb-team2-logo').src = stream.team2?.logo || 'https://via.placeholder.com/80/00f2fe/000?text=' + t2Name.slice(0, 3).toUpperCase();
  document.getElementById('sb-status-text').textContent = (stream.sources || []).some(s => s.live) ? 'LIVE' : 'UPCOMING';
  document.getElementById('sb-venue-text').textContent = `${stream.category.toUpperCase()} • ${(stream.viewers || 0).toLocaleString()} viewers`;

  // Start live chat connection
  setupModalChat(stream.stream_key);

  // Initial fetch of Sports Intelligence (ESPN / StatMuse Live Stats & News)
  await fetchStreamIntel(stream.stream_key);

  // Start 15-second live polling loop for continuous updates
  intelPollTimer = setInterval(() => {
    if (state.activeStream && state.activeStream.stream_key === streamKey) {
      fetchStreamIntel(streamKey);
    }
  }, 15000);
};

async function fetchStreamIntel(streamKey) {
  try {
    const res = await fetch(`/api/v1/intel/${encodeURIComponent(streamKey)}`);
    if (res.ok) {
      const intel = await res.json();
      currentIntel = intel;
      renderGamecastIntel(intel);
    }
  } catch (err) {
    console.error('Failed to load sports intelligence:', err);
  }
}

function renderGamecastIntel(intel) {
  if (!intel) return;

  // 1. Scoreboard Update
  if (intel.scoreboard) {
    document.getElementById('sb-team1-score').textContent = intel.scoreboard.team1.score || '0';
    document.getElementById('sb-team2-score').textContent = intel.scoreboard.team2.score || '0';
    if (intel.scoreboard.team1.name) document.getElementById('sb-team1-name').textContent = intel.scoreboard.team1.name;
    if (intel.scoreboard.team2.name) document.getElementById('sb-team2-name').textContent = intel.scoreboard.team2.name;
    if (intel.scoreboard.team1.logo) document.getElementById('sb-team1-logo').src = intel.scoreboard.team1.logo;
    if (intel.scoreboard.team2.logo) document.getElementById('sb-team2-logo').src = intel.scoreboard.team2.logo;

    if (intel.scoreboard.team1.record) document.getElementById('sb-team1-record').textContent = intel.scoreboard.team1.record;
    if (intel.scoreboard.team2.record) document.getElementById('sb-team2-record').textContent = intel.scoreboard.team2.record;
    if (intel.scoreboard.detail) document.getElementById('sb-status-text').textContent = intel.scoreboard.detail;

    const downDistEl = document.getElementById('sb-down-dist');
    if (intel.scoreboard.downDistance) {
      downDistEl.textContent = intel.scoreboard.downDistance;
      downDistEl.style.display = 'block';
    } else {
      downDistEl.style.display = 'none';
    }
  }

  // 2. Win Probability Bar
  const winProbWrap = document.getElementById('win-prob-wrapper');
  if (intel.winProbability && winProbWrap) {
    winProbWrap.style.display = 'flex';
    document.getElementById('win-prob-t1-label').textContent = `${intel.scoreboard.team1.name} Win: ${intel.winProbability.team1Percentage}%`;
    document.getElementById('win-prob-t2-label').textContent = `${intel.scoreboard.team2.name} Win: ${intel.winProbability.team2Percentage}%`;
    document.getElementById('win-prob-bar-home').style.width = `${intel.winProbability.team1Percentage}%`;
    document.getElementById('win-prob-bar-away').style.width = `${intel.winProbability.team2Percentage}%`;
  }

  // 3. Game Info
  if (intel.gameInfo) {
    if (intel.gameInfo.venue) document.getElementById('sb-venue-text').textContent = `📍 ${intel.gameInfo.venue}${intel.gameInfo.city ? ', ' + intel.gameInfo.city : ''}`;
    if (intel.gameInfo.odds) document.getElementById('sb-odds-text').textContent = `🎲 Odds: ${intel.gameInfo.odds}${intel.gameInfo.overUnder ? ' (' + intel.gameInfo.overUnder + ')' : ''}`;
    if (intel.gameInfo.broadcast) document.getElementById('sb-broadcast-text').textContent = `📺 ${intel.gameInfo.broadcast}`;
  }

  // 4. Tab 0: Box Score (Player by Player with Category Pills)
  renderBoxScore(intel.boxscore);

  // 5. Tab 0.5: Team Rosters
  renderRosters(intel.rosters);

  // 6. Tab 1: Live Stats Comparison (ESPN / Yahoo style)
  const statsContainer = document.getElementById('gamecast-stats-container');
  if (intel.stats && intel.stats.length > 0) {
    statsContainer.innerHTML = intel.stats.map(s => `
      <div class="stat-row">
        <div class="stat-labels">
          <span class="stat-team1-val">${escapeHtml(s.team1Value)}</span>
          <span class="stat-name">${escapeHtml(s.label)}</span>
          <span class="stat-team2-val">${escapeHtml(s.team2Value)}</span>
        </div>
      </div>
    `).join('');
  } else {
    statsContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 16px;">Live statistics will appear once play starts.</div>`;
  }

  // 7. Tab 2: Key Leaders (StatMuse / Reference style)
  const leadersContainer = document.getElementById('gamecast-leaders-container');
  if (intel.leaders && intel.leaders.length > 0) {
    leadersContainer.innerHTML = intel.leaders.map(l => `
      <div class="leader-card" style="cursor: pointer;" onclick="openAthleteProfile('${escapeHtml(l.athlete.id)}', '${escapeHtml(intel.sportPath || '')}', '${escapeHtml(l.athlete.name)}')">
        <img class="leader-avatar" src="${escapeHtml(l.athlete.headshot)}" alt="${escapeHtml(l.athlete.name)}" onerror="this.src='https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90'">
        <div class="leader-info">
          <span class="leader-cat">${escapeHtml(l.category)}</span>
          <span class="leader-name">${escapeHtml(l.athlete.name)} ${l.athlete.jersey ? '#' + escapeHtml(l.athlete.jersey) : ''}</span>
          <span class="leader-stat">${escapeHtml(l.statline)}</span>
          <span style="font-size: 11px; color: var(--text-dim);">${escapeHtml(l.teamName || '')}</span>
        </div>
      </div>
    `).join('');
  } else {
    leadersContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 16px;">Key leaders will be highlighted during game action.</div>`;
  }

  // 8. Tab 3: Scoring Timeline
  const scoringContainer = document.getElementById('gamecast-scoring-container');
  if (intel.scoringPlays && intel.scoringPlays.length > 0) {
    scoringContainer.innerHTML = intel.scoringPlays.map(p => `
      <div class="play-item">
        <div class="play-period">${escapeHtml(p.period)} ${p.clock ? '<br>' + escapeHtml(p.clock) : ''}</div>
        <div class="play-body">
          <div class="play-score">${p.teamName ? escapeHtml(p.teamName) + ' • ' : ''}Score: ${escapeHtml(p.score)}</div>
          <div class="play-desc">${escapeHtml(p.description)}</div>
        </div>
      </div>
    `).join('');
  } else {
    scoringContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 16px;">No scoring plays yet.</div>`;
  }

  // 9. Tab 4: News & Analysis
  const newsContainer = document.getElementById('gamecast-news-container');
  if (intel.news && intel.news.length > 0) {
    newsContainer.innerHTML = intel.news.map(n => `
      <div class="news-card">
        ${n.image ? `<img src="${escapeHtml(n.image)}" alt="News image" loading="lazy">` : ''}
        <div class="news-body">
          <div class="news-headline">${escapeHtml(n.title)}</div>
          <div class="news-summary">${escapeHtml(n.description)}</div>
          <a href="${escapeHtml(n.link)}" target="_blank" class="news-link">Read Full Coverage &rarr;</a>
        </div>
      </div>
    `).join('');
  } else {
    newsContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 16px;">No recent editorial news found for this match.</div>`;
  }
}

// Render Box Score Component
function renderBoxScore(boxscore) {
  const teamNav = document.getElementById('boxscore-team-nav');
  const catPills = document.getElementById('boxscore-cat-pills');
  const tableContainer = document.getElementById('boxscore-table-container');
  if (!teamNav || !catPills || !tableContainer) return;

  if (!boxscore || (!boxscore.team1 && !boxscore.team2)) {
    tableContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 24px;">Box score statistics will be populated during live play.</div>`;
    return;
  }

  const team1 = boxscore.team1 || { teamName: 'Team 1', categories: [] };
  const team2 = boxscore.team2 || { teamName: 'Team 2', categories: [] };

  // Render Team Selector buttons
  teamNav.innerHTML = `
    <button class="btn ${activeBoxScoreTeam === 'team1' ? 'btn-primary' : 'btn-outline'}" id="bs-btn-t1" style="font-size: 13px; padding: 6px 14px;">
      ${escapeHtml(team1.teamName)}
    </button>
    <button class="btn ${activeBoxScoreTeam === 'team2' ? 'btn-primary' : 'btn-outline'}" id="bs-btn-t2" style="font-size: 13px; padding: 6px 14px;">
      ${escapeHtml(team2.teamName)}
    </button>
  `;

  document.getElementById('bs-btn-t1').addEventListener('click', () => {
    activeBoxScoreTeam = 'team1';
    activeBoxScoreCatIndex = 0;
    renderBoxScore(boxscore);
  });
  document.getElementById('bs-btn-t2').addEventListener('click', () => {
    activeBoxScoreTeam = 'team2';
    activeBoxScoreCatIndex = 0;
    renderBoxScore(boxscore);
  });

  const curTeam = activeBoxScoreTeam === 'team1' ? team1 : team2;
  const categories = curTeam.categories || [];

  if (categories.length === 0) {
    catPills.innerHTML = '';
    tableContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 24px;">No box score category data available for ${escapeHtml(curTeam.teamName)}.</div>`;
    return;
  }

  if (activeBoxScoreCatIndex >= categories.length) {
    activeBoxScoreCatIndex = 0;
  }

  // Render Category Filter Pills
  catPills.innerHTML = categories.map((cat, idx) => `
    <button class="boxscore-cat-btn ${idx === activeBoxScoreCatIndex ? 'active' : ''}" data-idx="${idx}">
      ${escapeHtml(cat.displayName || cat.name)}
    </button>
  `).join('');

  catPills.querySelectorAll('.boxscore-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBoxScoreCatIndex = parseInt(btn.dataset.idx, 10) || 0;
      renderBoxScore(boxscore);
    });
  });

  // Render Category Table
  const currentCat = categories[activeBoxScoreCatIndex];
  if (!currentCat || !currentCat.athletes || currentCat.athletes.length === 0) {
    tableContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 24px;">No player statistics recorded for ${escapeHtml(currentCat?.displayName || 'this category')}.</div>`;
    return;
  }

  const headers = ['ATHLETE', ...(currentCat.labels || [])];
  const sportPath = currentIntel?.sportPath || '';

  const tableHtml = `
    <table class="boxscore-table">
      <thead>
        <tr>
          ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${currentCat.athletes.map(ath => `
          <tr>
            <td>
              <div class="boxscore-athlete-cell" onclick="openAthleteProfile('${escapeHtml(ath.id)}', '${escapeHtml(sportPath)}', '${escapeHtml(ath.name)}')">
                <img class="boxscore-athlete-avatar" src="${escapeHtml(ath.headshot)}" alt="${escapeHtml(ath.name)}" onerror="this.src='https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90'">
                <span>
                  ${escapeHtml(ath.name)}
                  ${ath.jersey ? `<span style="color: #a78bfa; font-weight: 700;">#${escapeHtml(ath.jersey)}</span>` : ''}
                  ${ath.position ? `<span style="font-size: 11px; color: var(--text-dim); font-weight: 600;">${escapeHtml(ath.position)}</span>` : ''}
                </span>
              </div>
            </td>
            ${(ath.stats || []).map(val => `<td>${escapeHtml(val)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  tableContainer.innerHTML = tableHtml;
}

// Render Team Rosters Component
function renderRosters(rosters) {
  const rosterNav = document.getElementById('roster-team-nav');
  const gridContainer = document.getElementById('roster-grid-container');
  if (!rosterNav || !gridContainer) return;

  if (!rosters || (!rosters.team1 && !rosters.team2)) {
    gridContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 24px;">Roster information will be available once confirmed.</div>`;
    return;
  }

  const t1Name = currentIntel?.scoreboard?.team1?.name || 'Team 1';
  const t2Name = currentIntel?.scoreboard?.team2?.name || 'Team 2';

  rosterNav.innerHTML = `
    <button class="btn ${activeRosterTeam === 'team1' ? 'btn-primary' : 'btn-outline'}" id="ros-btn-t1" style="font-size: 13px; padding: 6px 14px;">
      ${escapeHtml(t1Name)} Roster
    </button>
    <button class="btn ${activeRosterTeam === 'team2' ? 'btn-primary' : 'btn-outline'}" id="ros-btn-t2" style="font-size: 13px; padding: 6px 14px;">
      ${escapeHtml(t2Name)} Roster
    </button>
  `;

  document.getElementById('ros-btn-t1').addEventListener('click', () => {
    activeRosterTeam = 'team1';
    renderRosters(rosters);
  });
  document.getElementById('ros-btn-t2').addEventListener('click', () => {
    activeRosterTeam = 'team2';
    renderRosters(rosters);
  });

  const athletes = activeRosterTeam === 'team1' ? (rosters.team1 || []) : (rosters.team2 || []);
  const sportPath = currentIntel?.sportPath || '';

  if (athletes.length === 0) {
    gridContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 24px;">No roster members found for this team.</div>`;
    return;
  }

  gridContainer.innerHTML = athletes.map(ath => `
    <div class="roster-card" onclick="openAthleteProfile('${escapeHtml(ath.id)}', '${escapeHtml(sportPath)}', '${escapeHtml(ath.name)}')">
      <img class="roster-avatar" src="${escapeHtml(ath.headshot)}" alt="${escapeHtml(ath.name)}" onerror="this.src='https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90'">
      <div style="overflow: hidden;">
        <div style="font-weight: 800; color: #fff; font-size: 13px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">
          ${escapeHtml(ath.name)}
        </div>
        <div style="font-size: 11px; color: #a78bfa; font-weight: 700;">
          ${ath.jersey ? '#' + escapeHtml(ath.jersey) + ' • ' : ''}${escapeHtml(ath.position || 'Player')}
        </div>
        ${ath.teamName ? `<div style="font-size: 10px; color: var(--text-dim); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${escapeHtml(ath.teamName)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// Open StatMuse / Basketball-Reference Grade Athlete Profile
window.openAthleteProfile = async function(athleteId, sportPath, fallbackName) {
  const modal = document.getElementById('player-profile-modal');
  if (!modal) return;

  // Reset & Show Modal Loading State
  document.getElementById('prof-name').textContent = fallbackName || 'Loading Athlete...';
  document.getElementById('prof-jersey').textContent = '#--';
  document.getElementById('prof-team-pos').textContent = 'Profile Loading...';
  document.getElementById('prof-ht-wt').textContent = 'Ht/Wt: --';
  document.getElementById('prof-age').textContent = 'Age: --';
  document.getElementById('prof-college').textContent = 'College: --';
  document.getElementById('prof-exp').textContent = 'Exp: --';
  document.getElementById('prof-stats-grid').innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 20px;">Fetching player metrics...</div>`;
  document.getElementById('prof-bio-text').textContent = 'Loading official player background and career information...';
  modal.classList.add('show');

  // Parse sport and league (e.g. 'football/nfl' -> sport='football', league='nfl')
  let sport = 'football';
  let league = 'nfl';
  if (sportPath && sportPath.includes('/')) {
    const parts = sportPath.split('/');
    sport = parts[0];
    league = parts[1];
  } else if (state.activeStream?.category) {
    sport = state.activeStream.category;
    league = state.activeStream.league || (sport === 'football' ? 'nfl' : 'nba');
  }

  try {
    const res = await fetch(`/api/v1/athlete/${encodeURIComponent(sport)}/${encodeURIComponent(league)}/${encodeURIComponent(athleteId)}`);
    if (res.ok) {
      const data = await res.json();
      document.getElementById('prof-name').textContent = data.name || fallbackName;
      document.getElementById('prof-jersey').textContent = data.jersey ? `#${data.jersey}` : '';
      document.getElementById('prof-team-pos').textContent = `${data.teamName || 'Pro Team'} • ${data.position || 'Athlete'}`;
      document.getElementById('prof-ht-wt').textContent = `Ht/Wt: ${data.height || '--'}, ${data.weight || '--'}`;
      document.getElementById('prof-age').textContent = data.age ? `Age: ${data.age}` : 'Age: --';
      document.getElementById('prof-college').textContent = `College: ${data.college || 'N/A'}`;
      document.getElementById('prof-exp').textContent = `Exp: ${data.experience || 'Pro'}`;
      document.getElementById('prof-headshot').src = data.headshot || 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90';

      const statsGrid = document.getElementById('prof-stats-grid');
      if (data.overviewStats && data.overviewStats.length > 0) {
        statsGrid.innerHTML = data.overviewStats.map(s => `
          <div class="profile-stat-box">
            <div class="profile-stat-val">${escapeHtml(s.value)}</div>
            <div class="profile-stat-lbl">${escapeHtml(s.label)}</div>
          </div>
        `).join('');
      } else {
        statsGrid.innerHTML = `
          <div class="profile-stat-box"><div class="profile-stat-val">Active</div><div class="profile-stat-lbl">Status</div></div>
          <div class="profile-stat-box"><div class="profile-stat-val">Pro</div><div class="profile-stat-lbl">Tier</div></div>
          <div class="profile-stat-box"><div class="profile-stat-val">Verified</div><div class="profile-stat-lbl">Roster</div></div>
        `;
      }

      document.getElementById('prof-bio-text').textContent = data.biography || `${data.name} is an active competitor currently featuring in live league action.`;
    }
  } catch (err) {
    document.getElementById('prof-bio-text').textContent = `Overview for ${fallbackName || 'Player'}. Complete seasonal analytics will be synced.`;
  }
};

// Modal Live Chat
function setupModalChat(streamKey) {
  if (modalChatEventSource) {
    modalChatEventSource.close();
    modalChatEventSource = null;
  }

  const container = document.getElementById('modal-chat-messages');
  if (!container) return;
  container.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 10px; text-align: center;">Connecting to live stream chat...</div>';

  try {
    modalChatEventSource = new EventSource(`/api/v1/chat/${encodeURIComponent(streamKey)}/events`);

    modalChatEventSource.addEventListener('history', (e) => {
      const msgs = JSON.parse(e.data);
      container.innerHTML = '';
      msgs.forEach(appendModalChatMessage);
      container.scrollTop = container.scrollHeight;
    });

    modalChatEventSource.addEventListener('chat_message', (e) => {
      const msg = JSON.parse(e.data);
      appendModalChatMessage(msg);
      container.scrollTop = container.scrollHeight;
    });
  } catch (e) {}

  function appendModalChatMessage(msg) {
    const div = document.createElement('div');
    div.className = 'chat-bubble';
    div.style.margin = '4px 8px';
    div.innerHTML = `
      <span class="chat-badge">${escapeHtml(msg.badge || 'Fan')}</span>
      <span class="chat-user">${escapeHtml(msg.username)}:</span>
      <span>${escapeHtml(msg.message)}</span>
    `;
    container.appendChild(div);
  }
}

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  const iframe = document.getElementById('modal-iframe');
  iframe.src = '';
  modal.classList.remove('show');
  state.activeStream = null;

  if (intelPollTimer) {
    clearInterval(intelPollTimer);
    intelPollTimer = null;
  }

  if (modalChatEventSource) {
    modalChatEventSource.close();
    modalChatEventSource = null;
  }
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

