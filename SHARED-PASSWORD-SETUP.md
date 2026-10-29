# Shared-password workspace setup

Bev-Hub uses Cloudflare Pages Functions, D1 and private R2 with one server-checked password. There is no Supabase, Google account requirement, invitation system or per-user identity.

The shared workspace has been deployed on `bev-hub-preview`; the owner reported successful login and sharing. The earlier manual Cloudflare Access email gate was removed by the owner. These are historical observations, not a current dashboard inspection. `main` remains the older production application. See [RELEASE-READINESS.md](RELEASE-READINESS.md) for the review findings and controlled release procedure.

## Pages configuration

| Setting | Value |
| --- | --- |
| Repository | `jamesryanburke-collab/bevhub-quote-tool` |
| Production branch | `main` — keep unchanged until release approval |
| Preview source | `bev-hub-preview` |
| Framework | Vite |
| Root directory | repository root (blank or `/`) |
| Build command | `npm run build` |
| Output directory | `dist` |
| Build system | v3 (last shown by owner; reconfirm) |
| Node | Pin `NODE_VERSION=24.19.0` for the tested toolchain |

Pages must deploy the repository-root `functions/` directory with the build. Do not upload only `dist` through a static-only uploader; the password/API requires Pages Functions. No frontend `VITE_*` secret is needed.

## Preview resources

In **Workers & Pages → bevhub-quote-tool → Settings**, select **Preview** in the upper-right environment dropdown before editing:

| Type | Binding name (case sensitive) | Resource |
| --- | --- | --- |
| D1 database | `DB` | `bevhub-preview` |
| R2 Standard bucket | `FILES` | `bevhub-preview-files` |
| Encrypted server secret | `SITE_PASSWORD` | unique passphrase, at least 16 characters |
| Encrypted server secret | `SESSION_SECRET` | independent random value, at least 32 characters |

The previously shown preview D1 ID was `b85565e8-f720-4c66-9e23-8563cd4a2c2f`. Reconfirm the resource in the dashboard. Keep R2 public access, `r2.dev`, and public custom domains disabled.

Run `migrations/001_shared_password.sql` **once on a new empty database**. It is not an idempotent upgrade script; do not rerun it against an existing workspace. Verify these six tables and the history trigger exist: `records`, `record_history`, `files`, `sessions`, `login_attempts`, `storage_budget`; trigger `keep_record_history`. The budget table must have its initial row. The owner previously executed this for preview.

Enter fresh secret values privately in Cloudflare, select **Secret**, and save. Values previously pasted into chat/screenshots should be replaced. Never put them in GitHub, chat, screenshots, frontend build variables or committed `.dev.vars`. `.dev.vars.example` contains placeholders only. Changing either secret invalidates existing sessions. Binding/secret changes require a new deployment to take effect.

Preview settings apply to branch previews generally, not only one branch. A development-branch deployment may inherit these preview resources. Do not use it for destructive tests or real-data experiments; local acceptance tests use their own in-memory fixtures.

## Permissions and storage behavior

- All holders of the shared password can read, create, edit and soft-delete every shared quote, client and attachment. There is no customer-level isolation, individual revocation or individual edit attribution. This is the intentionally selected small-team permission model.
- Password validation happens in the server function. Random session tokens are stored only as hashes in D1. Cookies are `__Host-`, `HttpOnly`, `Secure`, `SameSite=Strict`, and expire after eight hours. Logout revokes that browser's token; rotating either secret invalidates all sessions.
- Five login attempts per IP/time bucket are allowed; mutating requests must have the same Origin. Missing required bindings or undersized secrets fail closed. API responses and private downloads use `no-store`.
- Quote lists refresh every 15 seconds and on focus. Open drafts keep their original revision and stale writes return 409. Clients require **Reload shared clients** to load another browser's changes; download a backup before discarding unsaved edits.
- Quote import populates customer, package, case pack and annual volume for annual quotes. Legacy quotes without a program are annual. Flex/trial imports require an explicit CLEAR/RETAIN choice for an existing annual commitment. Pricing import does not supply approved legal terms, signed agreements or the approved quote PDF: attach the original PDF under Exhibit A.
- D1 retains previous record revisions and soft-deletion history. R2 retains immutable old objects. Superseded/deleted files cannot be downloaded through the normal API. Retention is not an automatic backup or permanent-erasure mechanism; an administrator needs a tested export/recovery procedure.
- Individual uploads are limited to 20 MiB, with a cumulative 512 MiB application budget counting retained uploads. R2 free allowances are account-wide and usage based, not a guaranteed billing cap. Requests, other buckets and database history are not controlled by the attachment limit. Do not enable a paid plan/upgrade as part of release review.

## Existing records

**Import browser quotes** and **Import browser clients** explicitly copy old browser records into the shared workspace while retaining local originals. Client import includes browser IndexedDB attachments. Storage is scoped to hostname: export from the old hostname before switching. A client backup restore creates a new client ID; it is not an ID-preserving cloud migration. Never clear browser storage or delete preview data as a migration step.

For production, use separate production D1/R2 resources and secrets. Decide whether to start empty or preserve the preview library; see the release runbook. Never bind a disposable/test preview to production data.

## Reproducible local checks

Use Node 24.19.0, Python 3.12, and Chromium:

```sh
npm ci
npm run build
npm test
python3 -m pip install -r test-support/requirements-browser.txt
# If no system Chromium is installed:
python3 -m playwright install chromium
npm run test:browser
```

The browser runner starts its own loopback server on an available port, generates temporary synthetic credentials, uses SQLite/private-R2 mocks and removes those credentials on exit. It cannot target a live deployment. `CHROMIUM_PATH` can select a system Chromium executable. Artifacts go to ignored `.artifacts/browser/`.

Tests cover shared quotes/clients, quote-to-contract fields, stale revision conflicts, A–D previews, actual PDFs inside ZIPs, byte-identical source attachments, grouped material prices/modes, selected/client/internal PDF downloads, signed-out denial and logout. Node tests cover authentication, limits, secret rotation, parent-client file permissions and frozen approved document/pricing sections. These fixtures do not substitute for a live Cloudflare smoke test.
