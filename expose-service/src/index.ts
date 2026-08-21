import dotenv from 'dotenv';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

dotenv.config();

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

createApp().listen(port, host, () => {
  logger.info({ host, port }, 'Vista expose service listening on http://{host}:{port}');
});
