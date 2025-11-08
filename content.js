// content.js
(async () => {
  const CACHE_KEY = 'bloxodes-cache-v1';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const EDGE_FUNCTION_URL = 'https://bmwksaykcsndsvgspapz.supabase.co/functions/v1/roblox-codes';
  const DEFAULT_SITE_BASE_URL = 'https://bloxodes.com';
  const memoryCache = new Map();

  function normalizeRobloxUrl(url) {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`;
    } catch {
      return url;
    }
  }

  // extract numeric place id from Roblox game URL
  function getRobloxPlaceId(url) {
    const m = url.match(/roblox\.com\/games\/(\d+)/);
    return m ? m[1] : null;
  }

  function getGameNameFromPage() {
    const h = document.querySelector('.game-name');
    return h ? h.textContent.trim() : '';
  }

  async function getCache(key) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const item = parsed[key];
      if (!item) return null;
      if (Date.now() - item.ts > CACHE_TTL_MS) return null;
      return item.data;
    } catch {
      return null;
    }
  }

  async function setCache(key, data) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[key] = { ts: Date.now(), data };
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  }

  function getMemoryCache(key) {
    return memoryCache.get(key) || null;
  }

  function setMemoryCache(key, data) {
    memoryCache.set(key, data);
  }

  function callEdgeFunction(payload) {
    return new Promise((resolve) => {
      if (!chrome.runtime?.sendMessage) {
        resolve({ ok: false, error: 'runtime-messaging-unavailable' });
        return;
      }

      try {
        chrome.runtime.sendMessage(
          {
            type: 'bloxodes-fetch-game',
            payload
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(response || { ok: false, error: 'no-response' });
          }
        );
      } catch (err) {
        resolve({ ok: false, error: err?.message || 'sendMessage-failed' });
      }
    });
  }

  function sanitizeData(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        game: null,
        codes: [],
        totalCodes: 0,
        siteBaseUrl: DEFAULT_SITE_BASE_URL,
        activeCount: 0
      };
    }

    const clone = { ...raw };
    const codesArray = Array.isArray(raw.codes) ? raw.codes : [];
    const filtered = codesArray.filter((c) => {
      const status = typeof c?.status === 'string' ? c.status.trim().toLowerCase() : '';
      return status === 'active';
    });

    const sorted = filtered.slice().sort((a, b) => {
      const aDate = new Date(a?.last_seen_at || a?.first_seen_at || a?.created_at || 0).getTime();
      const bDate = new Date(b?.last_seen_at || b?.first_seen_at || b?.created_at || 0).getTime();
      return bDate - aDate;
    });

    const activeCountNumeric = sorted.length;
    const activeCountDisplay =
      typeof raw.activeCount === 'string'
        ? raw.activeCount
        : typeof raw.activeCount === 'number'
          ? raw.activeCount
          : activeCountNumeric >= 201
            ? '200+'
            : activeCountNumeric;

    clone.codes = sorted;
    clone.totalCodes =
      typeof raw.totalCodes === 'number'
        ? raw.totalCodes
        : sorted.length >= 201
          ? '200+'
          : sorted.length;
    clone.activeCount = activeCountDisplay;
    clone.siteBaseUrl = raw.siteBaseUrl || DEFAULT_SITE_BASE_URL;
    clone.game = raw.game || null;

    return clone;
  }

  // fetch game + codes via Supabase Edge Function
  async function fetchGameAndCodes({ robloxUrl, robloxPlaceId, gameName }) {
    try {
      const response = await callEdgeFunction({
        edgeUrl: EDGE_FUNCTION_URL,
        robloxUrl,
        robloxPlaceId,
        gameName
      });

      if (!response?.ok) {
        throw new Error(response?.error || 'edge-call-failed');
      }

      const payload = response.data || {};
      return sanitizeData(payload);
    } catch (err) {
      console.warn('[Bloxodes] Failed to reach edge function:', err);
      return sanitizeData(null);
    }
  }

  // build UI
  function buildPanel({ game, codes, siteBaseUrl, totalCodes, activeCount }) {
    const panel = document.createElement('div');
    panel.className = 'bloxodes-panel';
    panel.dataset.bloxodesPanel = 'true';

    const items = (codes || []).slice(0, 9);
    const gameName = game ? game.name : 'Roblox';
    const normalizeStatus = (value) => {
      if (typeof value !== 'string') return '';
      return value.trim().toLowerCase();
    };
    const isActive = (status) => {
      const norm = normalizeStatus(status);
      return norm.startsWith('active');
    };
    const normalizeActiveCountValue = (value) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.endsWith('+')) return trimmed;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : trimmed;
      }
      return null;
    };
    const activeCountFromPayload =
      typeof activeCount === 'number' || typeof activeCount === 'string'
        ? normalizeActiveCountValue(activeCount)
        : null;
    const activeCountFromList = Array.isArray(codes)
      ? codes.filter((c) => isActive(c?.status)).length
      : 0;
    const headlineActiveCount =
      activeCountFromPayload !== null
        ? activeCountFromPayload
        : activeCountFromList;
    const headlineActiveCountDisplay =
      typeof headlineActiveCount === 'number'
        ? headlineActiveCount >= 201
          ? '200+'
          : headlineActiveCount
        : headlineActiveCount;

    const topRightLink =
      game && siteBaseUrl
        ? `<a class="bloxodes-top-link"
               href="${siteBaseUrl.replace(/\/$/, '')}/${game.slug}"
               target="_blank" rel="noopener noreferrer">
              View full codes guide →
           </a>`
        : '';

    panel.innerHTML = `
      <div class="bloxodes-head">
        <div>
          <h2 class="bloxodes-title">Active ${gameName} Codes</h2>
          <p class="bloxodes-subtitle">Right now, there are ${headlineActiveCountDisplay} active codes you can use.</p>
        </div>
        ${topRightLink}
      </div>

      <div class="bloxodes-codes-wrap">
        ${items
          .map((c, i) => {
            const reward =
              c.rewards_text && c.rewards_text.trim()
                ? c.rewards_text.trim()
                : 'Pet and Rewards';
            return `
              <div class="bloxodes-code-row" data-index="${i}" data-status="${c.status}">
                <div class="bloxodes-top-line">
                  <div class="bloxodes-pill" title="${c.code}">${c.code}</div>
                  <button class="bloxodes-copy" data-code="${c.code}" type="button" aria-label="Copy ${c.code}">
                    <span class="bloxodes-copy-icon" aria-hidden="true"></span>
                    <span class="bloxodes-copy-label">Copy</span>
                  </button>
                </div>
                <div class="bloxodes-desc-line" title="${reward}">
                  ${reward}
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;

    // copy logic
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('.bloxodes-copy');
      if (!btn) return;
      const code = btn.getAttribute('data-code');
      if (!code) return;
      navigator.clipboard.writeText(code).catch(() => {});
      btn.classList.add('is-copied');
      const lbl = btn.querySelector('.bloxodes-copy-label');
      if (lbl) lbl.textContent = 'Copied';
      setTimeout(() => {
        btn.classList.remove('is-copied');
        if (lbl) lbl.textContent = 'Copy';
      }, 1200);
    });

    return panel;
  }

  // wait for container
  function waitForTabsContainer() {
    return new Promise((resolve) => {
      const el = document.querySelector('.col-xs-12.rbx-tabs-horizontal');
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const el2 = document.querySelector('.col-xs-12.rbx-tabs-horizontal');
        if (el2) {
          obs.disconnect();
          resolve(el2);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, 10000);
    });
  }

  // main
  const tabs = await waitForTabsContainer();
  if (!tabs) return;

  const currentUrl = normalizeRobloxUrl(location.href);
  const placeId = getRobloxPlaceId(currentUrl);
  const pageName = getGameNameFromPage();

  const memoryCachedRaw = getMemoryCache(currentUrl);
  const memoryCached = memoryCachedRaw ? sanitizeData(memoryCachedRaw) : null;
  const diskCachedRaw = memoryCached ? null : await getCache(currentUrl);
  const diskCached = diskCachedRaw ? sanitizeData(diskCachedRaw) : null;
  let data;
  if (memoryCached) {
    data = memoryCached;
  } else if (diskCached) {
    data = diskCached;
    setMemoryCache(currentUrl, data);
  } else {
    data = await fetchGameAndCodes({
      robloxUrl: currentUrl,
      robloxPlaceId: placeId,
      gameName: pageName
    });
    await setCache(currentUrl, data);
    setMemoryCache(currentUrl, data);
  }

  // only surface UI when we have a matching article
  if (!data?.game) return;

  const panel = buildPanel({
    game: data.game,
    codes: data.codes || [],
    siteBaseUrl: data.siteBaseUrl || DEFAULT_SITE_BASE_URL,
    totalCodes: data.totalCodes,
    activeCount: typeof data.activeCount === 'number' ? data.activeCount : data.activeCount
  });

  const keepPanelPinned = (container, node) => {
    if (!container || !node) return;
    let isAdjusting = false;

    const adjust = () => {
      if (!node.isConnected) return;
      const firstElement = Array.from(container.children).find((el) => el.nodeType === Node.ELEMENT_NODE);
      if (firstElement !== node) {
        isAdjusting = true;
        container.insertBefore(node, firstElement ?? null);
        requestAnimationFrame(() => {
          isAdjusting = false;
        });
      }
    };

    adjust();

    const observer = new MutationObserver(() => {
      if (isAdjusting) return;
      adjust();
    });
    observer.observe(container, { childList: true });
  };

  tabs.prepend(panel);
  keepPanelPinned(tabs, panel);
})();
