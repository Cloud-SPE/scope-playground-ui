# Daydream Scope Studio

Thin React UI over an XState-driven control system for the Daydream Scope WebRTC API.

This app is meant to be a serious operator surface, not a static demo page. It lets you:

- connect to a Scope backend over HTTPS
- inspect pipeline and model readiness
- download models
- load pipelines
- start `Text to video` or `Webcam to video` sessions
- update prompts and runtime controls live over the WebRTC data channel
- monitor session health and raw diagnostics

## Architecture

Frontend stack:

- React
- XState
- TypeScript
- Vite

Backend assumptions:

- Daydream Scope server
- WebRTC support enabled
- HTTPS reverse proxy in front of Scope
- TURN configured for public internet reliability

Main frontend files:

- [src/main.tsx](src/main.tsx)
- [src/app/App.tsx](src/app/App.tsx)
- [src/app/studioMachine.ts](src/app/studioMachine.ts)
- [src/app/setupMachine.ts](src/app/setupMachine.ts)
- [src/app/editorMachine.ts](src/app/editorMachine.ts)
- [src/app/resourcesMachine.ts](src/app/resourcesMachine.ts)
- [src/app/sessionMachine.ts](src/app/sessionMachine.ts)

Deployment files:

- [docker-compose.yml](docker-compose.yml)
- [Caddyfile](Caddyfile)
- [Dockerfile.caddy](Dockerfile.caddy)
- [scope/Dockerfile](scope/Dockerfile)

## How The App Is Structured

The frontend is intentionally XState-first:

- `setupMachine`
  - backend URL
  - selected pipeline
  - mode
  - available schemas
- `editorMachine`
  - prompts
  - looks
  - load/runtime control editing
- `resourcesMachine`
  - bootstrap
  - model download
  - pipeline load
  - refresh flows
- `sessionMachine`
  - WebRTC session lifecycle
  - media state
  - failure/stop handling
- `studioMachine`
  - top-level coordinator

React is mostly a view layer over those actors.

## Development Commands

Install dependencies:

```bash
npm install
```

Run the local frontend:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Production build:

```bash
npm run build
```

## Backend URL

The UI has a `Scope Base URL` field. That is the primary way to point the app at your backend.

Use values like:

- `https://scope.example.com`
- `https://gpu-box.example.net`
- `https://scope.local`

Do not assume the checked-in default matches your environment. Treat the backend URL as operator-configured.

If you want to change the frontend's default value in code, update:

- [src/app/studioTypes.ts](src/app/studioTypes.ts)

When the UI is served through the included Docker/Caddy stack, the default backend URL resolves to the current page origin automatically. That means:

- the app is served at `https://scope.example.com`
- API requests go to `https://scope.example.com/api/...`
- Caddy routes `/api` to Scope and `/` to the UI container

## Prerequisites

For frontend-only development:

- Node.js 20+
- npm

For full local GPU deployment:

- Docker
- Docker Compose
- recent NVIDIA driver
- NVIDIA Container Toolkit
- a GPU with enough VRAM for your target pipelines

For remote HTTPS deployment:

- a hostname you control, such as `scope.example.com`
- DNS pointing that hostname at your GPU host
- TLS termination with Caddy or equivalent
- TURN for public WebRTC use

## Running The Frontend Locally Against A Remote GPU Server

This is the simplest good workflow.

1. Run the frontend locally:

```bash
npm install
npm run dev
```

2. Open:

```text
http://localhost:5173
```

3. Point `Scope Base URL` at your remote backend:

```text
https://scope.example.com
```

Why this works well:

- `localhost` is treated as a secure context by browsers
- webcam access works from the local page
- Scope can stay on a separate GPU server

Requirements on the remote Scope host:

- valid HTTPS
- permissive CORS for your frontend origin
- working WebRTC ICE/TURN

## Full GPU Deployment

This repo includes a Compose stack for:

- `scope`
- `caddy`

### 1. Create your environment file

Create a local `.env` from the example:

```bash
cp .env.template .env
```

Fill in the values you actually use.

At minimum, set:

- `SCOPE_HOST`
- TURN-related credentials

### 2. Edit the Caddy hostname

Update [Caddyfile](Caddyfile) so the site block matches your hostname, for example:

```caddy
scope.example.com:443, :8080 {
  ...
}
```

If you are not using `:8080`, remove it.

The Caddyfile uses `{$SCOPE_HOST}` by default, so the preferred configuration is to set:

```bash
SCOPE_HOST=scope.example.com
```

in your `.env` rather than hardcoding the host in the Caddyfile.

### 3. Review the Scope Dockerfile

If your Scope checkout still uses:

- `nvidia/cuda:12.8.0-cudnn-runtime-ubuntu22.04`
- `libgl1-mesa-glx`

and your host/container environment is based on Ubuntu 24.04, update it to:

- `nvidia/cuda:12.8.0-cudnn-runtime-ubuntu24.04`
- `libgl1`

This avoids the common Noble package failure:

```text
Package 'libgl1-mesa-glx' has no installation candidate
```

### 4. Start the stack

```bash
docker compose up --build -d
```

### 5. Verify the backend

```bash
curl https://scope.example.com/health
curl https://scope.example.com/api/v1/pipeline/status
curl https://scope.example.com/api/v1/webrtc/ice-servers
```

## Environment Variables

The Scope container in [docker-compose.yml](docker-compose.yml) currently expects:

- `SCOPE_HOST`
- `CLOUDFLARE_TURN_KEY_ID`
- `CLOUDFLARE_TURN_KEY_API_TOKEN`
- `HF_TOKEN`

The frontend also supports:

- `VITE_SCOPE_BASE_URL`
- `VITE_DEFAULT_PROMPT`

Use only the variables you actually need.

### `SCOPE_HOST` vs `VITE_SCOPE_BASE_URL`

These are intentionally different:

- `SCOPE_HOST`
  - deployment hostname for the UI/Caddy stack
  - controls where the app is served publicly
  - example:
    - `scope.example.com`

- `VITE_SCOPE_BASE_URL`
  - default API/WebRTC backend URL used by the browser UI
  - controls which Scope server the frontend talks to
  - example:
    - `https://gpu-box.example.com`

Typical patterns:

- same-origin deployment:
  - `SCOPE_HOST=scope.example.com`
  - `VITE_SCOPE_BASE_URL=https://scope.example.com`

- local frontend dev against a remote GPU server:
  - `SCOPE_HOST=scope.example.com`
  - `VITE_SCOPE_BASE_URL=https://gpu-box.example.com`

- blank UI base URL:
  - if `VITE_SCOPE_BASE_URL` is omitted and the field is left blank in the app,
    the frontend falls back to the current page origin

### Cloudflare TURN

This Scope build can use Cloudflare TURN credentials via:

- `HF_TOKEN`
- or:
  - `CLOUDFLARE_TURN_KEY_ID`
  - `CLOUDFLARE_TURN_KEY_API_TOKEN`

Important implementation detail:

- `credentials.py` supports direct Cloudflare TURN keys
- but `webrtc.py` only activates Cloudflare automatically when `HF_TOKEN` is present in the current build

So if you see this in logs:

```text
No Twilio or HF_TOKEN credentials found, using default STUN server
```

then TURN is not actually active, even if you created a Cloudflare TURN key.

### Hugging Face token

`HF_TOKEN` is also useful for model downloads depending on the pipeline.

Do not commit real tokens to the repo.

## .env Template

This repo now includes:

- [.env.template](.env.template)

Use it as a starting point. Keep your real `.env` local.

## HTTPS, CORS, And Certificates

### Recommended for public or cross-machine use

Use a real hostname with valid HTTPS:

- `https://scope.example.com`

Then terminate TLS in Caddy and reverse proxy to Scope on port `8000`.

### Localhost frontend + remote Scope backend

This is the preferred operator workflow:

- frontend on `http://localhost:5173`
- backend on `https://scope.example.com`

That avoids most webcam secure-context issues while keeping GPU work remote.

### Private LAN hostname

If you run Scope on a separate GPU machine inside a LAN, you can also use:

- `https://scope.local`

or another internal hostname, but then you must trust the certificate authority used by Caddy on the client machine.

### CORS

The current Caddy config forces permissive CORS headers and handles `OPTIONS` preflight.

If you change the frontend origin model, re-check:

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

## TURN And WebRTC

For public internet access, TURN is usually required.

Do not assume HTTPS alone is enough. HTTPS gets you:

- page load
- REST API
- WebRTC offer/answer exchange

It does not automatically solve WebRTC media relay.

### Verify TURN is active

Run:

```bash
curl https://scope.example.com/api/v1/webrtc/ice-servers
```

Good result:

- response includes `turn:` URLs

Bad result:

- response only includes:
  - `stun:stun.l.google.com:19302`

If you only see Google STUN, the server is not using TURN.

### Ports

If you rely on TURN, the browser talks to the TURN servers returned by Scope directly.

That means:

- Caddy does not proxy TURN media
- TURN does not run "through" your site hostname automatically

## Using The App

Typical flow:

1. Set `Scope Base URL`
2. Click `Refresh`
3. Select a pipeline
4. Download models if needed
5. Load the pipeline
6. Choose `Text to video` or `Webcam to video`
7. Start the session
8. Adjust prompt, looks, and runtime controls
9. Use `Update prompt` or `Smooth transition` during a live session

UI notes:

- sections like `Pipeline profile`, `Load config`, `Creative steering`, `Runtime controls`, and `Diagnostics` can be collapsed
- collapse state is preserved across refreshes

## Troubleshooting

### `ERR_CERT_AUTHORITY_INVALID`

Cause:

- browser does not trust the certificate chain for your Scope hostname

Fix:

- use a valid public certificate, or
- trust your local CA on the client machine

### `Peer connection failed`

Usually means:

- TURN is not active
- ICE failed
- remote media path is not reachable

Check:

```bash
curl https://scope.example.com/api/v1/webrtc/ice-servers
```

If it only returns Google STUN, fix TURN first.

### Connected but `bytesReceived = 0`

Meaning:

- signaling worked
- the remote track exists
- Scope is not actually sending video packets

This is typically a backend media-production issue, not a frontend issue.

### `No pipeline IDs provided, cannot start`

Cause:

- malformed client session payload

The current frontend should always send explicit `pipeline_ids`.

### `Invalid graph: Graph must have at least one sink node`

Cause:

- sending an empty `graph` object when not actually using graph mode

For normal use, omit `graph`.

### Missing model file errors

Example:

```text
No such file or directory: /workspace/models/.../config.json
```

Cause:

- partial or broken model download

Fix:

- remove the incomplete model directory
- download again

### `Warning: Could not load sageattention ... GLIBCXX_3.4.32 not found`

Meaning:

- the SageAttention extension was built against a newer `libstdc++` than the container has

Usually:

- non-fatal if Flash Attention is available

Fix:

- update the base image/runtime
- or ignore it if the pipeline works without SageAttention

### Ubuntu 24.04 build failure for `libgl1-mesa-glx`

If you see:

```text
Package 'libgl1-mesa-glx' has no installation candidate
```

replace it with:

```text
libgl1
```

## Validation Commands

Frontend:

```bash
npm test
npm run typecheck
npm run build
```

Backend:

```bash
curl https://scope.example.com/health
curl https://scope.example.com/api/v1/pipeline/status
curl https://scope.example.com/api/v1/webrtc/ice-servers
```

## Recommended Next Documentation Improvements

If this repo keeps growing, split docs into:

- `README.md`
- `docs/deployment.md`
- `docs/webrtc.md`
- `docs/troubleshooting.md`

That will keep the main README readable while still documenting the operational details properly.
