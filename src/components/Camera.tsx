import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Camera as CameraIcon, CameraOff, SwitchCameraIcon } from 'lucide-react';

interface CameraProps {
    onStreamChange?: (stream?: MediaStream) => void;
    defaultCamera?: 'user' | 'environment';
}

export function Camera({ onStreamChange, defaultCamera = 'user' }: CameraProps): React.ReactElement {
    const [isOn, setIsOn] = useState(false);
    // Initialize facingMode based on device type to avoid setState in effect
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>(() => {
        if (typeof window !== 'undefined' && 'ontouchstart' in window) {
            return 'environment';
        }
        return defaultCamera;
    });
    const [stream, setStream] = useState<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1024 },
                    height: { ideal: 1024 }
                }
            });
            setStream(mediaStream);
            onStreamChange?.(mediaStream);
            setIsOn(true);
        } catch (err) {
            console.error("Error accessing camera:", err);
        }
    }, [facingMode, onStreamChange]);

    const stopCamera = useCallback(() => {
        if (stream) {
            for (const track of stream.getTracks()) {
                track.stop();
            }
            setStream(null);
            onStreamChange?.();
        }
        setIsOn(false);
    }, [stream, onStreamChange]);

    const toggleCamera = useCallback(() => {
        if (isOn) {
            stopCamera();
        } else {
            startCamera();
        }
    }, [isOn, startCamera, stopCamera]);

    const flipCamera = useCallback(() => {
        stopCamera();
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    }, [stopCamera]);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            if (stream) {
                for (const track of stream.getTracks()) {
                    track.stop();
                }
            }
        };
    }, [stream]);

    return (
        <>
            <div className="absolute top-4 left-4 z-10 flex gap-2">
            <Button onClick={toggleCamera}
                variant='default'
                size='icon'
                className={`
                    rounded-full hover:shadow-xl hover:scale-105
                    ${isOn ? 'hover:bg-green-100 hover:text-green-500' : 'hover:bg-blue-50 hover:text-blue-500'}
                    transition-all duration-300
                `}
            >
                {isOn ? <CameraOff /> : <CameraIcon />}
            </Button>
            <Button onClick={flipCamera} disabled={!isOn}
                variant={isOn ? 'default' : 'ghost'}
                size='icon'
                className={`
                    rounded-full
                    ${isOn ? 'hover:shadow-xl hover:scale-105 hover:bg-blue-50 hover:text-blue-500' : ''}
                    transition-all duration-300
                `}
            >
                <SwitchCameraIcon />
            </Button>
            </div>
        </>
    );
}
