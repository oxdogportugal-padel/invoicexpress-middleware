import 'dotenv/config';
import { openDatabase } from './db/db.js';
import { createServer } from './server.js';

const dbPath = process.env.DATABASE_PATH ?? './data/middleware.db';
const port = Number(process.env.PORT ?? 3000);

const db = openDatabase(dbPath);
const { app } = createServer(db);

app.listen(port, () => {
  console.log(`invoicexpress-middleware listening on :${port}`);
});
