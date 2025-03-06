import type { Instance } from 'express-ws';
import type { WebSocket, RawData } from 'ws';
import type { Request } from 'express';

const wsClient = (ws: WebSocket, _req: Request) => {
    ws.on('message', async (message: RawData) => {
        const data = JSON.parse(message.toString());
        console.log(data);
        ws.send(JSON.stringify({ type: 'ack' }));
    });
};

export function setSocketRoutes(wsApp: Instance) {
    wsApp.app.ws('/ws', wsClient);
}