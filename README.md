# RenderBin

Paste HTML or Markdown, get a shareable rendered preview URL instantly. Previews auto-expire after 10 minutes.

## Quick Start

```bash
# Install dependencies
npm install

# Start the dev server (auto-restarts on changes)
npm run dev

# Or start in production mode
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Usage

1. Paste HTML or Markdown into the editor
2. Click **Render & Share** (or press `Cmd+Enter`)
3. Copy the preview URL and share it

## Key URLs

| Path | Description |
|------|-------------|
| `/` | Homepage with editor |
| `/p/:id` | Rendered preview |
| `/raw/:id` | Raw source view |
| `/html-viewer` | HTML-focused landing page |
| `/markdown-viewer` | Markdown-focused landing page |
| `/api/paste` | POST to create a paste |
| `/api/paste/:id` | GET paste data as JSON |

## API

### Create a paste

```bash
curl -X POST http://localhost:3000/api/paste \
  -H 'Content-Type: application/json' \
  -d '{"content": "<h1>Hello</h1>", "format": "html"}'
```

Returns:
```json
{
  "id": "abc12345",
  "url": "/p/abc12345",
  "expiresAt": "2025-01-01T00:10:00.000Z"
}
```

### Get a paste

```bash
curl http://localhost:3000/api/paste/abc12345
```

## Smoke Test

```bash
npm test
```

This runs a quick end-to-end test: starts the server, creates an HTML and Markdown paste via the API, fetches the preview and raw pages, and verifies everything returns the expected status codes.

## Tech Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** Vanilla JS + CodeMirror 6 (loaded from esm.sh)
- **Markdown:** marked (GFM support)
- **Sanitization:** DOMPurify (server-side via jsdom)
- **IDs:** nanoid (8 chars)

## Limits

- Paste size: 500KB max
- Rate limit: 20 pastes per IP per hour
- Expiry: 10 minutes (automatic cleanup)

## License

MIT
