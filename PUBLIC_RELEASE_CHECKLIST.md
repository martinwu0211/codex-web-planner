# Public release gate

Every change must be checked from the perspective of a new Codex user on a clean machine.

- No dependency on this workstation, noVNC, Chrome CDP, VPS paths, cookies, or pre-login state.
- A user starts with Codex and a GitHub/plugin instruction; no global npm install or manual PATH edit is required.
- A clean plugin cache can start; missing production dependencies install non-interactively.
- The agent reports numbered progress and distinguishes installed, running, authorized, and effectively connected.
- ChatGPT authorization is completed in the user's own supported web UI. The agent shows the endpoint and pairing code, polls for completion, and continues automatically.
- Login timeout is bounded; timeout aborts clearly, and “continue” creates a fresh pairing flow.
- Unsupported plans, workspace permissions, network failures, missing tunnel support, and expired pairing codes have explicit error codes and next actions.
- Account quotas and saved-token values are never invented; unavailable data is labeled unavailable.
- Test both JSON and human CLI output, and test installation from a cache without `node_modules` symlinks.
