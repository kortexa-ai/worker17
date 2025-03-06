# Worker17

An MCP-enabled 3D Worker Monitoring and Control System

## Overview

Worker17 is a comprehensive system that allows you to:

1. Monitor worker 17 position and status
2. Send tasks to worker 17
3. Terminate worker 17 due to unsatisfactory performance
4. Use Claude Desktop to monitor, control, and terminate worker 17 via MCP

The system consists of:

- **Webapp**: A 3D visualization of worker 17 status using React, Three.js, and WebSockets
- **Server**: A Node.js/Express server with WebSocket support and SSE MCP server implementation
- **MCP Integration**: Claude Desktop compatibility for AI-assisted worker 17 management

## And more seriously?

Worker17 started as a practical joke, and then it turned into an exploration of SSE MCP servers. It's a silly project, but it's also a fun way to learn about MCP.

## Quick Start

### Development Setup

```bash
# Start the server
cd server
npm install
npm start

# In another terminal, start the webapp
npm install
npm start
```

### Docker

You can also run the system using Docker:

```bash
docker-compose up
```

Note: If you are running docker in WSL without Docker Desktop, there's currently a bug that prevents the ports from being exposed.
The workaround is to run the container with host network mode. However, this poses potential risk, as it bypasses the networking isolation of the container.

### MCP Inspector

You can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to connect to the Worker17 MCP server and inspect the state of the workers. Choose SSE transport and provide the worker17 server URL: `http://localhost:4000/sse` (or whatever is the URL you are running the server on).

### Claude Desktop

Claude Desktop currently does not support SSE MCP server. To use the Worker17 MCP server, you will need a proxy Stdio MCP server. I've tested this with [mcp-proxy](https://github.com/sparfenyuk/mcp-proxy). You will need to install it as a Windows app and put it in the path. I used Windows binaries for uv which added it to %USERPROFILE%\.local\bin

Then you can add the worker17 MCP server to Claude Desktop configuration:

```json
{
  "mcpServers": {
    "worker17": {
        "command": "mcp-proxy",
        "args": ["http://localhost:4000/sse"]
    }
  }
}
```

Make sure the server is up and running before you start Claude Desktop.