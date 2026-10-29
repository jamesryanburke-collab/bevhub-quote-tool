# Bev-Hub controlled release review — 2026-10-29

**Decision: HOLD production release.** Local functionality passes after the development-branch ZIP fix. Live configuration, secret rotation, migration/backup decisions and production smoke tests remain owner gates. No merge, production deployment, resource provisioning, data deletion or paid Cloudflare action was performed during this review.

## Source and scope

- Baseline: `bev-hub-preview` commit `df32c86600e49647cf50e0d04fc47edea0ad67db`, tree `5b0d391b66061f65fdd60adae48d9e600f212083`.
- Production: `main` commit `eea1982f4af35cfb59b7ffff5a7b3c96968759e1`; preview is 13 commits ahead, none behind at review start.
- Corrections proposed only on `codex/release-readiness-2026-10-29`, PR targeting `bev-hub-preview`. They must be reviewed before any release to `main`.
- All baseline tracked local blobs were verified against GitHub tree hashes before testing. No customer data or real credentials were used in local tests.

## PASS/FAIL checklist

FAIL includes an uncompleted release gate; it does not imply a confirmed live vulnerability.

| Gate | Baseline / reviewed fix | Evidence or remaining action |
| --- | --- | --- |
| Clean dependency install | PASS | Exact `npm ci`, Node 24.19.0; lockfile unchanged |
| Production build | PASS | `npm run build`; only existing module-type and bundle-size warnings |
| Unit/function regression suite | PASS | Original 6 tests passed; expanded 13 tests pass after fix |
| Dependency advisory audit | PASS | `npm audit --json`: 0 known advisories at review time; not a guarantee against unknown vulnerabilities |
| Calculator save/reopen across two browsers | PASS | Independent browser contexts; server-assigned quote numbering |
| Quote-to-contract import | PASS | Customer, can size, 24-pack and 300000 annual cases verified in browser; 18 annual/legacy/flex/trial import cases in Node |
| Shared client save/reopen | PASS | Other browser opens same customer; full page reload retains legal name |
| Stale quote write protection | PASS | 409 conflict, unsaved stale draft retained |
| Calculator PDFs and HTML | PASS | Client/internal PDFs parse; quote HTML contains six individual material groups |
| Contract A–D and selected PDF | PASS | All four previews load; selected PDF parses with at least four pages |
| Contract package embedded PDF | **FAIL baseline → PASS fix** | Baseline ZIP embedded literal `[object Blob]`. Fix awaits PDF bytes before ZIP assembly; regression opens embedded PDF and checks A–D titles |
| Original uploaded quote preservation | PASS | ZIP source attachment matches uploaded PDF bytes exactly |
| Pricing formulas/material costs | PASS | Frozen approved calculation/program/default/render blocks; six built-in assertions; 32 independent pack/size/mode scenarios; 12/24-pack UI unit conversion checks |
| Approved exhibit language/formatting | PASS | `makeDoc`, exhibit CSS and A–D preview markup unchanged; no legal terms edited. Production `main` had no contract generator; preservation reference is the approved preview |
| Server authentication/session controls | PASS locally | Wrong password, same-Origin enforcement, rate limit, hashed tokens, secure cookies, expiration/logout and independent secret rotation |
| D1/R2 access controls | PASS locally | Signed-out APIs denied; active session required; deleted parent client makes files inaccessible; private-object fixtures; storage budget tested |
| Per-user permissions/audit | PASS for agreed model | One shared role. Every password holder can read/edit/delete all customers; no individual attribution or revocation. Not suitable for untrusted customer access |
| Current Cloudflare build/bindings | **FAIL / pending confirmation** | Expected settings documented below. No Cloudflare management credentials available to inspect the current account |
| Live configuration/security smoke test | **FAIL / pending owner** | Local mocks cannot prove deployed Pages routing, encrypted secrets, database schema, bucket privacy or actual R2 round trips |
| Fresh private secret values | **FAIL / owner action** | Earlier values appeared in chat/screenshots. Replace both privately, as Secret types, redeploy and verify old sessions are rejected |
| Data migration and recovery | **FAIL / owner action** | Choose empty production vs preserve preview data; create/validate exports and test restore before promotion |
| Zero-cost guarantee | **FAIL / not guaranteed** | R2 is usage billed above account-wide allowances. No paid action performed; application quota is not a provider spending cap |
| Documentation and unused files | **FAIL baseline → PASS fix** | Replaced contradictory setup notes, corrected sync help text, removed unused duplicate files |

## Findings and proposed changes

1. **Release blocker: corrupt embedded contract PDF.** `buildPdf()` returns a Blob. `zipParts()` accepted bytes/text and converted the Blob to the string `[object Blob]`. Change only the package assembly to pass `await bytesOf(gen)`. Existing PDF authoring, text, layout and source attachment bytes are untouched. The new Node regression fails on the baseline; browser acceptance additionally parses the real A–D PDF from the ZIP.
2. **Misleading synchronization guidance.** Contract Setup still claimed records did not synchronize. Update that application help notice only. Replace setup/integration notes that claimed the app was undeployed/browser-only/Cloudflare-Access-only.
3. **Nonportable/uncommitted browser acceptance.** Prior standalone script lived outside the repository, had an absolute fixture path and only downloaded the ZIP. Commit a portable runner, isolated loopback credentials/server, Python dependency pins and PDF-content assertions.
4. **Accidental/unnecessary files.** Remove `download` (duplicate gitignore text), `index (1).html` (duplicate HTML entry), root `main.jsx` (imports nonexistent root App.jsx) and root `index.css` (unused duplicate). Active entry is `index.html` → `src/main.jsx`; build confirms no dependency on removed files. Empty `README.md` is harmless and retained. No tracked dist, node_modules, actual `.dev.vars`, real client records or Supabase code was found in the preview tree.

## Security and operational limits

Password/session controls are server-side; there is no API key/password embedded in frontend JS. All API routes, including attachment reads, require a live session except login/logout. Logout is same-Origin and revokes only the supplied browser token. Payloads are size bounded and SQL inputs are bound parameters; request failures do not expose SQL or secrets. Output templates escape user text. Attachments download with `nosniff`, attachment disposition and `no-store`.

Shared access deliberately has no customer-level ACL or individual identity. The signed-out static HTML/JS and contract templates are public; stored customer data and files are gated. Do not embed private data in source files. Five-attempt rate limiting is per trusted Cloudflare source-IP/time bucket, not a complete distributed-bot defense. Three trusted users fit the intended model.

D1 history and old R2 objects are retained, not automatically backed up or erased. There is no automated retention job, comprehensive administrative restore tool or per-person audit trail. Record listing is unpaginated and histories grow; monitor before the library becomes large. The 20 MiB upload / 512 MiB cumulative attachment limits do not cap every account charge. Unbounded database/operation use and other account resources still need monitoring. Secrets should be held in a password manager and shared privately. Retain legal/quality review before executing generated contracts; preservation checks are not legal approval.

## Exact Pages settings and owner checks

Open **Workers & Pages → bevhub-quote-tool → Settings**. The environment dropdown is at the upper right.

| Setting | Preview | Production after separate approval |
| --- | --- | --- |
| Git production branch | `main` (do not change) | `main` |
| Framework/root | Vite / repository root | same |
| Build/output | `npm run build` / `dist` | same |
| Toolchain | build system v3; pin `NODE_VERSION=24.19.0` | same tested version |
| Function routing | repository-root `functions/api/[[path]].js` deployed | same |
| D1 binding | `DB` → `bevhub-preview` | `DB` → dedicated production DB, e.g. `bevhub-production` |
| R2 binding | `FILES` → `bevhub-preview-files` | `FILES` → dedicated private Standard bucket, e.g. `bevhub-production-files` |
| Secrets | `SITE_PASSWORD` ≥16, `SESSION_SECRET` ≥32; distinct, fresh, encrypted Secret types | independently generated production values |
| R2 public access/domains | Disabled | Disabled |

Confirm these resource names against the actual dashboard, not merely the display names in old screenshots. Confirm both secrets are available to Functions. Do not use frontend `VITE_*` variables. A previous setup step may have left preview-resource bindings in the Production environment: **inspect and replace them with dedicated production bindings during the approved release; do not delete the databases or buckets.** No current dashboard access was available to verify whether this remains.

Check Preview branch controls before pushing/testing development branches: general Preview settings may give every branch deployment access to preview DB/R2. Do not point Preview at production resources. Git integration may build the development PR automatically; do not perform writes against its inherited shared data as a test. Automated local acceptance uses only its own fixtures.

## Controlled deployment runbook (instructions only; not executed)

1. **Review fixes.** Review the development PR into `bev-hub-preview`, especially the two contract-file edits. After approval, merge that PR into preview only. Keep `main` unchanged. Let the existing Git integration build preview; this is distinct from production approval.
2. **Reproduce checks.** Run `npm ci`, `npm run build`, `npm test`; install `test-support/requirements-browser.txt` and Chromium, then `npm run test:browser`. See the setup guide. Record the exact passing preview commit. No dependency upgrades are required.
3. **Verify preview configuration.** In Preview settings confirm `DB`, `FILES`, fresh independent Secret values and Node/build settings above. Save, then retry the latest preview deployment or deploy the reviewed commit so changes take effect. Keep the R2 bucket private. Do not re-enable billing services or add paid plans.
4. **Perform live preview smoke test with synthetic records.** At `https://bev-hub-preview.bevhub-quote-tool.pages.dev`, test wrong/correct password and an incognito session. Save/reopen a synthetic quote; verify four fields in Contract Setup; save/reopen the client in browser two; upload/download a small synthetic PDF; open all exhibits; export and extract the ZIP, open its PDF and original attachment. Test stale edits and sign-out. In a signed-out browser verify `/api/records/quote`, `/api/records/client`, `/api/files?client=<test-id>` and `/api/files/<test-object-id>` return 401, without customer information. Verify old sessions fail after secret rotation. Do not delete any existing data as part of testing.
5. **Choose production data plan before promotion.** Default to dedicated production D1 and R2. Start empty only with owner acceptance; retain preview and local browser originals. If preserving preview records, take an administrator D1 export and a complete private R2 export including retained UUID objects first. A future authorized CLI export is `npx wrangler d1 export bevhub-preview --remote --output=preview-backup.sql`; store exports privately, not in GitHub. Validate restoration into isolated resources before using them for production. Run the schema migration once on a new empty target. Copy application tables (`records`, `record_history`, `files`, `storage_budget`) and R2 objects preserving IDs, revisions, quote numbers, object keys and budget; do not migrate `sessions` or `login_attempts`. Do not run both the full schema export and schema migration blindly or replay data in a way that fires duplicate history entries. An administrator should prepare/test the data import for the chosen export format. Compare counts, maximum quote number, active file manifests, bytes and representative downloaded hashes. Separate API-by-API saves or client backup restores are not identity-preserving migrations. Stop and resolve any discrepancy; do not drop tables or purge originals.
6. **Prepare production resources and recovery.** Only after owner authorization, create/select dedicated production resources within the chosen free quotas. Verify existing account entitlements before any provisioning; stop if Cloudflare requests a paid upgrade. Configure production bindings/secrets separately, initialize schema as above, and document protected backup locations, retention, recovery owner and account-wide usage monitoring. Do not promise a hard $0 cap for R2. Confirm whether production starts empty or with the validated migrated library.
7. **Request explicit production approval.** Prepare a separate release PR from the final reviewed preview commit to `main`; summarize changes, exact test results and completed Cloudflare/data gates. Leave automatic merge off. No merge/deploy until owner approves that release. Because `main` currently auto-deploys, merging it is the production deployment trigger.
8. **Approved release and verification.** After that approval, merge the release PR and monitor the Cloudflare Production build. Confirm its source SHA, successful Functions deployment and production URL `https://bevhub-quote-tool.pages.dev`. Repeat the authentication, two-browser shared data, quote import and extracted-PDF checks there. Verify production uses its own resources and Preview still points at preview data. Do not direct users to an unverified deployment.
9. **Rollback.** Record the previous production deployment and backups before release. If verification fails, restrict access/stop writes and use Cloudflare's rollback to the previous known-good deployment only after checking its data/auth compatibility. The old main build has an obsolete frontend password model and does not read shared D1 data; do not treat it as an equivalent secure shared-workspace fallback. Keep the password-protected build restricted while investigating if necessary. Code rollback does not restore data or reverse schema/migrations; preserve both old and new resources and recover only from validated backups with owner authorization. Never delete data as a rollback shortcut.

## Remaining owner actions

Confirm current Cloudflare settings/privacy and secret rotation; choose production data/backup/retention plan; verify free-tier/billing expectations; complete live preview D1/R2 and extracted-ZIP smoke tests; review the development PR. Production approval remains separate. Cloudflare Access email login is not required for the chosen shared-password experience; an additional access layer is optional, not silently reinstated by this change.
