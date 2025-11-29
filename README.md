# Roblox Codes Injector (Supabase)

This Chrome extension injects your game codes (from Supabase) directly into Roblox game pages under the main content.  
It now calls a Supabase Edge Function so you can keep private keys off the client, with a background service worker proxying the request so Roblox's CSP can't block it.

## How it matches a game
- The content script passes the normalized Roblox URL, numeric place ID, and visible name to the edge function.
- Your edge function can use any lookup strategy; the provided sample matches by place ID and returns the corresponding game row plus active codes.

## Where it injects
- It tries to append inside the container:
  `.col-xs-12.section-content.game-main-content.remove-panel.follow-button-enabled`
- If this selector isn't present, it falls back to `.game-calls-to-action` or `.game-main-content`.

## Link placement
- Below the codes panel, it renders a link to your site:
  `{{siteBaseUrl}}/codes/{{slug}}` (the edge function controls the base URL it returns).

## Setup
1. Deploy the Supabase Edge Function that returns `{ game, codes, totalCodes, activeCount, siteBaseUrl }` for a given Roblox page.  
   Update `EDGE_FUNCTION_URL` inside `src/content/index.js` with your project’s function URL (for example `https://<project-ref>.supabase.co/functions/v1/roblox-codes`).  
   The background service worker forwards `{ robloxUrl, robloxPlaceId, gameName }` to that endpoint to avoid Roblox’s strict CSP.
2. Install dependencies and bundle the extension:
   ```bash
   npm install
   npm run build
   ```
   The optimized scripts are written to `dist/` (single bundled content script + background worker).
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist` folder.
4. Visit a Roblox game page; the panel should appear after a moment if the function resolves a matching article.

## Supabase calls (inside the Edge Function)
- `GET /rest/v1/games?select=id,name,slug,roblox_link&roblox_link=ilike.%{{placeId}}%`
- `GET /rest/v1/codes?select=code,status,rewards_text,is_new,last_seen_at&game_id=eq.{{id}}&status=eq.active&order=last_seen_at.desc`

Implement the function using the service role key (kept server-side) or other secure credentials, and return only the data the extension needs.

## Packaging for the Chrome Web Store
1. Ensure dependencies are installed (`npm install`) and run `npm run build`. This emits the MV3 bundle, copies the manifest, and pulls icons into `dist/`.
2. Inspect `dist/manifest.json` to confirm the version string, description, permissions, and script paths match what you intend to ship.
3. From inside `dist/`, create the upload artifact (for example `zip -r ../bloxodes-<version>.zip .`). Only include the built assets—no `node_modules`, `.git`, or tooling files.
4. Load the `dist/` folder via **Load unpacked** for a manual smoke test on both `www.roblox.com` and `web.roblox.com`.
5. Upload the `.zip` in the Chrome Web Store dashboard, fill out the metadata, and keep the archive so you can diff future submissions.

## Pre-release checklist
- Bump the semantic version in both `manifest.json` and `package.json` before every store submission.
- Confirm only the required host permissions are listed (the extension now limits itself to your Supabase Edge URL).
- Capture updated screenshots (1280×800 recommended) that show the panel, fallback states, and copy-to-clipboard flow.
- Host a short privacy policy/support page that states no personal data is collected—the listing requires these URLs.
- Run `npm run build` locally; if it fails because `vite` is missing, rerun `npm install` before retrying the build.
- Test error handling by temporarily blocking the edge endpoint—you should see the in-product fallback panel with the retry button.


Generated on: 2025-10-29T21:16:09.483552
