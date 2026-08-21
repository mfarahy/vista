import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';

createApp().listen(port, host, () => {
  console.log(`Vista expose service listening on http://${host}:${port}`);
});
