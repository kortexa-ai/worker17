import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { WebContainer } from '@webcontainer/api';

// Import the WebContainer file contents
import packageJsonContent from '../assets/webcontainer/package.json.wcfile';
import serverJsContent from '../assets/webcontainer/server.js.wcfile';

export interface WebContainerComponentProps {
  onReady?: (container: WebContainer) => void;
  onServerStarted?: (url: string) => void;
  onError?: (error: Error) => void;
  port?: number;
  nodeEnv?: string;
  serverOptions?: Record<string, string>;
}

export function WebContainerComponent({
  onReady,
  onServerStarted,
  onError,
  port = 4000,
  nodeEnv = 'development',
  serverOptions = {}
}: WebContainerComponentProps) {
  const [, setIsLoading] = useState(true);
  const [, setIsRunning] = useState(false);
  const [, setServerUrl] = useState('');
  const containerRef = useRef<WebContainer | null>(null);

  // File structure for our server
  const serverFiles = useMemo(() => ({
    'package.json': {
      file: {
        contents: packageJsonContent
      },
    },
    'server.js': {
      file: {
        contents: serverJsContent
      }
    }
  }), []);

  // Initialize and boot the WebContainer
  const initContainer = useCallback(async () => {
    try {
      if (!containerRef.current) {
        setIsLoading(true);

        // Boot the WebContainer
        const container = await WebContainer.boot();
        containerRef.current = container;
        
        // Set environment variables
        await container.setEnvironmentVariables({
          NODE_ENV: nodeEnv,
          PORT: port.toString(),
          WEBCONTAINER: 'true',
          ...serverOptions
        });

        // Mount the server files
        await container.mount(serverFiles);

        // Call the onReady callback with the container instance
        if (onReady) onReady(container);

        // Install dependencies
        const installProcess = await container.spawn('npm', ['install']);

        // Set up terminal logging
        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              console.log('[WebContainer]', data);
            }
          })
        );

        // Wait for the installation to complete
        const installExitCode = await installProcess.exit;

        if (installExitCode !== 0) {
          throw new Error(`npm install failed with code ${installExitCode}`);
        }

        // Start the server
        const serverProcess = await container.spawn('node', ['server.js']);

        // Set up server output logging
        serverProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              console.log('[Server]', data);

              // Check if server started message is in the output
              if (data.includes('Server running at')) {
                const serverUrlMatch = data.match(/Server running at (http:\/\/[^:]+:(\d+))/);
                const url = serverUrlMatch ? serverUrlMatch[1] : `http://localhost:${port}`;
                setServerUrl(url);
                setIsRunning(true);
                setIsLoading(false);

                if (onServerStarted) onServerStarted(url);
              }
            }
          })
        );

        // Handle server errors
        serverProcess.exit.then((exitCode) => {
          if (exitCode !== 0) {
            setIsRunning(false);
            const error = new Error(`Server process exited with code ${exitCode}`);

            if (onError) onError(error);
            else console.error(error);
          }
        });
      }
    } catch (error) {
      setIsLoading(false);
      setIsRunning(false);

      if (onError && error instanceof Error) {
        onError(error);
      } else {
        console.error('Failed to initialize WebContainer:', error);
      }
    }
  }, [serverFiles, onReady, onServerStarted, onError]);

  // Start the WebContainer on component mount
  useEffect(() => {
    // Wait for WebContainer API to be ready
    initContainer();

    // Clean up when component unmounts
    return () => {
      if (containerRef.current) {
        // No explicit teardown needed - the container will be garbage collected
        containerRef.current = null;
      }
    };
  }, [initContainer]);

  return null; // This is a non-visual component
}