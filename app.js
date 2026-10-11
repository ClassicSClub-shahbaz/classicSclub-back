
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const Registration = require('./Registration');

const app = express();

const FEES = {
  singles: Number(process.env.FEE_SINGLES) || 199,
  doubles: Number(process.env.FEE_DOUBLES) || 349
};

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const STATUSES = ['pending', 'verified', 'rejected'];

if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS configuration
const allowedOrigins = (
  process.env.CORS_ORIGIN || 'https://fuzailjazzb.github.io'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  '/api',
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'x-admin-key'],
    optionsSuccessStatus: 204
  })
);

app.use(express.json({ limit: '10kb' }));

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});

// ---------- helpers ----------
function clean(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid request.' };
  }

  const s = (v, max) => String(v ?? '').trim().slice(0, max);

  const d = {
    name: s(body.name, 80),
    phone: s(body.phone, 20).replace(/\D/g, '').slice(-10),
    email: s(body.email, 120).toLowerCase(),
    city: s(body.city, 60),
    pincode: s(body.pincode, 6),
    category: s(body.category, 10),
    level: s(body.level, 20),
    partner: s(body.partner, 80)
  };

  if (d.name.length < 2) {
    return { error: 'Enter your full name.' };
  }

  if (!/^[6-9]\d{9}$/.test(d.phone)) {
    return { error: 'Enter a valid 10-digit mobile number.' };
  }

  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) {
    return {
      error: 'Enter a valid email address or leave it empty.'
    };
  }

  if (d.city.length < 2) {
    return { error: 'Enter your city.' };
  }

  if (!/^[1-9]\d{5}$/.test(d.pincode)) {
    return { error: 'Enter a valid 6-digit pincode.' };
  }

  if (!Object.prototype.hasOwnProperty.call(FEES, d.category)) {
    return { error: 'Choose singles or doubles.' };
  }

  if (!LEVELS.includes(d.level)) {
    return { error: 'Choose your level.' };
  }

  if (d.category === 'doubles' && d.partner.length < 2) {
    return {
      error: 'Enter your partner name for doubles.'
    };
  }

  if (d.category === 'singles') {
    d.partner = '';
  }

  return { data: d };
}

const newBookingId = () =>
  'PC-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);

function adminAuth(req, res, next) {
  const key = process.env.ADMIN_KEY || '';
  const hash = (v) =>
    crypto.createHash('sha256').update(String(v)).digest();
  const got = String(req.get('x-admin-key') || '');

  if (!key || !crypto.timingSafeEqual(hash(got), hash(key))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// ---------- routes ----------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1
  });
});

app.post('/api/registrations', postLimiter, async (req, res, next) => {
  try {
    const { error, data } = clean(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    for (let i = 0; i < 5; i++) {
      try {
        const doc = await Registration.create({
          ...data,
          bookingId: newBookingId(),
          amount: FEES[data.category]
        });

        return res.status(201).json({
          id: doc.bookingId,
          amount: doc.amount,
          status: doc.status
        });
      } catch (e) {
        if (e && e.code === 11000) {
          // Retry if the generated booking ID collides.
          // Other unique-index conflicts are not retried indefinitely.
          if (e.keyPattern && e.keyPattern.bookingId) {
            continue;
          }

          return res.status(409).json({
            error: 'Registration conflicts with an existing record.'
          });
        }

        throw e;
      }
    }

    throw new Error('Could not allocate a booking ID');
  } catch (e) {
    next(e);
  }
});

app.get('/api/registrations', adminAuth, async (req, res, next) => {
  try {
    const q = {};

    if (STATUSES.includes(req.query.status)) {
      q.status = req.query.status;
    }

    const list = await Registration.find(q)
      .sort({ createdAt: -1 })
      .limit(500)
      .select('-__v')
      .lean();

    res.json({
      count: list.length,
      registrations: list
    });
  } catch (e) {
    next(e);
  }
});

app.patch(
  '/api/registrations/:bookingId/status',
  adminAuth,
  async (req, res, next) => {
    try {
      const status = String((req.body && req.body.status) || '');

      if (!STATUSES.includes(status)) {
        return res.status(400).json({
          error: 'Status must be pending, verified or rejected.'
        });
      }

      const doc = await Registration.findOneAndUpdate(
        { bookingId: String(req.params.bookingId).toUpperCase() },
        { status },
        { new: true }
      )
        .select('-__v')
        .lean();

      if (!doc) {
        return res.status(404).json({
          error: 'Registration not found.'
        });
      }

      res.json(doc);
    } catch (e) {
      next(e);
    }
  }
);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------- frontend ----------
app.use(express.static(path.join(__dirname, '..', 'front')));

// ---------- errors ----------
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }

  console.error(err);

  res.status(500).json({
    error: 'Something went wrong. Please try again.'
  });
});

module.exports = app;
