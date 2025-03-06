import { Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { SafeViewport } from './SafeViewport';
import { ContainerDimensions } from './ContainerDimensions';
import { Camera } from './Camera';
import { ThreeContainer } from './ThreeContainer';
import { Environment, OrbitControls, Box } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Worker17 } from './Worker17';
import { RechargeStation } from './RechargeStation';
import { useWebSocket } from '../socket/hooks/useWebSocket';

export const PLOT_SIZE = 20;
export const RECHARGE_STATION_POSITION = [-(PLOT_SIZE/2 - 6), 0, -(PLOT_SIZE/2 - 6)] as const; // Opposite corner, more inward for the larger bed
export const RECHARGE_STATION_RADIUS = 2; // Radius to avoid during normal walking

export function MainLayout() {
    const [, setVideoStream] = useState<MediaStream>();
    const [isWorkerWalking, setIsWorkerWalking] = useState(false);
    const [workerPosition, setWorkerPosition] = useState<[number, number, number]>([0, 0, 0]);
    const [workerDirection, setWorkerDirection] = useState<[number, number, number]>([0, 0, 1]);
    const [isTerminated, setIsTerminated] = useState(false);
    const lastAngle = useRef(0);
    const { workerState, sendMessage, requestStatus, updateWorkerState } = useWebSocket();
    
    // Local state for UI display
    const [localStatus, setLocalStatus] = useState({
        batteryLevel: 100,
        status: 'idle' as 'idle' | 'working' | 'error' | 'offline' | 'recharging',
        currentTask: undefined as string | undefined
    });
    
    // Recharging state
    const [isRecharging, setIsRecharging] = useState(false);
    
    // Track battery level
    const batteryRef = useRef<number>(100);
    
    // Target for random walking
    const walkTargetRef = useRef({
        x: 0,
        z: 0,
        timeToChange: 0
    });
    
    // Current direction vector for smooth transitions
    const directionRef = useRef({
        x: 0,
        z: 1
    });
    
    // Detect worker termination
    useEffect(() => {
        // Check if worker has been terminated (status is offline and has a termination task)
        if (workerState && 
            workerState.status === 'offline' && 
            workerState.currentTask === 'Termination in progress') {
            setIsTerminated(true);
            setLocalStatus(prev => ({
                ...prev,
                status: 'offline',
                currentTask: 'Termination in progress'
            }));
            // Always set walking to true for the run-away animation
            setIsWorkerWalking(true);
        }
    }, [workerState]);

    // Toggle walking state periodically for demonstration (unless terminated or recharging)
    useEffect(() => {
        // Don't toggle walking if the worker is terminated or recharging
        if (isTerminated || isRecharging) return;
        
        const interval = setInterval(() => {
            const newWalkingState = !isWorkerWalking;
            setIsWorkerWalking(newWalkingState);
            
            // Update status in the UI
            setLocalStatus(prev => ({
                ...prev,
                status: newWalkingState ? 'working' : 'idle'
            }));
        }, 8000); // Toggle every 8 seconds to allow more battery drain
        
        return () => clearInterval(interval);
    }, [isTerminated, isRecharging, isWorkerWalking]);
    
    // Request initial status once
    useEffect(() => {
        requestStatus();
    }, [requestStatus]);
    
    // Sync battery level with worker state
    useEffect(() => {
        if (workerState?.batteryLevel !== undefined) {
            batteryRef.current = workerState.batteryLevel;
        }
    }, [workerState?.batteryLevel]);
    
    // Periodically drain battery while walking or recharge when at station
    useEffect(() => {
        if (isTerminated) return;
        
        const batteryInterval = setInterval(() => {
            // Recharging mode
            if (isRecharging && !isWorkerWalking) {
                // Increase battery by 8-12% per second
                const chargeAmount = Math.floor(Math.random() * 5) + 8;
                const newBatteryLevel = Math.min(100, batteryRef.current + chargeAmount);
                
                // Update battery state
                batteryRef.current = newBatteryLevel;
                
                // Update local UI state
                setLocalStatus(prev => ({
                    ...prev,
                    batteryLevel: newBatteryLevel,
                    currentTask: 'Recharging'
                }));
                
                // Synchronize with worker state context
                updateWorkerState({
                    batteryLevel: newBatteryLevel,
                    currentTask: 'Recharging'
                });
                
                // If fully charged, allow walking again
                if (newBatteryLevel >= 100) {
                    setIsRecharging(false);
                    setLocalStatus(prev => ({
                        ...prev,
                        status: 'idle',
                        currentTask: undefined
                    }));
                }
            }
            // Draining mode (only when walking)
            else if (isWorkerWalking) {
                // Reduce battery by 5-10% for more noticeable drain
                const drainAmount = Math.floor(Math.random() * 6) + 5;
                const newBatteryLevel = Math.max(0, batteryRef.current - drainAmount);
                
                // Update battery state
                batteryRef.current = newBatteryLevel;
                
                // Update both the local UI state and worker state context
                setLocalStatus(prev => ({
                    ...prev,
                    batteryLevel: newBatteryLevel
                }));
                
                // Synchronize with worker state context
                updateWorkerState({
                    batteryLevel: newBatteryLevel,
                    position: {
                        x: workerPosition[0],
                        y: workerPosition[1],
                        z: workerPosition[2]
                    }
                });
                
                // If battery is depleted, go to recharge station
                if (newBatteryLevel <= 0) {
                    setIsWorkerWalking(false);
                    setIsRecharging(true);
                    setLocalStatus(prev => ({
                        ...prev,
                        status: 'recharging',
                        currentTask: 'Moving to recharge station'
                    }));
                }
                
                // Log battery level for debugging
                console.log('Battery level:', newBatteryLevel);
            }
        }, 1000); // Update every second for more visible changes
        
        return () => clearInterval(batteryInterval);
    }, [isWorkerWalking, isRecharging, isTerminated, updateWorkerState, workerPosition]);

    // Move to recharge station when battery is depleted
    useEffect(() => {
        if (!isRecharging || isWorkerWalking || isTerminated) return;
        
        // Start a movement animation to the recharge station
        const moveToRechargeInterval = setInterval(() => {
            // Current position
            const [x, y, z] = workerPosition;
            
            // Target position (recharge station)
            const [targetX, , targetZ] = RECHARGE_STATION_POSITION;
            
            // Calculate direction vector
            const dirX = targetX - x;
            const dirZ = targetZ - z;
            
            // Distance to target
            const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);
            
            // If we're close enough to the recharge station, stop moving
            if (distance < 0.5) {
                clearInterval(moveToRechargeInterval);
                // Start recharging
                setLocalStatus(prev => ({
                    ...prev,
                    currentTask: 'Recharging'
                }));
                return;
            }
            
            // Normalize direction
            const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
            const normDirX = dirX / length;
            const normDirZ = dirZ / length;
            
            // Move a step towards the recharge station
            const stepSize = 0.2;
            const newX = x + normDirX * stepSize;
            const newZ = z + normDirZ * stepSize;
            
            // Update position
            setWorkerPosition([newX, y, newZ]);
            
            // Update direction for the model to face
            setWorkerDirection([normDirX, 0, normDirZ]);
            
        }, 16); // Update at 60fps for smooth movement
        
        return () => clearInterval(moveToRechargeInterval);
    }, [isRecharging, isWorkerWalking, isTerminated, workerPosition]);

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
                    
                    // Update position in worker state
                    updateWorkerState({
                        position: {
                            x: positionRef.x,
                            y: 0,
                            z: positionRef.z
                        }
                    });
                    
                    // If we've gone far enough (well past the edge), clean up
                    const distanceFromCenter = Math.sqrt(positionRef.x * positionRef.x + positionRef.z * positionRef.z);
                    if (distanceFromCenter > PLOT_SIZE * 0.75) {
                        // Worker is gone!
                        clearInterval(runInterval);
                    }
                }, 16);
                
                return () => clearInterval(runInterval);
            } 
            // Normal walking with random targets
            else {
                // Initialize target if needed
                if (walkTargetRef.current.timeToChange <= 0) {
                    walkTargetRef.current = {
                        x: Math.random() * PLOT_SIZE/2 - PLOT_SIZE/4,
                        z: Math.random() * PLOT_SIZE/2 - PLOT_SIZE/4,
                        timeToChange: 200 // frames until we pick a new random target
                    };
                }
                
                // Start the animation with random targets
                const walkInterval = setInterval(() => {
                    // Update time to change target
                    walkTargetRef.current.timeToChange--;
                    
                    // If it's time to change target or we're close to the current target, pick a new random target
                    const distToTarget = Math.sqrt(
                        Math.pow(workerPosition[0] - walkTargetRef.current.x, 2) + 
                        Math.pow(workerPosition[2] - walkTargetRef.current.z, 2)
                    );
                    
                    if (walkTargetRef.current.timeToChange <= 0 || distToTarget < 0.5) {
                        // Pick a new random position within the plot boundaries
                        // Keep trying until we find a position far enough from the recharge station
                        let validTarget = false;
                        let attempts = 0;
                        let newTargetX = 0, newTargetZ = 0, distToStation = 0;
                        
                        while (!validTarget && attempts < 10) {
                            newTargetX = Math.random() * (PLOT_SIZE - 4) - (PLOT_SIZE/2 - 2);
                            newTargetZ = Math.random() * (PLOT_SIZE - 4) - (PLOT_SIZE/2 - 2);
                            
                            // Check distance to recharge station
                            distToStation = Math.sqrt(
                                Math.pow(newTargetX - RECHARGE_STATION_POSITION[0], 2) + 
                                Math.pow(newTargetZ - RECHARGE_STATION_POSITION[2], 2)
                            );
                            
                            // Only accept targets with sufficient distance from recharge station
                            if (distToStation > RECHARGE_STATION_RADIUS * 1.2) {
                                validTarget = true;
                            }
                            attempts++;
                        }
                        
                        // Update target (use the last attempt if we couldn't find a valid one)
                        walkTargetRef.current = {
                            x: newTargetX,
                            z: newTargetZ,
                            timeToChange: 150 + Math.floor(Math.random() * 100) // Random duration
                        };
                    }
                    
                    // Calculate direction to current target
                    const prevX = workerPosition[0];
                    const prevZ = workerPosition[2];
                    const targetX = walkTargetRef.current.x;
                    const targetZ = walkTargetRef.current.z;
                    
                    // Direction vector to target
                    const moveX = targetX - prevX;
                    const moveZ = targetZ - prevZ;
                    const moveDist = Math.sqrt(moveX * moveX + moveZ * moveZ);
                    
                    // Use constant speed for more consistent movement
                    const stepSize = 0.05;
                    
                    // Calculate new position toward target
                    let newX = prevX;
                    let newZ = prevZ;
                    
                    if (moveDist > 0.001) {
                        // Target direction vector
                        const targetDirX = moveX / moveDist;
                        const targetDirZ = moveZ / moveDist;
                        
                        // Smoothly interpolate direction (lerp)
                        const turnSpeed = 0.05; // How fast to turn (0-1)
                        directionRef.current.x += (targetDirX - directionRef.current.x) * turnSpeed;
                        directionRef.current.z += (targetDirZ - directionRef.current.z) * turnSpeed;
                        
                        // Normalize the interpolated direction
                        const currentDirLength = Math.sqrt(
                            directionRef.current.x * directionRef.current.x + 
                            directionRef.current.z * directionRef.current.z
                        );
                        
                        // Avoid division by zero
                        if (currentDirLength > 0.001) {
                            directionRef.current.x /= currentDirLength;
                            directionRef.current.z /= currentDirLength;
                        }
                        
                        // Use the smoothed direction for movement
                        const smoothDirX = directionRef.current.x;
                        const smoothDirZ = directionRef.current.z;
                        
                        // Calculate new position using the smoothed direction
                        newX = prevX + smoothDirX * stepSize;
                        newZ = prevZ + smoothDirZ * stepSize;
                        
                        // Check distance to recharge station
                        const stationX = RECHARGE_STATION_POSITION[0];
                        const stationZ = RECHARGE_STATION_POSITION[2];
                        const dxStation = newX - stationX;
                        const dzStation = newZ - stationZ;
                        const distanceToStation = Math.sqrt(dxStation * dxStation + dzStation * dzStation);
                        
                        // If too close to the recharge station, adjust path to avoid it
                        if (distanceToStation < RECHARGE_STATION_RADIUS) {
                            // Calculate normal vector from station to worker (direction to push away)
                            const nx = dxStation / distanceToStation;
                            const nz = dzStation / distanceToStation;
                            
                            // Push away from station by adjusting position
                            const pushFactor = (RECHARGE_STATION_RADIUS - distanceToStation) * 1.5;
                            newX = newX + nx * pushFactor;
                            newZ = newZ + nz * pushFactor;
                            
                            // If we had to push away from station, possibly pick a new target
                            // to prevent getting stuck in a loop
                            if (Math.random() < 0.1) { // 10% chance to pick new target
                                walkTargetRef.current.timeToChange = 0;
                            }
                        }
                        
                        setWorkerPosition([newX, 0, newZ]);
                        setWorkerDirection([smoothDirX, 0, smoothDirZ]);
                    }
                    
                    // Update position in worker state
                    updateWorkerState({
                        position: {
                            x: newX,
                            y: 0,
                            z: newZ
                        }
                    });
                }, 16); // ~60fps for smooth movement
                
                return () => clearInterval(walkInterval);
            }
        }
    }, [isWorkerWalking, isTerminated, workerPosition, workerState, sendMessage, updateWorkerState]);

    const handleVideoStream = useCallback((stream?: MediaStream) => {
        setVideoStream(stream);
    }, []);

    // Status indicator in top-right corner
    const statusIndicator = (
        <div className="absolute top-4 right-4 p-4 bg-black/70 text-white rounded">
            <h3 className="text-lg font-bold mb-2">Worker Status</h3>
            <div>
                <p>ID: worker17</p>
                <p>Status: <span className={`font-bold ${localStatus.status === 'idle' ? 'text-blue-400' : localStatus.status === 'working' ? 'text-green-400' : localStatus.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{localStatus.status}</span></p>
                <p>Battery: <span className={`font-bold ${localStatus.batteryLevel > 50 ? 'text-green-400' : localStatus.batteryLevel > 20 ? 'text-yellow-400' : 'text-red-400'}`}>{localStatus.batteryLevel}%</span></p>
                {localStatus.currentTask && <p>Task: {localStatus.currentTask}</p>}
                <p>Position: [{workerPosition[0].toFixed(1)}, {workerPosition[1].toFixed(1)}, {workerPosition[2].toFixed(1)}]</p>
            </div>
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
                                
                                {/* Recharge Station Rigid Body */}
                                <RigidBody type="fixed" position={[RECHARGE_STATION_POSITION[0], 2, RECHARGE_STATION_POSITION[2]]}>
                                    <CuboidCollider
                                        args={[8, 4, 8]}
                                    />
                                </RigidBody>
                            </Physics>
                            {/* Worker model */}
                            <Worker17 
                                position={workerPosition} 
                                isWalking={isWorkerWalking || isRecharging}
                                direction={workerDirection}
                                isTerminated={isTerminated}
                            />

                            {/* Recharge Station (Bed) model - raised position for better visibility */}
                            <RechargeStation 
                                position={[RECHARGE_STATION_POSITION[0], 0.5, RECHARGE_STATION_POSITION[2]]} 
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