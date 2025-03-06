import { useRef, useImperativeHandle, forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { WebGLRendererParameters } from 'three';

// Screenshot handler component within the Canvas
function ScreenshotHandler({ onHandlerReady }: { onHandlerReady: (captureScreenshot: () => string) => void }) {
    const { gl, scene, camera } = useThree();
    
    // Create the screenshot capture function
    const captureScreenshot = () => {
        // Force a render
        gl.render(scene, camera);
        
        // Get the image data as a base64 string
        const screenshot = gl.domElement.toDataURL('image/png');
        return screenshot;
    };
    
    // Provide the handler to the parent
    onHandlerReady(captureScreenshot);
    
    return null;
}

type DataContextRenderFunction<DataContext extends object = object> = (dataContext?: DataContext) => ReactNode;

interface ThreeContainerProps<DataContext extends object = object> {
    width: number;
    height: number;
    cameraPosition?: [number, number, number];
    cameraFov?: number;
    gl?: WebGLRendererParameters;
    dataContext?: DataContext;
    children?: DataContextRenderFunction<DataContext> | ReactNode;
    onScreenshotHandlerReady?: (captureScreenshot: () => string) => void;
}

// Export the type for use in other components
export interface ThreeContainerRef {
    captureScreenshot: () => string;
}

export const ThreeContainer = forwardRef(function ThreeContainer<DataContext extends object = object>({
    width,
    height,
    cameraPosition = [0, 0, 8],
    cameraFov = 75,
    gl = { alpha: true, antialias: true },
    dataContext,
    children,
    onScreenshotHandlerReady
}: ThreeContainerProps<DataContext>, ref: React.ForwardedRef<ThreeContainerRef>) {
    // Use the actual container dimensions directly
    const currentAspect = width / height;

    // Make sure we have valid dimensions
    if (width === 0 || height === 0) return null;

    const screenshotRef = useRef<(() => string) | null>(null);

    // Setup the ref for external access
    useImperativeHandle(ref, () => ({
        captureScreenshot: () => {
            if (screenshotRef.current) {
                return screenshotRef.current();
            }
            return ''; // Return empty if not ready
        }
    }));

    // Handler for when the screenshot handler is ready
    const handleScreenshotHandlerReady = (captureScreenshot: () => string) => {
        screenshotRef.current = captureScreenshot;
        
        // Call the external handler if provided
        if (onScreenshotHandlerReady) {
            onScreenshotHandlerReady(captureScreenshot);
        }
    };

    const renderContent = () => {
        if (typeof children === 'function') {
            return children(dataContext);
        }

        return children;
    };


    return (
        <div className="relative w-full h-full">
            <Canvas
                camera={{
                    fov: cameraFov,
                    position: cameraPosition,
                    aspect: currentAspect
                }}
                gl={gl}
                className='h-[100%] w-[100%]'
                resize={{ scroll: false }}
            >
                <ScreenshotHandler onHandlerReady={handleScreenshotHandlerReady} />
                {renderContent()}
            </Canvas>
        </div>
    );
});
