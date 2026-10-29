# Bev-Hub integration notes

The calculator, Contract Exhibits A–D and shared-password workspace are implemented on `bev-hub-preview`. See [SHARED-PASSWORD-SETUP.md](SHARED-PASSWORD-SETUP.md) for configuration and [RELEASE-READINESS.md](RELEASE-READINESS.md) for release gates and deployment instructions.

- `index.html` → `src/main.jsx` is the single application entry. `src/App.jsx` owns the approved calculator. `/contracts/index.html` runs inside the authenticated workspace iframe.
- Pages Functions authorize D1 records and private R2 downloads. All signed-in users share the same permissions.
- Saved quote imports transfer the four agreed fields; annual commitments require explicit handling for flex/trial quotes. Contract legal terms stay under user control.
- Source quote/specification files remain unchanged separate attachments in ZIP exports; they are not merged into the authored exhibit PDF. Download and review the entire package before execution.
- The release-review development branch fixes the package's embedded PDF serialization, corrects outdated synchronization help text, and adds reproducible regression tests. It does not change approved pricing or exhibit authoring/layout.
- This repository is public. Keep customer data, real quotes/agreements and actual secrets out of GitHub. Local browser acceptance artifacts are ignored.

Earlier statements here claiming the app was undeployed, browser-only or authenticated solely by Cloudflare Access were obsolete and have been replaced.
