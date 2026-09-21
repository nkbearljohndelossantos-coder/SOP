import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { env, isProduction } from './config/env';
import { errorHandler } from './middleware/errorHandler';

import attachmentRoutes from './routes/attachmentRoutes';
import auditRoutes from './routes/auditRoutes';
import authRoutes from './routes/authRoutes';
import departmentRoutes from './routes/departmentRoutes';
import notificationRoutes from './routes/notificationRoutes';
import reportRoutes from './routes/reportRoutes';
import remarkRoutes from './routes/remarkRoutes';
import sopRoutes from './routes/sopRoutes';
import userRoutes from './routes/userRoutes';
import workflowRoutes from './routes/workflowRoutes';

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Handled by frontend bundler / static host
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow localhost, client URL, or same-origin/no origin (mobile/Postman)
      if (!origin || origin === env.CLIENT_URL || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static uploads directory
const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Request logging (suppressed in tests)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(isProduction ? 'combined' : 'dev'));
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.APP_ENV,
    version: '1.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/sops', sopRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/remarks', remarkRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/reports', reportRoutes);

// Static client production serving
const candidatePaths = [
  process.env.CLIENT_DIST,
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(process.cwd(), '../client/dist'),
].filter(Boolean) as string[];

const clientDist = candidatePaths.find((p) => fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html')));

if (clientDist) {
  console.log(`[Static Serving] Serving production client from: ${clientDist}`);
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  console.log('[Static Serving] No compiled client dist directory found. API-only mode.');
}

// 404 handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found.`,
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
