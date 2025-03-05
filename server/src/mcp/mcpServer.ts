import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Worker17WebSocketServer } from '../websocketServer.js';
import type { WorkerState } from '../types.js';
import { z } from 'zod';

export class Worker17McpServer {
  private server: McpServer;
  private wsServer: Worker17WebSocketServer;
  
  constructor(wsServer: Worker17WebSocketServer, serverName: string = 'worker17-mcp-server') {
    this.wsServer = wsServer;
    
    // Initialize MCP server
    this.server = new McpServer({
      name: serverName,
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    // Setup tool handlers
    this.setupTools();
  }
  
  private setupTools() {
    // Register tools with the server
    this.server.tool(
      'get-workers',
      'Get a list of all available workers and their states',
      {},
      async () => {
        return this.getWorkersHandler();
      }
    );
    
    this.server.tool(
      'get-worker-state', 
      'Get the current state of a specific worker',
      { 
        workerId: z.string().describe('ID of the worker to query') 
      },
      async (params: unknown) => {
        return this.getWorkerStateHandler(params as { workerId: string });
      }
    );
    
    this.server.tool(
      'send-command',
      'Send a command to control a worker',
      {
        workerId: z.string().describe('ID of the worker to control'),
        command: z.enum(['move', 'stop', 'reset', 'activate', 'deactivate', 'setTask']).describe('Command to send to the worker'),
        parameters: z.record(z.any()).optional().describe('Additional parameters for the command')
      },
      async (params: unknown) => {
        return this.sendCommandHandler(params as { workerId: string; command: 'move' | 'stop' | 'reset' | 'activate' | 'deactivate' | 'setTask'; parameters?: Record<string, unknown> });
      }
    );
  }
  
  private getWorkersHandler() {
    const workers = this.wsServer.getAllWorkerStates();
    
    return {
      content: [
        {
          type: 'text' as const,
          text: this.formatWorkersResponse(workers)
        }
      ]
    };
  }
  
  private getWorkerStateHandler(args: { workerId: string }) {
    const workerState = this.wsServer.getWorkerState(args.workerId);
    
    if (!workerState) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Error: Worker with ID ${args.workerId} not found`
          }
        ]
      };
    }
    
    return {
      content: [
        {
          type: 'text' as const,
          text: this.formatWorkerState(workerState)
        }
      ]
    };
  }
  
  private sendCommandHandler(args: { 
    workerId: string; 
    command: 'move' | 'stop' | 'reset' | 'activate' | 'deactivate' | 'setTask';
    parameters?: Record<string, unknown>;
  }) {
    const { workerId, command, parameters } = args;
    
    // Check if worker exists
    const workerState = this.wsServer.getWorkerState(workerId);
    if (!workerState) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Error: Worker with ID ${workerId} not found`
          }
        ]
      };
    }
    
    // Send command to worker
    const success = this.wsServer.sendCommandToWorker(workerId, command, parameters);
    
    if (!success) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Error: Worker ${workerId} is not connected, command could not be delivered`
          }
        ]
      };
    }
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `Command "${command}" successfully sent to worker ${workerId}`
        }
      ]
    };
  }
  
  private formatWorkersResponse(workers: WorkerState[]) {
    if (workers.length === 0) {
      return 'No workers are currently registered.';
    }
    
    let response = `Found ${workers.length} workers:\n\n`;
    
    workers.forEach(worker => {
      response += this.formatWorkerState(worker) + '\n\n';
    });
    
    return response;
  }
  
  private formatWorkerState(worker: WorkerState) {
    const positionStr = worker.position 
      ? `(${worker.position.x.toFixed(2)}, ${worker.position.y.toFixed(2)}, ${worker.position.z.toFixed(2)})` 
      : 'Unknown';
    
    const batteryStr = worker.batteryLevel !== undefined 
      ? `${worker.batteryLevel}%` 
      : 'Unknown';
    
    return `Worker ID: ${worker.id}
Status: ${worker.status}
Active: ${worker.active ? 'Yes' : 'No'}
Position: ${positionStr}
Battery: ${batteryStr}
Current Task: ${worker.currentTask || 'None'}
Last Updated: ${new Date(worker.timestamp).toLocaleString()}`;
  }
  
  async start() {
    // Connect to a transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('MCP server started and connected to stdio transport');
  }
}