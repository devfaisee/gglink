const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory + file-backed storage (works seamlessly in serverless & local)
let drops = {
  "voice1": {
    slug: "voice1",
    mediaType: "audio",
    mediaUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    views: 84,
    expiresAt: null,
    createdAt: new Date().toISOString()
  },
  "img1": {
    slug: "img1",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
    views: 120,
    expiresAt: null,
    createdAt: new Date().toISOString()
  },
  "link1": {
    slug: "link1",
    mediaType: "link",
    mediaUrl: "https://discord.gg",
    views: 45,
    expiresAt: null,
    createdAt: new Date().toISOString()
  }
};

// Try loading local database file if running locally
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'cards.json');
try {
  if (fs.existsSync(dbPath)) {
    const fileData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    drops = { ...drops, ...fileData };
  }
} catch (e) {
  // Read-only filesystem on Vercel is ignored
}

function persistLocally() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(drops, null, 2), 'utf8');
  } catch (e) {
    // Graceful on serverless environments
  }
}

// Memory storage for serverless compatibility (instant base64 conversion)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Generate clean, unambiguous 4-letter slug
function generateSlug() {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
  let slug = '';
  for (let i = 0; i < 4; i++) {
    slug += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return slug;
}

// Lightweight rate limiting
const ipRequests = new Map();
function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const limit = 40; // 40 drops/min

  const record = ipRequests.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  ipRequests.set(ip, record);

  if (record.count > limit) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  next();
}

// POST: 1-Tap Media Drop
app.post('/api/drop', rateLimiter, upload.single('media'), (req, res) => {
  try {
    let slug = generateSlug();
    while (drops[slug]) slug = generateSlug();

    let mediaType = 'link';
    let mediaUrl = req.body.linkUrl || '';
    const expiryHours = parseInt(req.body.expiresIn) || 0; // 0 = never

    if (req.file) {
      const mime = req.file.mimetype;
      // Convert buffer to data URI for zero-config serverless compatibility
      mediaUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;

      if (mime.startsWith('audio') || req.file.originalname.endsWith('.webm') || req.file.originalname.endsWith('.mp3')) {
        mediaType = 'audio';
      } else if (mime.startsWith('image')) {
        mediaType = 'image';
      } else {
        mediaType = 'file';
      }
    }

    if (!mediaUrl && !req.file) {
      return res.status(400).json({ error: 'No media or URL provided' });
    }

    const expiresAt = expiryHours > 0 ? new Date(Date.now() + expiryHours * 3600 * 1000).toISOString() : null;

    const drop = {
      slug,
      mediaType,
      mediaUrl,
      views: 0,
      expiresAt,
      createdAt: new Date().toISOString()
    };

    drops[slug] = drop;
    persistLocally();

    return res.json({
      success: true,
      slug,
      shortUrl: `/${slug}`,
      drop
    });
  } catch (err) {
    console.error('Error handling drop:', err);
    return res.status(500).json({ error: 'Server error while processing drop' });
  }
});

// GET: Drop Details
app.get('/api/drop/:slug', (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const drop = drops[slug];

  if (!drop) {
    return res.status(404).json({ error: 'Media not found or expired.' });
  }

  // Check TTL expiration
  if (drop.expiresAt && new Date(drop.expiresAt) < new Date()) {
    delete drops[slug];
    persistLocally();
    return res.status(404).json({ error: 'This media has expired.' });
  }

  drop.views = (drop.views || 0) + 1;
  res.json(drop);
});

// POST: Report Abuse
app.post('/api/report', (req, res) => {
  const { slug, reason } = req.body;
  if (slug && drops[slug]) {
    // Flag drop for safety
    drops[slug].flagged = true;
  }
  return res.json({ success: true, message: 'Report received. Thank you for keeping the community safe.' });
});

// GET: In-game Shortlink Viewer
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug.toLowerCase();
  if (drops[slug]) {
    res.sendFile(path.join(__dirname, 'public', 'card.html'));
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

app.listen(PORT, () => {
  console.log(`GGLINK Production ready at http://localhost:${PORT}`);
});

module.exports = app;
