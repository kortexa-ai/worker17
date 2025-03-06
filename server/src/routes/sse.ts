import express from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

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
            list: () => {
                return {
                    resources: [
                        {
                            uri: "workers://worker17",
                            name: "Worker 17"
                        }
                    ]
                };
            }
        }),
        async (uri, { workerId }) => ({
            contents: [{
                uri: uri.href,
                text: `${workerId} is busy`,
            }]
        })
    );

    mcpServer.tool(
        'get-status',
        'Get worker status',
        {
            workerId: z.string().describe('ID of the worker to get status for'),
        },
        async (params: unknown) => {
            return {
                content: [{
                    type: "text",
                    text: `${(params as { workerId: string }).workerId} is busy`
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
            return {
                content: [{
                    type: "text",
                    text: `${(params as { workerId: string }).workerId} terminated`
                }]
            };
        }
    );

    let transport: SSEServerTransport | null = null;

    const sseRouter = express.Router();

    sseRouter.get('/', (_req, res) => {
        transport = new SSEServerTransport("/sse/messages", res);
        mcpServer.server.connect(transport);
    });

    sseRouter.post('/messages', (req, res) => {
        if (transport) {
            const sessionId = req.query.sessionId;
            console.log(`Received message for sessionId ${sessionId}`);

            const message: JSONRPCMessage = req.body as JSONRPCMessage;
            try {
                transport.handlePostMessage(req, res, message);
            } catch (error) {
                console.error("Error in /message route:", error);
                res.status(500).json(error);
            }
        }
    });

    app.use('/sse', sseRouter);
}