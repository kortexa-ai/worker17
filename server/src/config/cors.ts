import type { CorsOptionsDelegate } from 'cors';

type Protocol = 'http' | 'https';

interface OriginPattern {
    protocol: Protocol;
    domain: string;
    port?: number | '*';
    subdomain?: string | '*';
}

function getCorsOptions(env: string): CorsOptionsDelegate {
    const productionPatterns: OriginPattern[] = [
        {
            protocol: 'https',
            domain: 'kortexa.ai',
            subdomain: '*',
            port: 443
        }
    ];

    const developmentPatterns: OriginPattern[] = [
        {
            protocol: 'https',
            domain: 'localhost',
            port: '*'
        }
    ];

    const isMatch = (pattern: OriginPattern, url: URL): boolean => {
        // Check protocol
        if (pattern.protocol !== url.protocol.replace(':', '')) return false;

        // Check domain
        if (pattern.domain !== url.hostname.split('.').slice(-2).join('.') &&
            pattern.domain !== url.hostname) return false;

        // Check subdomain if specified
        if (pattern.subdomain) {
            const urlParts = url.hostname.split('.');
            if (pattern.subdomain === '*') {
                // Validate subdomain format (not empty, no dots)
                if (urlParts.length > 2 && urlParts[0].length === 0) return false;
                // Everything else is allowed
            } else {
                // No subdomain case
                if (urlParts.length === 2 && pattern.subdomain !== '') return false;
                // With subdomain case
                if (urlParts.length > 2 && urlParts[0] !== pattern.subdomain) return false;
            }
        }

        // Check port if specified
        if (pattern.port !== undefined) {
            const urlPort = url.port || (url.protocol === 'https:' ? '443' : '80');
            if (pattern.port !== '*' && pattern.port.toString() !== urlPort) return false;
        }

        return true;
    };

    return (req, callback) => {
        const corsOptions = {
            origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
                if (!origin) {
                    cb(null, true);
                    return;
                }

                try {
                    const url = new URL(origin);
                    let patterns = productionPatterns;

                    // For development environment, or preflight requests
                    if (env === 'development' || req.method === 'OPTIONS') {
                        patterns = [...patterns, ...developmentPatterns];
                    }

                    const isAllowed = patterns.some(pattern => isMatch(pattern, url));
                    if (isAllowed) {
                        cb(null, true);
                    } else {
                        cb(new Error(`Origin ${origin} not allowed by CORS`));
                    }
                } catch {
                    cb(new Error('Invalid origin'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Upgrade', 'Connection'],
            exposedHeaders: ['Upgrade'],
        };

        callback(null, corsOptions);
    };
}

export default getCorsOptions;