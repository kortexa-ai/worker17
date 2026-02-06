// ============================================================
// Swarm Simulation Types
// ============================================================

export const PLOT_SIZE = 20;
export const BATTERY_LOW_THRESHOLD = 15;
export const QUEUE_SPACING = 1.2;

// --- Position ---

export interface Position {
    x: number;
    y: number;
    z: number;
}

// --- Worker ---

export type WorkerState =
    | 'idle'              // just spawned or between tasks
    | 'seeking'           // looking for a work station
    | 'traveling'         // walking to assigned work station
    | 'working'           // at a station, doing work
    | 'headingToRecharge' // battery low, walking to charger
    | 'queuing'           // waiting in line at recharge station
    | 'recharging'        // on the charger, battery filling
    | 'returningToWork';  // charged up, heading back

export interface WorkerInstance {
    id: string;
    modelIndex: number;           // which character model to use (0-7)
    position: Position;
    direction: Position;
    rotation: number;
    state: WorkerState;
    battery: number;              // 0-100
    assignedStationId: string | null;
    assignedRechargeId: string | null;
    queuePosition: number;        // index in recharge queue (-1 if not queuing)
    walkSpeed: number;
    stateTimer: number;           // general-purpose timer for state transitions
}

// --- Work Station ---

export type WorkStationType = 'mineral' | 'gas' | 'build';

export interface WorkStation {
    id: string;
    position: Position;
    type: WorkStationType;
    maxWorkers: number;            // how many can work simultaneously
    currentWorkerIds: string[];    // IDs of workers currently working here
    workRate: number;              // progress per worker per second
    totalWork: number;             // total work units to complete
    completedWork: number;         // progress so far
    respawnTime: number;           // seconds to respawn after depletion (0 = no respawn)
    respawnTimer: number;          // countdown to respawn
    depleted: boolean;
    batteryDrainMultiplier: number; // some tasks drain faster
}

// --- Recharge Station ---

export interface RechargeStation {
    id: string;
    position: Position;
    maxSlots: number;              // how many can charge at once
    chargingWorkerIds: string[];   // workers currently charging
    queue: string[];               // worker IDs waiting in line
    chargeRate: number;            // battery % per second per slot
    queueDirection: Position;      // direction the queue extends
}

// --- World State ---

export interface WorldState {
    workers: WorkerInstance[];
    workStations: WorkStation[];
    rechargeStations: RechargeStation[];
    simSpeed: number;              // 0.5 - 3.0 multiplier
    paused: boolean;
    tickCount: number;
}

// --- Simulation Config ---

export interface SimConfig {
    workerCount: number;
    walkSpeed: number;
    batteryCapacity: number;
    lowBatteryThreshold: number;
    baseRechargeRate: number;
    baseDrainRate: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
    workerCount: 5,
    walkSpeed: 0.5,
    batteryCapacity: 100,
    lowBatteryThreshold: BATTERY_LOW_THRESHOLD,
    baseRechargeRate: 7.5,
    baseDrainRate: 3,
};

// --- Character Models ---

export const CHARACTER_MODELS = [
    'character-male-a',
    'character-male-b',
    'character-male-c',
    'character-male-d',
    'character-female-a',
    'character-female-b',
    'character-female-c',
    'character-female-d',
] as const;

// Animation name mapping for Kenney models
export const KENNEY_ANIMATIONS = {
    idle: 'idle',
    walk: 'walk',
    sprint: 'sprint',
    work: 'pick-up',       // "mining" animation
    sit: 'sit',            // queuing/waiting
    die: 'die',            // depleted battery
    interact: 'interact-right',
    crouch: 'crouch',
    jump: 'jump',
    yes: 'emote-yes',      // task complete celebration
} as const;
