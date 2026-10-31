import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const logger = pino({ level: process.env.LOG_LEVEL || 'info', base: undefined });

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map((item) => item.trim())
    : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp({ logger }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});
app.use('/api', apiLimiter);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
}, { timestamps: true });

const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: String, required: true, trim: true, maxlength: 100 },
  department: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  aiTag: { type: String, default: 'General' },
  aiSummary: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

const createToken = (id) => jwt.sign(
  { id },
  process.env.JWT_SECRET,
  { expiresIn: '7d' },
);

function validateEmployee(data) {
  const fields = ['name', 'role', 'department', 'email'];
  for (const field of fields) {
    if (typeof data[field] !== 'string' || !data[field].trim()) {
      return `${field} is required`;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    return 'Please enter a valid employee email';
  }
  return null;
}

async function requestAI(payload) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      summary: `There are ${payload.total} employee record(s) across ${payload.departments} department(s).`,
      recommendations: ['Keep employee profiles up to date.', 'Review department coverage regularly.'],
    };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return valid JSON with a short string summary and a recommendations array of short strings. Do not include markdown.',
        },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    logger.warn({ status: response.status }, 'AI provider request failed');
    throw new Error('AI provider request failed');
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI provider returned an empty response');

  const parsed = JSON.parse(raw);
  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.recommendations)) {
    throw new Error('AI provider returned an unexpected response');
  }

  return {
    summary: parsed.summary.slice(0, 1200),
    recommendations: parsed.recommendations
      .filter((item) => typeof item === 'string')
      .slice(0, 6)
      .map((item) => item.slice(0, 240)),
  };
}

function fallbackEmployeeSummary(employee) {
  return {
    summary: `${employee.name} works as ${employee.role} in the ${employee.department} department.`,
    recommendations: ['Keep this employee profile current.'],
  };
}

async function enrichEmployee(employee) {
  try {
    return await requestAI({
      total: 1,
      departments: 1,
      records: [employee],
      task: 'Create a concise employee profile summary and practical data-quality recommendation.',
    });
  } catch (error) {
    logger.warn({ err: error.message }, 'Using fallback employee enrichment');
    return fallbackEmployeeSummary(employee);
  }
}

async function protect(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('name email');
    if (!user) return res.status(401).json({ message: 'Account not found' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

app.get('/api/health', async (_req, res) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(database === 'connected' ? 200 : 503).json({
    status: database === 'connected' ? 'ok' : 'degraded',
    database,
    sprint: 16,
  });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter valid account details' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (await User.findOne({ email })) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
    });

    return res.status(201).json({
      token: createToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Email already registered' });
    req.log.error({ err: error }, 'Registration failed');
    return res.status(500).json({ message: 'Could not create account. Please try again.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.json({
      token: createToken(user.id),
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    req.log.error({ err: error }, 'Login failed');
    return res.status(500).json({ message: 'Login is temporarily unavailable' });
  }
});

app.get('/api/employees', protect, async (req, res) => {
  const employees = await Employee.find({ owner: req.user.id }).sort({ createdAt: -1 }).lean();
  res.json(employees);
});

app.post('/api/employees', protect, async (req, res) => {
  const validationError = validateEmployee(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  const employeeData = {
    name: req.body.name.trim(),
    role: req.body.role.trim(),
    department: req.body.department.trim(),
    email: req.body.email.trim().toLowerCase(),
  };
  const enrichment = await enrichEmployee(employeeData);
  const employee = await Employee.create({
    ...employeeData,
    aiTag: employeeData.department,
    aiSummary: enrichment.summary,
    owner: req.user.id,
  });

  return res.status(201).json(employee);
});

app.put('/api/employees/:id', protect, async (req, res) => {
  const validationError = validateEmployee(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  const employee = await Employee.findOne({ _id: req.params.id, owner: req.user.id });
  if (!employee) return res.status(404).json({ message: 'Employee not found' });

  employee.name = req.body.name.trim();
  employee.role = req.body.role.trim();
  employee.department = req.body.department.trim();
  employee.email = req.body.email.trim().toLowerCase();
  employee.aiTag = employee.department;
  employee.aiSummary = fallbackEmployeeSummary(employee).summary;
  await employee.save();

  return res.json(employee);
});

app.delete('/api/employees/:id', protect, async (req, res) => {
  const employee = await Employee.findOneAndDelete({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!employee) return res.status(404).json({ message: 'Employee not found' });
  return res.json({ id: req.params.id, message: 'Employee deleted' });
});

app.post('/api/ai/insights', protect, async (req, res) => {
  try {
    const records = await Employee.find({ owner: req.user.id })
      .select('name role department email aiTag aiSummary')
      .limit(50)
      .lean();

    const insights = await requestAI({
      total: records.length,
      departments: new Set(records.map((item) => item.department)).size,
      records,
      task: 'Summarize the team and give practical recommendations.',
    });

    return res.json({ insights });
  } catch (error) {
    req.log.error({ err: error }, 'AI insights failed');
    return res.status(502).json({ message: 'AI insights are temporarily unavailable. Please try again.' });
  }
});

app.use((error, req, res, _next) => {
  req.log?.error({ err: error }, 'Unhandled API error');
  if (res.headersSent) return;
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Invalid JSON request body' });
  }
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

async function start() {
  if (!process.env.MONGO_URI || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set MONGO_URI and a JWT_SECRET with at least 32 characters before starting.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  app.listen(PORT, () => logger.info({ port: PORT }, 'Sprint 16 API started'));
}

start().catch((error) => {
  logger.fatal({ err: error }, 'API startup failed');
  process.exit(1);
});
