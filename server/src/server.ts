import express from 'express';
import expressWs from 'express-ws';
import cors from 'cors';
import getCorsOptions from './config/cors.js';
import { loadEnv } from './config/dotenv.js';
import { setSseRoutes } from './routes/sse.js';
import { setSocketRoutes } from './routes/socket.js';
import { setHealthRoutes } from './routes/health.js';

loadEnv();

const nodeEnv = process.env.NODE_ENV || 'development';

const PORT = process.env.PORT || 4000;

const app = express();

app.use(cors(getCorsOptions(nodeEnv)));
app.use(express.json());

setHealthRoutes(app);
setSseRoutes(app);

const wsApp = expressWs(app);

setSocketRoutes(wsApp);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${nodeEnv}`);
});
