// ============================================================
// World State - mutable state store for the simulation
// No zustand, no context. Just a plain object + subscribers.
// Components call useWorldState() to get a snapshot each frame.
// ============================================================

import {
    type WorldState,
    type WorkerInstance,
    type WorkStation,
    type RechargeStation,
    type Position,
    type SimConfig,
    DEFAULT_SIM_CONFIG,
    PLOT_SIZE,
    CHARACTER_MODELS,
} from './types';

// --- Factory functions ---

let workerIdCounter = 0;

export function createWorker(config: SimConfig): WorkerInstance {
    const id = `worker-${++workerIdCounter}`;
    const modelIndex = (workerIdCounter - 1) % CHARACTER_MODELS.length;
    // Spawn near center with some random spread
    const spawnRadius = 3;
    const angle = Math.random() * Math.PI * 2;
    return {
        id,
        modelIndex,
        position: {
            x: Math.cos(angle) * spawnRadius * Math.random(),
            y: 0,
            z: Math.sin(angle) * spawnRadius * Math.random(),
        },
        direction: { x: 0, y: 0, z: 1 },
        rotation: 0,
        state: 'idle',
        battery: 70 + Math.random() * 30, // start 70-100%
        assignedStationId: null,
        assignedRechargeId: null,
        queuePosition: -1,
        walkSpeed: config.walkSpeed * (0.9 + Math.random() * 0.2), // slight variation
        stateTimer: 0,
    };
}

let stationIdCounter = 0;

export function createWorkStation(
    position: Position,
    type: WorkStation['type'],
    maxWorkers: number,
    totalWork: number,
    respawnTime = 0,
): WorkStation {
    return {
        id: `work-${++stationIdCounter}`,
        position,
        type,
        maxWorkers,
        currentWorkerIds: [],
        workRate: 1,
        totalWork,
        completedWork: 0,
        respawnTime,
        respawnTimer: 0,
        depleted: false,
        batteryDrainMultiplier: type === 'gas' ? 1.5 : type === 'build' ? 0.8 : 1.0,
    };
}

let rechargeIdCounter = 0;

export function createRechargeStation(
    position: Position,
    maxSlots = 1,
    chargeRate = 15,
): RechargeStation {
    // Queue extends in +X direction from station
    return {
        id: `recharge-${++rechargeIdCounter}`,
        position,
        maxSlots,
        chargingWorkerIds: [],
        queue: [],
        chargeRate,
        queueDirection: { x: 1, y: 0, z: 0 },
    };
}

// --- Default world layout ---

function createDefaultWorld(config: SimConfig): WorldState {
    const half = PLOT_SIZE / 2;

    const workers: WorkerInstance[] = [];
    for (let i = 0; i < config.workerCount; i++) {
        workers.push(createWorker(config));
    }

    const workStations: WorkStation[] = [
        // Mineral patches spread around the field
        createWorkStation({ x: half - 3, y: 0, z: half - 3 }, 'mineral', 3, 500, 30),
        createWorkStation({ x: -(half - 3), y: 0, z: half - 3 }, 'mineral', 2, 400, 30),
        createWorkStation({ x: half - 3, y: 0, z: -(half - 3) }, 'mineral', 2, 400, 30),
        // Gas geyser - harder to work, more drain
        createWorkStation({ x: -(half - 5), y: 0, z: 0 }, 'gas', 2, 600, 45),
        // Build site - easy work, many workers
        createWorkStation({ x: 0, y: 0, z: half - 4 }, 'build', 4, 800, 0),
    ];

    const rechargeStations: RechargeStation[] = [
        createRechargeStation({ x: -(half - 2), y: 0, z: -(half - 2) }, 1, config.baseRechargeRate),
    ];

    return {
        workers,
        workStations,
        rechargeStations,
        simSpeed: 1,
        paused: false,
        tickCount: 0,
    };
}

// --- Singleton world state ---

let world: WorldState = createDefaultWorld(DEFAULT_SIM_CONFIG);
let currentConfig: SimConfig = { ...DEFAULT_SIM_CONFIG };

// Subscribers get notified after each simulation tick
type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

export function getWorld(): WorldState {
    return world;
}

export function getConfig(): SimConfig {
    return currentConfig;
}

export function subscribe(fn: Subscriber): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

export function notifySubscribers(): void {
    for (const fn of subscribers) fn();
}

export function resetWorld(config?: Partial<SimConfig>): void {
    workerIdCounter = 0;
    stationIdCounter = 0;
    rechargeIdCounter = 0;
    currentConfig = { ...DEFAULT_SIM_CONFIG, ...config };
    world = createDefaultWorld(currentConfig);
    notifySubscribers();
}

export function updateConfig(partial: Partial<SimConfig>): void {
    currentConfig = { ...currentConfig, ...partial };
}

export function setSimSpeed(speed: number): void {
    world.simSpeed = Math.max(0, Math.min(5, speed));
}

export function setPaused(paused: boolean): void {
    world.paused = paused;
}

// --- Worker management ---

export function addWorker(): WorkerInstance {
    const worker = createWorker(currentConfig);
    world.workers.push(worker);
    notifySubscribers();
    return worker;
}

export function removeWorker(): void {
    if (world.workers.length <= 1) return;
    const removed = world.workers.pop();
    if (!removed) return;

    // Clean up any station references
    for (const ws of world.workStations) {
        ws.currentWorkerIds = ws.currentWorkerIds.filter(id => id !== removed.id);
    }
    for (const rs of world.rechargeStations) {
        rs.chargingWorkerIds = rs.chargingWorkerIds.filter(id => id !== removed.id);
        rs.queue = rs.queue.filter(id => id !== removed.id);
    }
    notifySubscribers();
}
