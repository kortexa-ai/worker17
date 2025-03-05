import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import type { WebGLRendererParameters } from 'three';

type DataContextRenderFunction<DataContext extends object = object> = (dataContext?: DataContext) => ReactNode;

interface ThreeContainerProps<DataContext extends object = object> {
    width: number;
    height: number;
    cameraPosition?: [number, number, number];
    cameraFov?: number;
    gl?: WebGLRendererParameters;
    dataContext?: DataContext;
    children?: DataContextRenderFunction<DataContext> | ReactNode;
}

export function ThreeContainer<DataContext extends object = object>({
    width,
    height,
    cameraPosition = [0, 0, 8],
    cameraFov = 75,
    gl = { alpha: true, antialias: true },
    dataContext,
    children,
}: ThreeContainerProps<DataContext>) {
    // Use the actual container dimensions directly
    const currentAspect = width / height;

    // Make sure we have valid dimensions
    if (width === 0 || height === 0) return null;

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
                {renderContent()}
            </Canvas>
        </div>
    );
};
