# Shared-password workspace development copy

This local variant uses Cloudflare Pages Functions, D1 and private R2 with one site password. It is not deployed. Follow SHARED-PASSWORD-SETUP.md before publishing. The historical notes below describe the earlier preview baseline.

# Bev-Hub combined site - review build

This is a staged source package. Live Cloudflare site has not been changed.

## Local review fixes
- `src/App.jsx` is the authoritative calculator entry point; the unused root `App.jsx` was removed.
- Annual saved quotes (including legacy quotes without a program field) transfer annual cases. Flex/trial imports ask whether to clear or retain an existing annual commitment; cancel leaves the record unchanged.
- Calculator PDF pagination keeps signature blocks and ordinary rows/paragraphs together when they fit on one page. Pricing formulas and quote/contract wording are unchanged.

## Changes
- One main navigation for Tolling Calculator and Contract Exhibits A–D.
- Existing calculator calculation function unchanged.
- Quote shows individual additional-charge materials with an unchanged materials subtotal, both on-screen and in exported HTML/PDF.
- Contract exhibit generator at `/contracts/index.html`. Local browser client library, JSON/ZIP backup, file attachments, page selection are maintained.

## Deployment
1. Extract ZIP and `npm install`, `npm run build`, `npm run dev`.
2. Test annual/flex/trial quotes, materials included/client-supplied, and PDF exports.
3. Publish to **separate preview branch**. Do not overwrite live `main` until approved.
4. Existing Cloudflare Pages settings: Vite build `npm run build`, output `dist`.

## Known limitations
- Browser client records are not shared between devices; this is NOT centralized cloud storage. Do not treat it as a customer-record database.
- Pricing does not automatically transfer from the tolling calculator to Exhibits A–D. Export approved quote PDF and upload to Exhibit A.
- Existing repository is public: NEVER commit real client data, quotes or agreements.
- Local review validation passed: production build, the six built-in calculation checks, 32 independent pricing scenarios, and browser workflow/PDF checks. `npm test` runs 18 quote-import regression scenarios using Node's built-in test runner. The review build reused the workspace's installed dependencies because a fresh install was blocked by proxy connectivity.

## Preview access prerequisite
The client-side password gate has been removed locally. Enable the Pages preview access policy and verify its coverage before publishing this update. Authentication is provided by Cloudflare Access; the Logout button uses `/cdn-cgi/access/logout`. Protect both preview aliases and unique deployment URLs, including `/contracts/index.html`. Production and `main` remain unchanged.
