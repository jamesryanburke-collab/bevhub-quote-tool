# Bev-Hub combined site - review build

This is a staged source package. Live Cloudflare site has not been changed.

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
- Build could not be run in this environment because npm dependencies were unavailable over the network. Source-pattern validation completed; validate build before deployment.
