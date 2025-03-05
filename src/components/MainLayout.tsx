import { Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { SafeViewport } from './SafeViewport';
import { ContainerDimensions } from './ContainerDimensions';
import { Camera } from './Camera';
import { ThreeContainer } from './ThreeContainer';
import { Environment, OrbitControls, Box } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Worker17 } from './Worker17';

export const PLOT_SIZE = 20;

export function MainLayout() {
    const [, setVideoStream] = useState<MediaStream>();
    const [isWorkerWalking, setIsWorkerWalking] = useState(false);
    const [workerPosition, setWorkerPosition] = useState<[number, number, number]>([0, 0, 0]);
    const [workerDirection, setWorkerDirection] = useState<[number, number, number]>([0, 0, 1]);
    const lastAngle = useRef(0);

    // Toggle walking state periodically for demonstration
    useEffect(() => {
        const interval = setInterval(() => {
            setIsWorkerWalking(prev => !prev);
        }, 5000); // Toggle every 5 seconds
        
        return () => clearInterval(interval);
    }, []);

    // Update worker position when walking
    useEffect(() => {
        // When starting to walk, initialize angle based on current position
        if (isWorkerWalking) {
            // Get the current position to calculate initial angle
            const [x, , z] = workerPosition;
            
            // Calculate the current angle based on position (or use default if at origin)
            if (x !== 0 || z !== 0) {
                lastAngle.current = Math.atan2(z, x);
            }
            
            const radius = 5;
            // Start the animation from the current position
            const walkInterval = setInterval(() => {
                // Increment angle smoothly from the last position
                lastAngle.current = (lastAngle.current + 0.01) % (2 * Math.PI);
                const angle = lastAngle.current;
                
                // Calculate new position (circular path)
                const newX = radius * Math.cos(angle);
                const newZ = radius * Math.sin(angle);
                
                // Calculate direction vector (tangent to the circle)
                const dirX = -Math.sin(angle);
                const dirZ = Math.cos(angle);
                
                setWorkerPosition([newX, 0, newZ]);
                setWorkerDirection([dirX, 0, dirZ]);
            }, 16); // ~60fps for smooth movement
            
            return () => clearInterval(walkInterval);
        }
    }, [isWorkerWalking, workerPosition]);

    const handleVideoStream = useCallback((stream?: MediaStream) => {
        setVideoStream(stream);
    }, []);

    return (
        <SafeViewport>
            <Camera onStreamChange={handleVideoStream} />
            <ContainerDimensions className="w-full h-full flex-1 min-h-0">
                {({ width, height }) => (
                    <ThreeContainer
                        width={width}
                        height={height}
                        cameraPosition={[8, 8, 8]}
                        cameraFov={50}
                    >
                        {/* Lighting */}
                        <ambientLight intensity={0.5} />
                        <directionalLight
                            position={[5, 8, 5]}
                            intensity={1}
                            castShadow
                            shadow-mapSize={[2048, 2048]}
                            shadow-camera-left={-10}
                            shadow-camera-right={10}
                            shadow-camera-top={10}
                            shadow-camera-bottom={-10} />

                        <Suspense fallback={null}>
                            <Physics debug={false}>
                                {/* Grass ground with physics */}
                                <RigidBody type="fixed" colliders={false}>
                                    <CuboidCollider
                                        args={[PLOT_SIZE / 2, 0.1, PLOT_SIZE / 2]}
                                        position={[0, -0.1, 0]} />
                                    <Box
                                        args={[PLOT_SIZE, 0.2, PLOT_SIZE]}
                                        position={[0, -0.1, 0]}
                                        receiveShadow
                                    >
                                        <meshStandardMaterial color="#4ade80" />
                                    </Box>
                                </RigidBody>
                            </Physics>
                            <Worker17 
                                position={workerPosition} 
                                isWalking={isWorkerWalking}
                                direction={workerDirection}
                            />
                            <Environment preset="park" />
                        </Suspense>

                        <OrbitControls
                            enablePan={true}
                            enableZoom={true}
                            minDistance={3}
                            maxDistance={20}
                            maxPolarAngle={Math.PI / 2 - 0.1}
                            target={[0, 0, 0]} />

                    </ThreeContainer>
                )}
            </ContainerDimensions>
        </SafeViewport>
    );
}