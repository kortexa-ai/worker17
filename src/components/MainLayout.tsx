import { Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { SafeViewport } from './SafeViewport';
import { ContainerDimensions } from './ContainerDimensions';
import { Camera } from './Camera';
import { ThreeContainer, type ThreeContainerRef } from './ThreeContainer';
import { Environment, OrbitControls, Box } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Worker17 } from './Worker17';
import { RechargeStation } from './RechargeStation';
import { UserButton } from './UserButton';
import { WorkerStatusPanel, type WorkerStatus, type WorkerPosition } from './WorkerStatusPanel';

const PLOT_SIZE = 20;
const RECHARGE_STATION_POSITION = {x: -(PLOT_SIZE / 2 - 6), y: 0, z: -(PLOT_SIZE / 2 - 6)}; // Opposite corner, more inward for the larger bed
const RECHARGE_STATION_RADIUS = 2; // Radius to avoid during normal walking

export function MainLayout() {
    const [, setVideoStream] = useState<MediaStream>();
    const [isWorkerWalking, setIsWorkerWalking] = useState(false);
    const [workerPosition, setWorkerPosition] = useState<WorkerPosition>({x: 0, y: 0, z: 0});
    const [workerDirection, setWorkerDirection] = useState<WorkerPosition>({x: 0, y: 0, z: 1});
    const lastAngle = useRef(0);

    // Reference to the Three.js container for screenshots
    const threeContainerRef = useRef<ThreeContainerRef>(null);

    // Function to capture the current scene as an image
    // const captureWorkerImage = useCallback(() => {
    //     if (threeContainerRef.current) {
    //         return threeContainerRef.current.captureScreenshot();
    //     }
    //     return '';
    // }, []);

    // We handle the camera image request in the useEffect below

    // Local state for UI display
    const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({
        batteryLevel: 100,
        status: 'idle',
        currentTask: undefined
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
    const directionRef = useRef<WorkerPosition>({x: 0, y: 0, z: 1});

    // Toggle walking state periodically for demonstration (unless terminated or recharging)
    useEffect(() => {
        // Don't toggle walking if the worker is terminated or recharging
        if (isRecharging) return;

        const interval = setInterval(() => {
            const newWalkingState = !isWorkerWalking;
            setIsWorkerWalking(newWalkingState);

            // Update status in the UI
            setWorkerStatus(prev => ({
                ...prev,
                status: newWalkingState ? 'working' : 'idle'
            }));
        }, 8000); // Toggle every 8 seconds to allow more battery drain

        return () => clearInterval(interval);
    }, [isRecharging, isWorkerWalking]);

    // Periodically drain battery while walking or recharge when at station
    useEffect(() => {
        const batteryInterval = setInterval(() => {
            // Recharging mode
            if (isRecharging && !isWorkerWalking) {
                // Increase battery by 8-12% per second
                const chargeAmount = Math.floor(Math.random() * 5) + 8;
                const newBatteryLevel = Math.min(100, batteryRef.current + chargeAmount);

                // Update battery state
                batteryRef.current = newBatteryLevel;

                // Update local UI state
                setWorkerStatus(prev => ({
                    ...prev,
                    batteryLevel: newBatteryLevel,
                    currentTask: 'Recharging'
                }));

                // If fully charged, allow walking again
                if (newBatteryLevel >= 100) {
                    setIsRecharging(false);
                    setWorkerStatus(prev => ({
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
                setWorkerStatus(prev => ({
                    ...prev,
                    batteryLevel: newBatteryLevel
                }));

                // If battery is depleted, go to recharge station
                if (newBatteryLevel <= 0) {
                    setIsRecharging(true);
                    setWorkerStatus(prev => ({
                        ...prev,
                        status: 'recharging',
                        currentTask: 'Recharging'
                    }));
                }

                // Log battery level for debugging
                console.log('Battery level:', newBatteryLevel);
            }
        }, 1000); // Update every second for more visible changes

        return () => clearInterval(batteryInterval);
    }, [isWorkerWalking, isRecharging, workerPosition]);

    // Move to recharge station when battery is depleted
    useEffect(() => {
        if (!isRecharging || isWorkerWalking) return;

        // Start a movement animation to the recharge station
        const moveToRechargeInterval = setInterval(() => {
            // Current position
            const {x, y, z} = workerPosition;

            // Target position (recharge station)
            const {x: targetX, z: targetZ} = RECHARGE_STATION_POSITION;

            // Calculate direction vector
            const dirX = targetX - x;
            const dirZ = targetZ - z;

            // Distance to target
            const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);

            // If we're close enough to the recharge station, stop moving
            if (distance < 0.5) {
                clearInterval(moveToRechargeInterval);
                // Start recharging
                setWorkerStatus(prev => ({
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
            setWorkerPosition({x: newX, y, z: newZ});

            // Update direction for the model to face
            setWorkerDirection({x: normDirX, y: 0, z: normDirZ});

        }, 16); // Update at 60fps for smooth movement

        return () => clearInterval(moveToRechargeInterval);
    }, [isRecharging, isWorkerWalking, workerPosition]);

    // Update worker position when walking or terminated
    useEffect(() => {
        let moveInterval: NodeJS.Timeout;

        if (isWorkerWalking) {
            // When starting to walk, initialize angle based on current position

            // Get the current position to calculate initial angle
            const {x, z} = workerPosition;

            const isTerminated = false;
            // Different animation paths for normal walking vs termination
            if (isTerminated) {
                // For termination - run straight off the edge of the plate

                // Calculate a random edge direction if we're at the origin
                if (x === 0 && z === 0) {
                    // Random angle between 0 and 2π
                    const randomAngle = Math.random() * Math.PI * 2;
                    // Set initial direction toward edge
                    setWorkerDirection({x: Math.cos(randomAngle), y: 0, z: Math.sin(randomAngle)});
                    lastAngle.current = randomAngle;
                } else {
                    // Already away from origin, use current position to determine direction
                    lastAngle.current = Math.atan2(z, x);
                    // Point directly away from center
                    setWorkerDirection({x: Math.cos(lastAngle.current), y: 0, z: Math.sin(lastAngle.current)});
                }

                // Reference to track the animation
                const positionRef = { x, y: 0, z };
                const speedRef = { value: 0.05 }; // Initial speed
                const maxSpeed = 0.3; // Maximum run speed

                // Run away animation - accelerate toward the edge
                moveInterval = setInterval(() => {
                    // Accelerate
                    speedRef.value = Math.min(speedRef.value * 1.05, maxSpeed);

                    // Update position in the current direction
                    positionRef.x += Math.cos(lastAngle.current) * speedRef.value;
                    positionRef.z += Math.sin(lastAngle.current) * speedRef.value;

                    // Set the new position
                    setWorkerPosition({x: positionRef.x, y: 0, z: positionRef.z});

                    // If we've gone far enough (well past the edge), clean up
                    const distanceFromCenter = Math.sqrt(positionRef.x * positionRef.x + positionRef.z * positionRef.z);
                    if (distanceFromCenter > PLOT_SIZE * 0.75) {
                        // Worker is gone!
                        clearInterval(moveInterval);
                    }
                }, 16);
            } else {
                // Normal walking with random targets

                // Initialize target if needed
                if (walkTargetRef.current.timeToChange <= 0) {
                    walkTargetRef.current = {
                        x: Math.random() * PLOT_SIZE / 2 - PLOT_SIZE / 4,
                        z: Math.random() * PLOT_SIZE / 2 - PLOT_SIZE / 4,
                        timeToChange: 200 // frames until we pick a new random target
                    };
                }

                // Start the animation with random targets
                moveInterval = setInterval(() => {
                    // Update time to change target
                    walkTargetRef.current.timeToChange--;

                    // If it's time to change target or we're close to the current target, pick a new random target
                    const distToTarget = Math.sqrt(
                        Math.pow(workerPosition.x - walkTargetRef.current.x, 2) +
                        Math.pow(workerPosition.z - walkTargetRef.current.z, 2)
                    );

                    if (walkTargetRef.current.timeToChange <= 0 || distToTarget < 0.5) {
                        // Pick a new random position within the plot boundaries
                        // Keep trying until we find a position far enough from the recharge station
                        let validTarget = false;
                        let attempts = 0;
                        let newTargetX = 0, newTargetZ = 0, distToStation = 0;

                        while (!validTarget && attempts < 10) {
                            newTargetX = Math.random() * (PLOT_SIZE - 4) - (PLOT_SIZE / 2 - 2);
                            newTargetZ = Math.random() * (PLOT_SIZE - 4) - (PLOT_SIZE / 2 - 2);

                            // Check distance to recharge station
                            distToStation = Math.sqrt(
                                Math.pow(newTargetX - RECHARGE_STATION_POSITION.x, 2) +
                                Math.pow(newTargetZ - RECHARGE_STATION_POSITION.z, 2)
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
                    const prevX = workerPosition.x;
                    const prevZ = workerPosition.z;
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
                        const stationX = RECHARGE_STATION_POSITION.x;
                        const stationZ = RECHARGE_STATION_POSITION.z;
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

                        setWorkerPosition({x: newX, y: 0, z: newZ});
                        setWorkerDirection({x: smoothDirX, y: 0, z: smoothDirZ});
                    }
                }, 16); // ~60fps for smooth movement
            }
        }

        return () => clearInterval(moveInterval);
    }, [isWorkerWalking, workerPosition]);

    const handleVideoStream = useCallback((stream?: MediaStream) => {
        setVideoStream(stream);
    }, []);

    // Status indicator in top-right corner
    return (
        <SafeViewport>
            <UserButton />
            <Camera onStreamChange={handleVideoStream} />
            <WorkerStatusPanel status={workerStatus} position={workerPosition}/>
            <ContainerDimensions className="w-full h-full flex-1 min-h-0">
                {({ width, height }) => (
                    <ThreeContainer
                        ref={threeContainerRef}
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
                                <RigidBody type="fixed" position={[RECHARGE_STATION_POSITION.x, 2, RECHARGE_STATION_POSITION.z]}>
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
                                isTerminated={false}
                            />

                            {/* Recharge Station (Bed) model - raised position for better visibility */}
                            <RechargeStation
                                position={[RECHARGE_STATION_POSITION.x, 0.5, RECHARGE_STATION_POSITION.z]}
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