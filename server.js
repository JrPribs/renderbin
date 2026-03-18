import express from 'express';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const EXPIRY_MINUTES = 10;
const MAX_PASTE_SIZE = 500 * 1024; // 500KB
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

// --- Database Setup ---
const db = new Database(join(__dirname, 'renderbin.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = readFileSync(join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// Prepared statements
const insertPaste = db.prepare(
  'INSERT INTO pastes (id, content, format, created_at, expires_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)'
);
const getPaste = db.prepare('SELECT * FROM pastes WHERE id = ?');
const deleteExpired = db.prepare('DELETE FROM pastes WHERE expires_at < unixepoch()');
const countRecentByIp = db.prepare(
  'SELECT COUNT(*) as count FROM pastes WHERE ip_hash = ? AND created_at > ?'
);

// --- DOMPurify Setup ---
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// --- Markdown Setup ---
marked.setOptions({
  gfm: true,
  breaks: true,
});

// --- Template Engine ---
const templateCache = new Map();

function loadTemplate(name) {
  if (templateCache.has(name) && process.env.NODE_ENV === 'production') {
    return templateCache.get(name);
  }
  const content = readFileSync(join(__dirname, 'views', `${name}.html`), 'utf8');
  templateCache.set(name, content);
  return content;
}

function render(templateName, vars = {}) {
  let html = loadTemplate(templateName);
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

// --- Helpers ---
function hashIp(ip) {
  return createHash('sha256').update(ip || 'unknown').digest('hex');
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

function sanitizeHtml(content) {
  return DOMPurify.sanitize(content, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['style', 'link'],
    ADD_ATTR: ['target', 'rel'],
  });
}

function renderMarkdown(content) {
  const rawHtml = marked.parse(content);
  return DOMPurify.sanitize(rawHtml);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeRemaining(expiresAt) {
  const now = Math.floor(Date.now() / 1000);
  const remaining = expiresAt - now;
  if (remaining <= 0) return 'Expired';
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}m ${seconds}s`;
}

// --- Middleware ---
app.use(express.json({ limit: '512kb' }));
app.use(express.static(join(__dirname, 'public'), { maxAge: '1h' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// --- Routes ---

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *
Allow: /
Allow: /html-viewer
Allow: /markdown-viewer
Disallow: /p/
Disallow: /raw/
Disallow: /api/
`
  );
});

// Homepage
app.get('/', (req, res) => {
  res.send(render('index', { format: '', activeHtml: 'active', activeMd: '' }));
});

// SEO landing pages
app.get('/html-viewer', (req, res) => {
  res.send(render('html-viewer'));
});

app.get('/markdown-viewer', (req, res) => {
  res.send(render('markdown-viewer'));
});

// Preview page
app.get('/p/:id', (req, res) => {
  const paste = getPaste.get(req.params.id);
  if (!paste) {
    return res.status(404).send(render('expired'));
  }

  const now = Math.floor(Date.now() / 1000);
  if (paste.expires_at < now) {
    deleteExpired.run();
    return res.status(410).send(render('expired'));
  }

  let previewContent;
  if (paste.format === 'markdown') {
    const rendered = renderMarkdown(paste.content);
    previewContent = `<div class="markdown-body">${rendered}</div>`;
  } else {
    const sanitized = sanitizeHtml(paste.content);
    // Encode content for srcdoc attribute
    const srcdocContent = sanitized
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    previewContent = `<iframe class="preview-frame" sandbox="allow-same-origin" srcdoc="${srcdocContent}"></iframe>`;
  }

  const timeRemaining = formatTimeRemaining(paste.expires_at);

  res.send(
    render('preview', {
      id: paste.id,
      format: paste.format,
      PREVIEW_CONTENT: previewContent,
      timeRemaining,
      expiresAt: paste.expires_at.toString(),
      formatLabel: paste.format === 'html' ? 'HTML' : 'Markdown',
    })
  );
});

// Raw view
app.get('/raw/:id', (req, res) => {
  const paste = getPaste.get(req.params.id);
  if (!paste) {
    return res.status(404).send(render('expired'));
  }

  const now = Math.floor(Date.now() / 1000);
  if (paste.expires_at < now) {
    deleteExpired.run();
    return res.status(410).send(render('expired'));
  }

  res.send(
    render('raw', {
      id: paste.id,
      format: paste.format,
      rawContent: escapeHtml(paste.content),
      formatLabel: paste.format === 'html' ? 'HTML' : 'Markdown',
    })
  );
});

// --- API ---

// Create paste
app.post('/api/paste', (req, res) => {
  const { content, format } = req.body;

  // Validate
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }
  if (!format || !['html', 'markdown'].includes(format)) {
    return res.status(400).json({ error: 'Format must be "html" or "markdown"' });
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_PASTE_SIZE) {
    return res.status(413).json({ error: 'Content exceeds 500KB limit' });
  }

  // Rate limiting
  const ipHash = hashIp(getClientIp(req));
  const cutoff = Math.floor(Date.now() / 1000) - RATE_LIMIT_WINDOW;
  const { count } = countRecentByIp.get(ipHash, cutoff);
  if (count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 20 pastes per hour.' });
  }

  const id = nanoid(8);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + EXPIRY_MINUTES * 60;

  try {
    insertPaste.run(id, content, format, now, expiresAt, ipHash);
  } catch (err) {
    console.error('Failed to create paste:', err);
    return res.status(500).json({ error: 'Failed to create paste' });
  }

  res.status(201).json({
    id,
    url: `/p/${id}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  });
});

// Get paste data
app.get('/api/paste/:id', (req, res) => {
  const paste = getPaste.get(req.params.id);
  if (!paste) {
    return res.status(404).json({ error: 'Paste not found' });
  }

  const now = Math.floor(Date.now() / 1000);
  const expired = paste.expires_at < now;

  if (expired) {
    deleteExpired.run();
    return res.status(410).json({ error: 'Paste has expired' });
  }

  res.json({
    content: paste.content,
    format: paste.format,
    createdAt: new Date(paste.created_at * 1000).toISOString(),
    expiresAt: new Date(paste.expires_at * 1000).toISOString(),
    expired: false,
  });
});

// --- Cleanup Job ---
setInterval(() => {
  try {
    const result = deleteExpired.run();
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} expired paste(s)`);
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// --- Start ---
app.listen(PORT, () => {
  console.log(`RenderBin running at http://localhost:${PORT}`);
});
