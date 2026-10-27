# Shared password + shared records (preview only)

This is the simplified alternative requested for the owner, CEO and COO. It uses **Cloudflare Pages + D1 + private R2**, one server-checked site password, and one shared library. There is no Supabase, Google sign-in, email delivery, user registration or invitation system.

## Current state

Implemented and tested locally in an isolated preview copy. No remote resources have been provisioned, no account credentials are connected in this environment, and no changes have been pushed or deployed. The existing Cloudflare preview and production continue to run the previously approved build.

## Connect Cloudflare resources

Use dedicated PREVIEW resources. Do not bind this build to production data.

1. Create a D1 database named `bevhub-preview`. Run `migrations/001_shared_password.sql` using its SQL console. This creates only empty application tables (no customer information).
2. Create a **private** R2 Standard bucket named `bevhub-preview-files`. Leave public access and custom public domains disabled. Activating R2 may require a billing profile; do not enable any paid plan without owner review. Free allowances are not an unlimited-spend guarantee.
3. In **Workers & Pages → bevhub-quote-tool → Settings → Bindings**, select the **Preview** environment. Bind D1 as `DB` and R2 as `FILES`. Bindings must be available to Pages Functions, not just the frontend build.
4. Under **Preview Variables and Secrets**, add encrypted server secrets:
   - `SITE_PASSWORD`: a unique strong passphrase, at least 16 characters (never reuse the old source-code password).
   - `SESSION_SECRET`: at least 32 random characters, independently generated.
   Enter these in Cloudflare; do not paste them into chat, GitHub, frontend `VITE_*` variables or a committed file. `.dev.vars.example` contains placeholders only, for local developer setup. Real `.dev.vars*` files are ignored.
5. Keep the existing Cloudflare Access restriction while the preview is tested. Approve a push to `bev-hub-preview` only after reviewing this change. Pages automatically bundles `functions/api/[[path]].js`; the frontend still builds with `npm run build`, output `dist`.
6. Test the password gate, both browsers, record edits, files and exports on the stable preview URL. Once the application's password gate and API protection are confirmed live, the owner may remove the preview's existing Cloudflare Access application so the CEO/COO need only the shared password. `main`, production and its access settings remain untouched.

## Behavior

- The password is checked only in Pages Functions. It is never embedded in downloadable JS, cookies, API responses or the database. Cloudflare stores the configured server secret; sessions store only random-token hashes.
- Sessions last eight hours and use `HttpOnly; Secure; SameSite=Strict` cookies. Logging out deletes that browser session. Rotating either server secret invalidates all previous sessions. The frontend keeps open calculator drafts hidden during session expiry so signing back in can continue them.
- Five login attempts per source IP/15-minute bucket are allowed. Mutating API calls require the same Origin to protect browser sessions from cross-site requests. The application fails closed if required secrets or bindings are missing.
- All signed-in browsers see the same records. There are no user identities, per-person revocation or individual edit attribution. Everyone with the shared password can create, edit and delete shared records. Share the password only with intended users.
- Quotes refresh every 15 seconds and on focus. Open drafts retain their original version; stale saves return a conflict. Reopen the record to load shared changes. Customers use Save Client/autosave; Reload shared clients loads changes made elsewhere. Contract drafts stay mounted when switching calculator/exhibit tabs so pending autosaves can finish.
- Existing browser records are imported explicitly with `Import browser quotes` and `Import browser clients`. Local copies remain unchanged. If old data belongs to another deployment hostname, export it there and restore it on the stable preview origin. Backups from shared records create a new customer rather than overwriting an existing record.
- Records are soft-deleted and previous revisions retained in D1 for administrator recovery. Private immutable R2 object versions are retained; replaced/deleted attachments become inaccessible via the application. Administrative retention cleanup and database exports remain necessary. This is not a permanent-erasure system or an automated backup service.
- Individual uploads are capped at 20 MB. A conservative cumulative 512 MB application attachment quota counts retained versions and prevents further uploads when full. This guard does not cover every possible provider billing dimension (requests or database history); monitor Cloudflare's free allowances and do not enable automatic paid upgrades.

## Tests

`npm ci --ignore-scripts`, `npm run build`, `npm test` (Node 24 used locally).

Server tests run the actual Pages function against SQLite via a D1-compatible fixture and private object storage mocks. They cover password checks, rate limiting, cookie flags, expiry, logout and secret rotation, unauthenticated denial, quote numbering, version conflicts, history, private files, tombstone re-upload and the storage budget. Separate tests lock the pricing blocks and contract PDF authoring to the approved preview, and exercise the quote-to-contract import rules.

The local browser harness `test-support/browser-server.cjs` binds only to loopback and generates random synthetic test credentials at runtime. It is never deployed. Two-browser acceptance tests cover shared quote/customer/attachment access, conflict handling, PDF/ZIP export and sign-out. These do not substitute for a smoke test against live Cloudflare D1/R2 and encrypted environment bindings.
