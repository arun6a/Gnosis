#!/bin/sh
# Startup script: create tables if they don't exist, then start the app
# Uses node + pg to execute raw SQL (no prisma CLI needed)

node -e "
const fs = require('fs');
const sql = fs.readFileSync('./prisma/startup-create-tables.sql', 'utf8');
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

// Parse DATABASE_URL to extract connection info
// Format: postgresql://user:pass@host:port/db?schema=public
const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
if (!match) { console.error('Invalid DATABASE_URL format'); process.exit(1); }
const [, user, pass, host, port, dbname] = match;

const { Client } = require('pg');
const client = new Client({ user, password: pass, host, port: parseInt(port), database: dbname });
client.connect()
  .then(() => client.query(sql))
  .then(() => { console.log('[startup] ✓ Tables created/verified'); return client.end(); })
  .then(() => { console.log('[startup] Starting app...'); })
  .catch(err => { console.error('[startup] Failed:', err.message); process.exit(1); });
" && exec node server.js
