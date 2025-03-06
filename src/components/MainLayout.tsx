import { Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { SafeViewport } from './SafeViewport';
import { ContainerDimensions } from './ContainerDimensions';
import { Camera } from './Camera';
import { ThreeContainer } from './ThreeContainer';
import { Environment, OrbitControls, Box } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Worker17 } from './Worker17';
import { useWebSocket } from '@/socket/hooks/useWebSocket';

export const PLOT_SIZE = 20;

export function MainLayout() {
    const [, setVideoStream] = useState<MediaStream>();
    const [isWorkerWalking, setIsWorkerWalking] = useState(false);
    const [workerPosition, setWorkerPosition] = useState<[number, number, number]>([0, 0, 0]);
    const [workerDirection, setWorkerDirection] = useState<[number, number, number]>([0, 0, 1]);
    const [isTerminated, setIsTerminated] = useState(false);
    const lastAngle = useRef(0);
    const { workerState, sendMessage } = useWebSocket();
    
    // Detect worker termination
    useEffect(() => {
        // Check if worker has been terminated (status is offline and has a termination task)
        if (workerState && 
            workerState.status === 'offline' && 
            workerState.currentTask === 'Termination in progress') {
            setIsTerminated(true);
            // Always set walking to true for the run-away animation
            setIsWorkerWalking(true);
        }
    }, [workerState]);

    // Toggle walking state periodically for demonstration (unless terminated)
    useEffect(() => {
        // Don't toggle walking if the worker is terminated
        if (isTerminated) return;
        
        const interval = setInterval(() => {
            setIsWorkerWalking(prev => !prev);
        }, 5000); // Toggle every 5 seconds
        
        return () => clearInterval(interval);
    }, [isTerminated]);

    // Update worker position when walking or terminated
    useEffect(() => {
        // When starting to walk, initialize angle based on current position
        if (isWorkerWalking) {
            // Get the current position to calculate initial angle
            const [x, , z] = workerPosition;
            
            // Different animation paths for normal walking vs termination
            if (isTerminated) {
                // For termination - run straight off the edge of the plate
                
                // Calculate a random edge direction if we're at the origin
                if (x === 0 && z === 0) {
                    // Random angle between 0 and 2π
                    const randomAngle = Math.random() * Math.PI * 2;
                    // Set initial direction toward edge
                    setWorkerDirection([Math.cos(randomAngle), 0, Math.sin(randomAngle)]);
                    lastAngle.current = randomAngle;
                } else {
                    // Already away from origin, use current position to determine direction
                    lastAngle.current = Math.atan2(z, x);
                    // Point directly away from center
                    setWorkerDirection([Math.cos(lastAngle.current), 0, Math.sin(lastAngle.current)]);
                }
                
                // Reference to track the animation
                const positionRef = { x, y: 0, z };
                const speedRef = { value: 0.05 }; // Initial speed
                const maxSpeed = 0.3; // Maximum run speed
                
                // Run away animation - accelerate toward the edge
                const runInterval = setInterval(() => {
                    // Accelerate
                    speedRef.value = Math.min(speedRef.value * 1.05, maxSpeed);
                    
                    // Update position in the current direction
                    positionRef.x += Math.cos(lastAngle.current) * speedRef.value;
                    positionRef.z += Math.sin(lastAngle.current) * speedRef.value;
                    
                    // Set the new position
                    setWorkerPosition([positionRef.x, 0, positionRef.z]);
                    
                    // If we've gone far enough (well past the edge), clean up
                    const distanceFromCenter = Math.sqrt(positionRef.x * positionRef.x + positionRef.z * positionRef.z);
                    if (distanceFromCenter > PLOT_SIZE * 0.75) {
                        // Worker is gone!
                        clearInterval(runInterval);
                    }
                    
                    // Update server state if needed
                    if (workerState) {
                        sendMessage({
                            type: 'stateUpdate',
                            workerId: workerState.id,
                            payload: {
                                ...workerState,
                                position: { x: positionRef.x, y: 0, z: positionRef.z },
                                rotation: { x: 0, y: lastAngle.current, z: 0 },
                                status: 'offline',
                                timestamp: Date.now()
                            },
                            timestamp: Date.now()
                        });
                    }
                }, 16);
                
                return () => clearInterval(runInterval);
            } 
            // Normal walking in a circle
            else {
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
                    
                    // Send updated position to server if we have a worker state
                    if (workerState) {
                        sendMessage({
                            type: 'stateUpdate',
                            workerId: workerState.id,
                            payload: {
                                ...workerState,
                                position: { x: newX, y: 0, z: newZ },
                                rotation: { x: 0, y: angle, z: 0 },
                                status: isWorkerWalking ? 'working' : 'idle',
                                timestamp: Date.now()
                            },
                            timestamp: Date.now()
                        });
                    }
                }, 16); // ~60fps for smooth movement
                
                return () => clearInterval(walkInterval);
            }
        }
    }, [isWorkerWalking, isTerminated, workerPosition, workerState, sendMessage]);

    const handleVideoStream = useCallback((stream?: MediaStream) => {
        setVideoStream(stream);
    }, []);

    // Status indicator in top-right corner
    const statusIndicator = (
        <div className="absolute top-4 right-4 p-4 bg-black/70 text-white rounded">
            <h3 className="text-lg font-bold mb-2">Worker Status</h3>
            {workerState ? (
                <div>
                    <p>ID: {workerState.id}</p>
                    <p>Status: <span className={`font-bold ${workerState.status === 'idle' ? 'text-blue-400' : workerState.status === 'working' ? 'text-green-400' : workerState.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{workerState.status}</span></p>
                    <p>Battery: <span className={`font-bold ${(workerState.batteryLevel || 0) > 50 ? 'text-green-400' : (workerState.batteryLevel || 0) > 20 ? 'text-yellow-400' : 'text-red-400'}`}>{workerState.batteryLevel || 0}%</span></p>
                    {workerState.currentTask && <p>Task: {workerState.currentTask}</p>}
                </div>
            ) : (
                <p>No data available</p>
            )}
        </div>
    );

    return (
        <SafeViewport>
            <Camera onStreamChange={handleVideoStream} />
            {statusIndicator}
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
                                isTerminated={isTerminated}
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