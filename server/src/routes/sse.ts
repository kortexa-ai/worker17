import express from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Import worker state functions from socket module
import { terminateWorker, getAllWorkerIds, getWorkerState, getCameraImage } from './socket.js';

export function setSseRoutes(app: express.Express) {
    const MCP_SERVER_NAME = process.env.MCP_SERVER_NAME || 'worker17-mcp-server';

    const mcpServer = new McpServer({
        name: MCP_SERVER_NAME,
        version: "1.0.0"
    }, {
        capabilities: {
            resources: {},
            tools: {}
        }
    });

    mcpServer.resource(
        "worker",
        new ResourceTemplate("workers://{workerId}", {
            list: async () => {
                // Get IDs of all connected workers
                const workerIds = getAllWorkerIds();
                
                // Request status for each worker (in parallel)
                const workerPromises = workerIds.map(id => getWorkerState(id));
                
                // Wait for all status requests to complete
                const workers = await Promise.all(workerPromises);
                
                return {
                    resources: workers.map(worker => ({
                        uri: `workers://${worker?.id}`,
                        name: `Worker ${worker?.id}`,
                        metadata: {
                            status: worker?.status,
                            batteryLevel: worker?.batteryLevel || 0
                        }
                    }))
                };
            }
        }),
        async (uri, { workerId }) => {
            // Get specific worker state
            let workerIdString: string = '';
            if (Array.isArray(workerId) && workerId.length > 0) {
                workerIdString = workerId[0];
            } else {
                workerIdString = workerId.toString();
            }

            // Get fresh status directly from the worker
            const worker = await getWorkerState(workerIdString);
            
            if (!worker) {
                return {
                    contents: [{
                        uri: uri.href,
                        text: `Worker ${workerIdString} not found or not connected`,
                    }]
                };
            }
            
            return {
                contents: [{
                    uri: uri.href,
                    text: `Worker ${workerIdString} - Status: ${worker.status}\n` +
                          `Battery Level: ${worker.batteryLevel}%\n` +
                          `Current Task: ${worker.currentTask || 'None'}\n` +
                          `Last Update: ${new Date(worker.timestamp).toLocaleString()}`,
                }]
            };
        }
    );

    mcpServer.tool(
        'get-status',
        'Get worker status',
        {
            workerId: z.string().describe('ID of the worker to get status for'),
        },
        async (params: unknown) => {
            const { workerId } = params as { workerId: string };
            // Get fresh status directly from the worker
            const worker = await getWorkerState(workerId);
            
            if (!worker) {
                return {
                    content: [{
                        type: "text",
                        text: `Worker ${workerId} not found or not connected`
                    }]
                };
            }
            
            return {
                content: [{
                    type: "text",
                    text: `Worker ${workerId}:\n` +
                          `Status: ${worker.status}\n` +
                          `Battery Level: ${worker.batteryLevel}%\n` +
                          `Current Task: ${worker.currentTask || 'None'}\n` +
                          `Last Update: ${new Date(worker.timestamp).toLocaleString()}`
                }]
            };
        }
    );

    mcpServer.tool(
        'terminate',
        'Fire a worker',
        {
            workerId: z.string().describe('ID of the worker to fire'),
        },
        async (params: unknown) => {
            const { workerId } = params as { workerId: string };
            
            // Attempt to send terminate command to worker
            const success = terminateWorker(workerId);
            
            if (success) {
                return {
                    content: [{
                        type: "text",
                        text: `Worker ${workerId} termination command sent successfully`
                    }]
                };
            } else {
                return {
                    content: [{
                        type: "text",
                        text: `Failed to terminate worker ${workerId}: Worker not connected`
                    }]
                };
            }
        }
    );
    
    mcpServer.tool(
        'getCameraImage',
        'Get the current camera view from a worker',
        {
            workerId: z.string().describe('ID of the worker to get image from'),
        },
        async (params: unknown) => {
            const { workerId } = params as { workerId: string };
            
            // Request camera image from worker
            const imageData = await getCameraImage(workerId);
            
            if (imageData) {
                return {
                    content: [{
                        type: "image",
                        data: imageData.replace(/^data:image\/png;base64,/, ''), // Remove data URL prefix for PNG
                        mimeType: "image/png"
                    }]
                };
            } else {
                return {
                    content: [{
                        type: "text",
                        text: `Failed to get camera image from worker ${workerId}: Worker not connected or image capture failed`
                    }]
                };
            }
        }
    );

    // Map to store transports by session ID
    const transports = new Map<string, SSEServerTransport>();
    
    const sseRouter = express.Router();

    sseRouter.get('/', (_req, res) => {
        // Create new transport for this session
        const transport = new SSEServerTransport("/sse/messages", res);
        
        // Connect transport to MCP server
        mcpServer.server.connect(transport);
        
        // Extract sessionId after connection (it's generated by SSEServerTransport internally)
        const sessionId = transport.sessionId;
        if (sessionId) {
            console.log(`New SSE session established: ${sessionId}`);
            transports.set(sessionId, transport);
            
            // Clean up when connection closes
            res.on('close', () => {
                console.log(`SSE session closed: ${sessionId}`);
                transports.delete(sessionId);
            });
        } else {
            console.error("Failed to get sessionId from transport");
        }
    });

    sseRouter.post('/messages', (req, res) => {
        const sessionId = req.query.sessionId as string;
        
        if (!sessionId) {
            res.status(400).send('Missing sessionId parameter');
            return;
        }
        
        const transport = transports.get(sessionId);
        
        if (!transport) {
            console.warn(`No active transport for session ${sessionId}`);
            res.status(404).send(`No active session: ${sessionId}`);
            return;
        }
        
        console.log(`Received message for sessionId ${sessionId}`);

        const message: JSONRPCMessage = req.body as JSONRPCMessage;
        try {
            transport.handlePostMessage(req, res, message);
        } catch (error) {
            console.error(`Error in /message route for session ${sessionId}:`, error);
            res.status(500).json(error);
        }
    });

    app.use('/sse', sseRouter);
}