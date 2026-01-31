import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createNodeWebSocket } from '@hono/node-ws';
import { createLspWebSocketHandler } from './lsp-websocket';
import { registerFilesystemRoutes } from './filesystem';
import { registerUploadRoute } from './upload';
import { registerSerialRoutes } from './serial';
// ============================================================================
// Hono App Setup
// ============================================================================
const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
app.use('/*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: false
}));
// ============================================================================
// Health Check
// ============================================================================
app.get('/', (c) => {
    return c.json({ version: 1, status: 'ok' });
});
// ============================================================================
// LSP WebSocket Endpoint
// ============================================================================
app.get('/lsp', upgradeWebSocket((c) => createLspWebSocketHandler(c)));
// ============================================================================
// Register Route Modules
// ============================================================================
registerFilesystemRoutes(app);
registerUploadRoute(app);
registerSerialRoutes(app);
// ============================================================================
// Start Server
// ============================================================================
const port = 8152;
console.log(`Server starting on port ${port}`);
const server = serve({
    fetch: app.fetch,
    port
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
injectWebSocket(server);
