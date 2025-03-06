import express from 'express';

export function setHealthRoutes(app: express.Express) {
    const router = express.Router();

    router.get('/', (_req, res) => {
        res.send('Worker17 MCP Server is running');
    });

    app.use('/', router);
}