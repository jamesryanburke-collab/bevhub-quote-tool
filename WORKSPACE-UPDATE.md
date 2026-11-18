# Consolidated workspace reliability update — November 18, 2026

This update uses `bev-hub-preview` at `6d95cf6c3e81c5a6dd5b8834a2516d02d342cfe4` as its baseline. It does not redesign the calculator, alter pricing formulas or change approved exhibit wording, document layout or PDF authoring. Production `main` is not part of this release. The October release-readiness report remains a historical snapshot; this document describes the additional implementation.

## Included in this single update

- Unsaved calculator tracking, warnings before opening/replacing drafts or signing out, browser navigation protection, and explicit editable quote download. Switching between calculator and contracts still preserves mounted drafts.
- **Import quote file**: a versioned JSON file is validated, previewed and loaded as a new unsaved draft. The calculator recalculates prices; imported identity, totals, approval status and revision tokens are ignored. The user must review costs and save. **Download editable quote** exports the current inputs. See `examples/quote-template.json` for a synthetic format example, not an approved customer price.
- The user's own quote status update advances only their matching open revision. Changes by other browsers still cause a conflict instead of silently overwriting data.
- Clear connection/save messages, session-expiry draft resumption, ordered quote refreshes and consistent version labels.
- Attachment upload/remove operations are tied to the originating client. Client switching is blocked while those operations run; stale file-load results are ignored. A new file appears as saved only after the server confirms it. Failure retains the previous saved attachment and explains how to retry.
- Searchable quote selection in contracts; linked quote number and revision warnings. Imported metadata is not the approved PDF: attach the reviewed original quote under Exhibit A. Reimporting a quote updates only the agreed customer/package/case pack/annual-volume fields.
- **Backup & recovery**: download a saved workspace ZIP, inspect/import a ZIP as copies, see attachment usage, browse record revisions and recover deleted records or previous field values. All password holders retain the same access; there is no added administrator role or per-person identity.
- Shared browser/server validation for known quote/client inputs; invalid numeric values, unsupported programs/packs/supply modes, unsafe object keys and malformed backups are rejected. The existing pricing functions remain unchanged.
- Automated GitHub Actions build/Node/browser checks on preview PRs and pushes; keyboard focus styles, native modal keyboard behavior and mobile acceptance checks.

## Backup and restore behavior — read before use

Backups contain private customer data and files. Download them to a protected location; never commit them to this public repository. They include saved D1 records, their retained field history, attachment metadata and the current object for each attachment manifest (including manifest tombstones). They do not include unsaved drafts, passwords/sessions, or unreferenced older R2 object versions whose manifests have been replaced. A full administrator D1 export plus private R2 export is still necessary for disaster recovery of every retained object version.

File bytes are checked against SHA-256 values stored in the ZIP. This detects corruption; it is not a digital signature or proof of who created a backup. Export checks whether record/file revisions changed while collecting data and refuses a mixed backup. Export when other users have finished saving.

**Import as copies** validates the entire archive before creating records and checks available attachment space. It creates new IDs and new quote numbers, with quote status Draft; it never overwrites existing records. The same exact backup produces the same copy IDs, so a failed import can be retried to resume missing records/files without duplicating or replacing completed copies. Deliberately deleted copies/files are skipped on retry. Modifying a backup creates a different import identity. The operation is not an atomic database migration: if interrupted, completed copies remain saved and a retry resumes the exact same file. Deleted source records and historical revisions remain available in the downloaded archive but are not imported as active copies. Import into an empty workspace is supported; ID-preserving production migration still requires the administrator runbook.

**Restore deleted record / Restore revision** operates on the existing server record, requires confirmation and the latest revision, preserves quote numbering, and records a new history entry. Reopen the record after restoration. Only record fields are rewound: previously replaced or explicitly deleted attachment versions are not restored by this action. Restoring a deleted client makes its still-active attachments accessible again. There is no permanent data erasure in these tools.

Browser imports are intended for a small team library. Individual files remain capped at 20 MiB, aggregate attachments at the existing 512 MiB cumulative budget; workspace archive import is limited to 600 MiB, client backup import to 100 MiB. Large browser backups can consume significant memory. Workspace imports accept uncompressed ZIPs generated by the app; the older client-backup importer also bounds compressed expansion. No automatic retention deletion or billable scheduled backup service is enabled.

## One Cloudflare handoff

There is **no new database migration, resource binding, paid plan or separate cloud service required for this preview update**. Pages Functions must bundle the repository-root `shared/validation.js` dependency along with the existing API. The existing Git integration handles that; static-only `dist` uploads do not.

Owner actions, collected here:

1. In **Workers & Pages → bevhub-quote-tool → Settings**, choose **Preview**. Confirm `DB` → `bevhub-preview` and `FILES` → `bevhub-preview-files`.
2. Replace the previously exposed `SITE_PASSWORD` with a fresh private value of at least 16 characters, and replace `SESSION_SECRET` with an independent random value of at least 32 characters. Set both as **Secret**, save privately in a password manager, then retry the latest preview deployment so new values take effect. All old sessions should fail. Do not send these values in chat or screenshots.
3. Verify the R2 bucket's public access, r2.dev and public custom domains remain disabled. The application is the authenticated download path.
4. Open stable preview in two browsers and run the acceptance steps below using synthetic records. Keep existing data intact. Download and privately store a workspace backup, then test copy import and recovery against synthetic records.
5. Keep production on hold. Its earlier screenshot showed preview-resource bindings under Production; dedicated production resources, migration and backup validation remain prerequisites before any separate approval to merge `main`.

Automatic off-site scheduling, cloud secret rotation and production resource changes cannot be completed without Cloudflare management access. This update supplies on-demand application backups and a tested import/recovery path, not an automatic off-site backup guarantee. Existing D1/R2/account usage must still be monitored; the application upload cap is not a guaranteed $0 billing limit.

## Acceptance checklist

- `npm ci`, `npm test`, `npm run build`, `npm run test:browser`.
- All frozen pricing/default/display sections, exhibit CSS/preview markup and PDF authoring hashes pass; existing 32 pricing and 18 import scenarios still pass.
- Invalid quote file is rejected without changing current inputs; a valid file loads a Draft, recalculates and receives a new server quote number only when saved.
- Unsaved changes survive cancelled navigation/replacement, interrupted saves and session expiry/sign-in. Own status update does not cause a false conflict; another browser's newer revision still does.
- Upload failure retains the prior saved file; upload/remove/client-switch interleaving cannot attach to a different client. Contract picker supports searching and warns about a changed linked quote.
- Workspace ZIP validates hashes and contains no credentials. Copy import preserves originals and retrying the same backup does not create duplicates. Deleted-record restoration preserves its quote number and creates a new revision; stale restore attempts fail.
- Signed-out requests to backup, recovery, storage, history, private objects and existing record APIs all fail. Wrong-Origin mutations fail.
- Original client/internal/selected PDFs and A–D ZIPs still open, with source attachments unchanged. Mobile width and keyboard focus checks pass.

GitHub Actions is read-only to repository content and uses local synthetic SQLite/R2 fixtures; it does not require or access customer credentials or Cloudflare resources. Preview branches generally inherit Preview bindings, so live development previews must not be used for destructive tests. No test should write to real customer records.
