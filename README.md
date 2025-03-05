# Worker17

An MCP-enabled 3D Worker Monitoring and Control System

## Overview

Worker17 is a comprehensive system that allows you to:

1. Monitor worker position and status
2. Send commands to workers to control their behavior
3. Use Claude Desktop to monitor and control workers via MCP

The system consists of:

- **Webapp**: A 3D visualization of worker status using React, Three.js, and WebSockets
- **Server**: A Node.js/Express server with WebSocket support and MCP integration
- **MCP Integration**: Claude Desktop compatibility for AI-assisted worker management

## Quick Start

### Development Setup

```bash
# Start the server
cd server
npm install
npm run dev

# In another terminal, start the webapp
npm install
npm run dev
```

## Architecture

### WebSocket Communication

The system uses WebSockets for bidirectional real-time communication:

- Workers report their status (position, battery, active tasks) to the server
- Server maintains the current state of all workers
- Control commands are sent to specific workers
- MCP server exposes tools to query and control workers

### MCP Integration

Claude Desktop can connect to the system through MCP to:

1. Get a list of all available workers and their states
2. Check the status of a specific worker
3. Send commands to workers (move, stop, activate, etc.)

#### MCP Tools

The following MCP tools are available:

- `get-workers`: Get a list of all workers and their states
- `get-worker-state`: Get the state of a specific worker by ID
- `send-command`: Send a command to a worker (move, stop, reset, etc.)

## Using with Claude Desktop

To use Worker17 with Claude Desktop:

1. Install Claude Desktop from https://claude.ai/download
2. Configure Claude Desktop to use the Worker17 MCP server
3. Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "worker17": {
      "command": "node",
      "args": [
        "/path/to/worker17/server/dist/index.js"
      ],
      "env": {
        "PORT": "3001"
      }
    }
  }
}
```

4. Restart Claude Desktop
5. Ask Claude to check worker status or send commands

Example prompts for Claude:
- "Can you check the status of all workers?"
- "Tell worker17-primary to stop moving."
- "Set worker17-primary to working on task 'Clean sector 7'"
