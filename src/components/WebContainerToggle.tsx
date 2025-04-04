import { useState } from 'react';
import { WebContainerProvider } from './WebContainerProvider';
import { Button } from './ui/button';

interface WebContainerToggleProps {
  children: React.ReactNode;
  port?: number;
  nodeEnv?: string;
  serverOptions?: Record<string, string>;
}

export function WebContainerToggle({ 
  children, 
  port = 4000,
  nodeEnv = 'development',
  serverOptions = {}
}: WebContainerToggleProps) {
  const [useWebContainer, setUseWebContainer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = () => {
    if (!useWebContainer) {
      setIsLoading(true);
      // We'll set this back to false when the server starts in the provider
      setTimeout(() => {
        setUseWebContainer(true);
      }, 100);
    } else {
      setUseWebContainer(false);
    }
  };

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex items-center space-x-2">
        <Button 
          onClick={handleToggle}
          disabled={isLoading}
          className={useWebContainer ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}
        >
          {isLoading ? 'Starting WebContainer...' : 
            useWebContainer ? 'Using WebContainer' : 'Use WebContainer'}
        </Button>
      </div>

      {useWebContainer ? (
        <WebContainerProvider
          autoStart
          port={port}
          nodeEnv={nodeEnv}
          serverOptions={{
            ...serverOptions,
            WEBCONTAINER: 'true' 
          }}
          onServerStarted={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setUseWebContainer(false);
          }}
        >
          {children}
        </WebContainerProvider>
      ) : (
        children
      )}
    </>
  );
}