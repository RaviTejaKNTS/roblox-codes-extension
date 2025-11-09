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
      return {
        ok: true,
        data: sanitizeData(payload),
        error: null
      };
    } catch (err) {
      const message = err?.message || 'edge-call-failed';
      console.warn('[Bloxodes] Failed to reach edge function:', message);
      return {
        ok: false,
        data: sanitizeData(null),
        error: message
      };
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

  function buildStatusPanel({ title, message, ctaLabel, onCtaClick, tone = 'info' }) {
    const panel = document.createElement('div');
    const modifier = tone ? ` bloxodes-panel--${tone}` : '';
    panel.className = `bloxodes-panel bloxodes-panel--status${modifier}`;
    panel.dataset.bloxodesPanel = 'true';

    const buttonMarkup = ctaLabel
      ? `<button class="bloxodes-status-btn" type="button">${ctaLabel}</button>`
      : '';

    panel.innerHTML = `
      <div class="bloxodes-head">
        <div>
          <h2 class="bloxodes-title">${title}</h2>
          <p class="bloxodes-subtitle">${message}</p>
        </div>
        ${buttonMarkup}
      </div>
    `;

    if (ctaLabel && typeof onCtaClick === 'function') {
      const btn = panel.querySelector('.bloxodes-status-btn');
      if (btn) {
        let busy = false;
        btn.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          const prevText = btn.textContent;
          btn.textContent = 'Retrying…';
          btn.disabled = true;
          try {
            await onCtaClick({ button: btn });
          } finally {
            if (!btn.isConnected) return;
            btn.disabled = false;
            btn.textContent = prevText;
            busy = false;
          }
        });
      }
    }

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

  async function loadData({ bypassCache = false } = {}) {
    const normalizedUrl = normalizeRobloxUrl(location.href);
    const placeId = getRobloxPlaceId(normalizedUrl);
    const pageName = getGameNameFromPage();

    if (!bypassCache) {
      const memoryCachedRaw = getMemoryCache(normalizedUrl);
      const memoryCached = memoryCachedRaw ? sanitizeData(memoryCachedRaw) : null;
      if (memoryCached?.game) {
        return {
          data: memoryCached,
          status: 'cache',
          error: null
        };
      }

      const diskCachedRaw = await getCache(normalizedUrl);
      const diskCached = diskCachedRaw ? sanitizeData(diskCachedRaw) : null;
      if (diskCached?.game) {
        setMemoryCache(normalizedUrl, diskCached);
        return {
          data: diskCached,
          status: 'cache',
          error: null
        };
      }
    } else {
      memoryCache.delete(normalizedUrl);
    }

    const result = await fetchGameAndCodes({
      robloxUrl: normalizedUrl,
      robloxPlaceId: placeId,
      gameName: pageName
    });

    const nextStatus = result.ok
      ? result.data?.game
        ? 'fresh'
        : 'empty'
      : 'error';

    if (result.ok && result.data?.game) {
      await setCache(normalizedUrl, result.data);
      setMemoryCache(normalizedUrl, result.data);
    }

    return {
      data: result.data,
      status: nextStatus,
      error: result.error || null
    };
  }

  const tabs = await waitForTabsContainer();
  if (!tabs) return;

  let mountedPanel = null;
  let detachPinnedPanel = null;

  function mountPanel(node) {
    if (mountedPanel?.isConnected) {
      mountedPanel.remove();
    }
    if (typeof detachPinnedPanel === 'function') {
      detachPinnedPanel();
      detachPinnedPanel = null;
    }
    tabs.prepend(node);
    detachPinnedPanel = keepPanelPinned(tabs, node);
    mountedPanel = node;
  }

  function renderDataPanel(data) {
    const panel = buildPanel({
      game: data.game,
      codes: data.codes || [],
      siteBaseUrl: data.siteBaseUrl || DEFAULT_SITE_BASE_URL,
      totalCodes: data.totalCodes,
      activeCount: data.activeCount
    });
    mountPanel(panel);
  }

  function renderNoMatchPanel() {
    const panel = buildStatusPanel({
      title: 'No codes yet',
      message: 'We have not published a guide for this experience. Check back soon.',
      tone: 'info'
    });
    mountPanel(panel);
  }

  function renderErrorPanel(errorMessage) {
    const friendlyMessage =
      errorMessage === 'edge-status-429'
        ? 'We are receiving a lot of traffic right now. Please try again shortly.'
        : 'We could not reach Bloxodes right now. Check your connection and try again.';
    const panel = buildStatusPanel({
      title: 'Codes are unavailable',
      message: friendlyMessage,
      ctaLabel: 'Try again',
      onCtaClick: () => hydrateAndRender({ bypassCache: true }),
      tone: 'error'
    });
    mountPanel(panel);
  }

  function renderResult(result) {
    if (result.data?.game) {
      renderDataPanel(result.data);
      return;
    }

    if (result.status === 'error') {
      renderErrorPanel(result.error);
      return;
    }

    renderNoMatchPanel();
  }

  async function hydrateAndRender({ bypassCache = false } = {}) {
    const result = await loadData({ bypassCache });
    renderResult(result);
  }

  function keepPanelPinned(container, node) {
    if (!container || !node) return () => {};
    let adjusting = false;

    const ensureTopPosition = () => {
      if (!node.isConnected || node.parentElement !== container) {
        adjusting = true;
        try {
          container.prepend(node);
        } catch {
          // ignore
        }
        queueMicrotask(() => {
          adjusting = false;
        });
        return;
      }

      const firstElement = container.firstElementChild;
      if (firstElement !== node) {
        adjusting = true;
        container.insertBefore(node, firstElement ?? null);
        requestAnimationFrame(() => {
          adjusting = false;
        });
      }
    };

    ensureTopPosition();

    const observer = new MutationObserver(() => {
      if (adjusting) return;
      ensureTopPosition();
    });
    observer.observe(container, { childList: true });

    return () => observer.disconnect();
  }

  hydrateAndRender();
})();
