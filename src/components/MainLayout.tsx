import { useCallback, useState } from 'react';
import { SafeViewport } from './SafeViewport';
import { ContainerDimensions } from './ContainerDimensions';
import { Camera } from './Camera';

export function MainLayout() {
    const [, setVideoStream] = useState<MediaStream>();

    const handleVideoStream = useCallback((stream?: MediaStream) => {
        setVideoStream(stream);
    }, []);

    return (
        <SafeViewport>
            <Camera onStreamChange={handleVideoStream} />
            <ContainerDimensions className='flex flex-col h-full w-full'>
                <div className="flex flex-col h-full w-full">
                    Hello, worker17!
                </div>
            </ContainerDimensions>
        </SafeViewport>
    );
}