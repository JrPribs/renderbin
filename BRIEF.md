# RenderBin - Build Brief

## What to Build
A web app where users paste HTML or Markdown code and instantly get a shareable URL to the **rendered preview**. Think "pastebin but it renders your code."

## Core Flow
1. User lands on renderbin homepage
2. Sees a code editor (CodeMirror 6) with a toggle: HTML | Markdown
3. Pastes their code
4. Clicks "Render & Share" (or Cmd+Enter)
5. Gets a unique URL like `renderbin.dev/p/abc123`
6. That URL shows the rendered HTML or rendered Markdown - clean, full page
7. Anonymous pastes expire after 10 minutes (show countdown on preview page)

## Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS (single page app feel, but server-rendered landing for SEO)
- **Backend:** Node.js + Express
- **Database:** SQLite via better-sqlite3 (simple, no external deps for MVP)
- **Markdown:** marked (fast, popular)
- **HTML Sanitization:** DOMPurify (run server-side with jsdom for stored content)
- **Code Editor:** CodeMirror 6
- **Styling:** Custom CSS with the design system below

## Design System
- **Primary color:** #6C5CE7 (electric purple)
- **Accent:** #00D2D3 (cyan)
- **Background:** #0F0F1A (deep dark)
- **Surface:** #1A1A2E (card/panel backgrounds)
- **Text:** #E8E8F0 (light gray)
- **Font:** Inter (Google Fonts)
- **Border radius:** 8px (modern, rounded)
- **Code font:** JetBrains Mono

## Pages to Build

### 1. Homepage (`/`)
- Hero section: "Paste. Render. Share." with subtitle "The fastest way to share rendered HTML and Markdown previews"
- Large code editor area (CodeMirror 6)
- Format toggle: HTML | Markdown (auto-detect if possible)
- "Render & Share" button (prominent, purple)
- Below the fold: How it works (3 steps), comparison to alternatives, FAQ
- SEO content targeting "html preview online", "share html file", "render markdown online"

### 2. Preview Page (`/p/:id`)
- Full rendered output of the paste
- Thin top bar with: RenderBin logo (links home), "View Source" button, time remaining badge
- The rendered content takes up the full viewport below the bar
- HTML renders in a sandboxed iframe
- Markdown renders as styled HTML (GitHub-flavored styling)
- If expired: show a clean "This preview has expired" page with link to create new one

### 3. Raw View (`/raw/:id`)
- Shows the raw source code with syntax highlighting
- Copy button
- Link back to rendered view

### 4. SEO Landing Pages
- `/html-viewer` - "Free Online HTML Viewer & Preview Tool"
- `/markdown-viewer` - "Free Online Markdown Viewer & Preview Tool"
- Each has its own paste editor pre-set to that format + SEO content

## API Endpoints
- `POST /api/paste` - Create paste. Body: `{ content: string, format: "html" | "markdown" }`. Returns: `{ id: string, url: string, expiresAt: string }`
- `GET /api/paste/:id` - Get paste data. Returns: `{ content, format, createdAt, expiresAt, expired }`

## Key Requirements
- **Speed:** Page load < 1s, paste creation < 200ms
- **Mobile responsive:** Works great on phones (people share links in chat)
- **Copy URL:** One-click copy of the share URL after creation
- **Auto-detect format:** If content starts with `<!DOCTYPE`, `<html`, `<div`, etc. → HTML. Otherwise → Markdown
- **Expiry:** Anonymous pastes expire after 10 minutes. Show countdown on preview page. Background cleanup job.
- **Rate limiting:** Max 20 pastes per IP per hour
- **Size limit:** 500KB max paste size
- **Security:** DOMPurify for HTML, sandboxed iframe rendering, CSP headers

## File Structure
```
renderbin/
├── server.js              (Express app, API routes, SSR)
├── package.json
├── public/
│   ├── css/
│   │   └── style.css      (All styles)
│   ├── js/
│   │   └── app.js         (Frontend logic, CodeMirror setup)
│   └── favicon.svg
├── views/
│   ├── index.html          (Homepage template)
│   ├── preview.html        (Preview page template)
│   ├── raw.html            (Raw source view)
│   ├── expired.html        (Expired paste page)
│   ├── html-viewer.html    (SEO landing)
│   └── markdown-viewer.html (SEO landing)
├── db/
│   └── schema.sql          (SQLite schema)
└── BRIEF.md               (This file)
```

## Database Schema
```sql
CREATE TABLE pastes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('html', 'markdown')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);

CREATE INDEX idx_expires_at ON pastes(expires_at);
CREATE INDEX idx_ip_hash ON pastes(ip_hash, created_at);
```

## Important Notes
- Use nanoid for paste IDs (8 chars, URL-safe)
- Hash IPs with SHA-256 before storing (privacy)
- Clean up expired pastes every 5 minutes via setInterval
- The preview page should look CLEAN - minimal chrome, maximum content
- Support dark mode by default (it's a dev tool)
- Add Open Graph meta tags on preview pages so shared links look good in Slack/Discord/Twitter
- Include a robots.txt that allows indexing of landing pages but not individual pastes
