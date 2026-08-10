import { env } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[journal-api] running on port ${env.port} with base path ${env.apiBasePath}`);
});
