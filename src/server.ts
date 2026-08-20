import express, { type Express } from 'express';
import type Database from 'better-sqlite3';
import { OrderStore } from './db/orderStore.js';
import { dashboardRouter } from './routes/dashboard.js';

export function createServer(db: Database.Database): { app: Express; store: OrderStore } {
  const store = new OrderStore(db);
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(dashboardRouter(store));
  return { app, store };
}
