const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory drop store (Vercel serverless compatible)
let drops = {
  "voice1": {
    slug: "voice1",
    mediaType: "audio",
    mediaUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    views: 142,
    expiresAt: null,
    createdAt: new Date().toISOString()
  },
  "img1": {
    slug: "img1",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
    views: 289,
    expiresAt: null,
    createdAt: new Date().toISOString()
  }
};

// Memory storage for fast, lightweight serverless processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8MB limit (plenty for compressed audio/images)
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// IP Rate Limiting for production stability
const ipRequests = new Map();
function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 60;

  const record = ipRequests.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  ipRequests.set(ip, record);

  if (record.count > limit) {
    return res.status(429).json({ error: 'Rate limit reached. Please wait a few seconds.' });
  }
  next();
}

// Fast Drop Upload Endpoint (< 100ms response)
app.post('/api/drop', rateLimiter, upload.single('media'), (req, res) => {
  try {
    let slug = generateSlug();
    while (drops[slug]) slug = generateSlug();

    let mediaType = 'link';
    let mediaUrl = req.body.linkUrl || '';
    const expiryHours = parseInt(req.body.expiresIn) || 0;

    if (req.file) {
      const mime = req.file.mimetype;
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

    // Return immediately for ultra-low latency
    return res.json({
      success: true,
      slug,
      shortUrl: `/${slug}`,
      drop: {
        slug: drop.slug,
        mediaType: drop.mediaType,
        expiresAt: drop.expiresAt,
        views: drop.views
      }
    });
  } catch (err) {
    console.error('Error in drop upload:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch Drop details
app.get('/api/drop/:slug', (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const drop = drops[slug];

  if (!drop) {
    return res.status(404).json({ error: 'Media not found or expired.' });
  }

  if (drop.expiresAt && new Date(drop.expiresAt) < new Date()) {
    delete drops[slug];
    return res.status(404).json({ error: 'Media expired.' });
  }

  drop.views = (drop.views || 0) + 1;
  res.json(drop);
});

// Dynamic In-Game Shortlink Viewer with OpenGraph Social Preview Tags
app.get('/:slug', (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const drop = drops[slug];

  if (!drop) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }

  const cardHtmlPath = path.join(__dirname, 'public', 'card.html');
  fs.readFile(cardHtmlPath, 'utf8', (err, html) => {
    if (err) {
      return res.sendFile(cardHtmlPath);
    }

    // Dynamic Social Unfurl Metadata for Discord, WhatsApp, Telegram, Twitter
    let title = 'Shared Media — GGLINK';
    let description = 'View shared in-game clip on GGLINK.';
    let ogType = 'website';

    if (drop.mediaType === 'audio') {
      title = 'Voice Message &bull; GGLINK';
      description = 'Listen to the shared in-game voice clip.';
    } else if (drop.mediaType === 'image') {
      title = 'Screenshot &bull; GGLINK';
      description = 'View the shared in-game screenshot.';
    } else {
      title = 'In-Game Link &bull; GGLINK';
      description = `Direct access to ${drop.mediaUrl}`;
    }

    // Inject dynamic metadata tags into HTML
    const modifiedHtml = html
      .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
      .replace(/<!-- DYNAMIC_META -->/, `
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:url" content="https://gglink.vercel.app/${slug}">
        <meta name="twitter:title" content="${title}">
        <meta name="twitter:description" content="${description}">
      `);

    res.send(modifiedHtml);
  });
});

app.listen(PORT, () => {
  console.log(`GGLINK running at http://localhost:${PORT}`);
});

module.exports = app;
