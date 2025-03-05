import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from 'dotenv';
import { Worker17WebSocketServer } from './websocketServer.js';
import { Worker17McpServer } from './mcp/mcpServer.js';

// Load environment variables
config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;
const MCP_SERVER_NAME = process.env.MCP_SERVER_NAME || 'worker17-mcp-server';

// Middleware
app.use(cors());
app.use(express.json());

// HTTP server
const httpServer = createServer(app);

// Initialize WebSocket server
const wsServer = new Worker17WebSocketServer(httpServer);

// Basic HTTP routes
const router = express.Router();
router.get('/', (_req: Request, res: Response) => {
  res.send('Worker17 Server is running');
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

router.get('/workers', (_req: Request, res: Response) => {
  const workers = wsServer.getAllWorkerStates();
  res.json(workers);
});

// Route handler defined separately to avoid type inference issues
// router.get('/workers/:id', (req: Request, res: Response) => {
//   const workerId = req.params.id;
//   const worker = wsServer.getWorkerState(workerId);
  
//   if (!worker) {
//     return res.status(404).json({ error: 'Worker not found' });
//   }
  
//   return res.json(worker);
// });

app.use('/', router);

// Start servers
async function startServer() {
  try {
    // Start the HTTP/WebSocket server
    httpServer.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
    
    // Start the MCP server
    const mcpServer = new Worker17McpServer(wsServer, MCP_SERVER_NAME);
    await mcpServer.start();
    
    console.log('All servers started successfully');
  } catch (error) {
    console.error('Error starting servers:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down servers...');
  httpServer.close(() => {
    console.log('HTTP/WebSocket server closed');
    process.exit(0);
  });
});

startServer();