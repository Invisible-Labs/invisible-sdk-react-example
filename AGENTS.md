# Agent instructions

This is a public, MIT-licensed private-transfer integration example.

- Read `README.md`, `src/invisible/README.md` and the actual installed SDK exports before changing the integration.
- Keep `src/invisible/` independent of the app UI, bundler environment and private packages.
- Use only public SDK entrypoints. Do not implement Noise, attestation, DKG or coordinator messages here.
- Use SDK constants, constructors, typed errors and `normalizeError`.
- Treat `SyncRequired` as a refresh hint. Only authenticated `sync` is lifecycle truth.
- Never automatically replay financial commands after unknown outcomes. Preserve mutation markers, Web Locks and transfer correlation.
- Never log recovery codes, sync secrets, shares, raw private messages or full records/errors.
- Keep browser-storage and pre-delegation recovery limitations explicit.
- Verify `bash scripts/local-ci.sh` and the static production bundle in a real browser. Mocked tests do not prove a live transfer.
- Document changed commands in `docs/repo-actions.md` and the nearest README.
- Prefer small hooks, native browser behavior and the existing public SDK over new dependencies.
