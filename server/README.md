# Worker17 Server

Node.js/Express server providing WebSocket and MCP functionality for Worker17.

## Features

- WebSocket server for real-time communication with worker clients
- RESTful API for worker status monitoring
- MCP server integration for Claude Desktop compatibility
- TypeScript for type safety and better development experience

## Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Build for production
npm run build
```

## API Endpoints

- `GET /health` - Server health check
- `GET /workers` - Get all registered workers
- `GET /workers/:id` - Get a specific worker by ID

## WebSocket Protocol

The server uses WebSockets for bidirectional communication with worker clients. Message types include:

### 1. Worker Connection

```json
{
  "type": "connect",
  "workerId": "worker-id",
  "payload": {},
  "timestamp": 1709564852123
}
```

### 2. State Update

```json
{
  "type": "stateUpdate",
  "workerId": "worker-id",
  "payload": {
    "id": "worker-id",
    "active": true,
    "status": "idle",
    "position": { "x": 0, "y": 0, "z": 0 },
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "batteryLevel": 85,
    "currentTask": "patrol",
    "timestamp": 1709564852123
  },
  "timestamp": 1709564852123
}
```

### 3. Command

```json
{
  "type": "command",
  "workerId": "worker-id",
  "payload": {
    "command": "move",
    "parameters": {
      "x": 10,
      "y": 0,
      "z": 5
    }
  },
  "timestamp": 1709564852123
}
```

## MCP Tools

The MCP server exposes the following tools:

### 1. get-workers

Get a list of all available workers and their states.

### 2. get-worker-state

Get the state of a specific worker.

Parameters:
- `workerId` - ID of the worker to query

### 3. send-command

Send a command to a worker.

Parameters:
- `workerId` - ID of the worker to control
- `command` - Command to send (`move`, `stop`, `reset`, `activate`, `deactivate`, `setTask`)
- `parameters` - Optional parameters specific to the command

## Environment Variables

- `PORT` - Server port (default: 3001)
- `MCP_SERVER_NAME` - Name of the MCP server (default: worker17-mcp-server)
