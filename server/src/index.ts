import app from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`=======================================================`);
  console.log(`  SOP MANAGEMENT SYSTEM - REST API SERVER RUNNING`);
  console.log(`  Port:        ${env.PORT}`);
  console.log(`  Environment: ${env.APP_ENV}`);
  console.log(`  Demo Mode:   ${env.ENABLE_DEMO_ACCOUNTS ? 'ENABLED' : 'DISABLED'}`);
  console.log(`=======================================================`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
