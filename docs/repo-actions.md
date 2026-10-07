# Repository actions

| Command | Purpose | Expected result |
| --- | --- | --- |
| `npm ci` | Install the pinned public dependencies | Lockfile installed; no GitHub token required |
| `npm run dev` | Start Vite locally | URL printed; no coordinator mutation until a user action |
| `npm run typecheck` | Validate TypeScript and public SDK types | Exit 0 |
| `npm test` | Run adapter behavior tests | All tests pass |
| `npm run build` | Typecheck and produce static assets | `dist/` created |
| `npm run preview` | Serve the production bundle locally | Preview URL printed |
| `npm run check` | Run tests and production build | Exit 0 |
| `npm run audit` | Audit public dependencies | No high/critical vulnerabilities |
| `bash scripts/local-ci.sh` | Mirror GitHub CI from a clean install | Install, check and audit pass |

Cloudflare Pages uses `npm run build` with output `dist`. Configuration and manual deployment steps are in the root README. `.env.example` lists the sole optional public browser variable; it is not a secret or attestation override.
