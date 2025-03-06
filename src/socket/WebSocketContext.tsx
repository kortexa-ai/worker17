import { createContext } from "react";
import type { WebSocketContextState } from "./WebSocketProvider";

export const WebSocketContext = createContext<WebSocketContextState>({
  isConnected: false,
  sendMessage: () => { },
  workerState: null,
  sendCommand: () => { },
  requestStatus: () => { },
  updateWorkerState: () => { }
});
