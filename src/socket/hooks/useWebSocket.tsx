import { useContext } from "react";
import { WebSocketContext } from '../WebSocketContext';

// Hook to use the WebSocket context

export const useWebSocket = () => useContext(WebSocketContext);
