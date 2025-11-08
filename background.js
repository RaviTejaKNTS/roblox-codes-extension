const EDGE_TIMEOUT_MS = 15000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'bloxodes-fetch-game') return false;

  (async () => {
    try {
      const payload = message.payload || {};
      const { edgeUrl, ...body } = payload;

      if (!edgeUrl) {
        sendResponse({ ok: false, error: 'missing-edge-url' });
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);

      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        sendResponse({
          ok: false,
          error: `edge-status-${res.status}`,
          status: res.status,
          body: text
        });
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        sendResponse({ ok: false, error: 'edge-invalid-json' });
        return;
      }

      sendResponse({ ok: true, data });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || 'edge-fetch-failed' });
    }
  })();

  return true;
});

