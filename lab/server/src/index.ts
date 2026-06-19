import express from 'express';
import path from 'node:path';
import { LAB_HOST, LAB_PORT, webDistRoot } from './config.js';
import { apiRouter } from './routes/api.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRouter);
app.use(express.static(webDistRoot));

app.use((_req, res) => {
  res.sendFile(path.join(webDistRoot, 'index.html'));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(400).json({ error: message });
});

app.listen(LAB_PORT, LAB_HOST, () => {
  console.log(`Wiki Lab UI listening at http://${LAB_HOST}:${LAB_PORT}`);
});
