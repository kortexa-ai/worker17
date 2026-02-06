import { useState, useEffect, useCallback } from 'react';
import {
    getWorld,
    subscribe,
    addWorker,
    removeWorker,
    setSimSpeed,
    setPaused,
    resetWorld,
} from '../simulation/WorldState';
import type { WorldState, WorkerInstance } from '../simulation/types';

function WorkerRow({ worker }: { worker: WorkerInstance }) {
    const batteryColor = worker.battery > 50 ? 'text-green-400' : worker.battery > 20 ? 'text-yellow-400' : 'text-red-400';
    const stateColor =
        worker.state === 'working' ? 'text-green-400' :
        worker.state === 'recharging' ? 'text-cyan-400' :
        worker.state === 'queuing' ? 'text-yellow-400' :
        worker.state === 'headingToRecharge' ? 'text-orange-400' :
        'text-gray-400';

    return (
        <div className="flex items-center gap-2 text-xs py-0.5 border-b border-gray-700/50">
            <span className="w-16 truncate text-gray-300">{worker.id}</span>
            <span className={`w-20 ${stateColor}`}>{worker.state}</span>
            <span className={`w-10 text-right ${batteryColor}`}>{Math.round(worker.battery)}%</span>
        </div>
    );
}

export function SwarmStatusPanel() {
    const [snapshot, setSnapshot] = useState<WorldState>(getWorld());
    const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

    useEffect(() => {
        return subscribe(() => {
            // Shallow copy to trigger re-render
            setSnapshot({ ...getWorld() });
        });
    }, []);

    const handleAddWorker = useCallback(() => addWorker(), []);
    const handleRemoveWorker = useCallback(() => removeWorker(), []);
    const handlePause = useCallback(() => setPaused(!snapshot.paused), [snapshot.paused]);
    const handleReset = useCallback(() => resetWorld(), []);

    const totalWorkers = snapshot.workers.length;
    const workingCount = snapshot.workers.filter(w => w.state === 'working').length;
    const rechargingCount = snapshot.workers.filter(w => w.state === 'recharging' || w.state === 'queuing').length;
    const avgBattery = totalWorkers > 0
        ? Math.round(snapshot.workers.reduce((sum, w) => sum + w.battery, 0) / totalWorkers)
        : 0;

    const activeStations = snapshot.workStations.filter(s => !s.depleted).length;
    const totalStations = snapshot.workStations.length;

    return (
        <div className="w-[260px] flex flex-col absolute top-4 right-4 p-3 bg-black/80 text-white rounded-lg z-10 gap-2 max-h-[90vh] overflow-hidden">
            {/* Header stats */}
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-cyan-400">Swarm Status</h3>
                <span className="text-xs text-gray-400">tick {snapshot.tickCount}</span>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-1 text-xs text-center">
                <div className="bg-gray-800 rounded p-1">
                    <div className="text-green-400 font-bold">{workingCount}</div>
                    <div className="text-gray-500">working</div>
                </div>
                <div className="bg-gray-800 rounded p-1">
                    <div className="text-cyan-400 font-bold">{rechargingCount}</div>
                    <div className="text-gray-500">charging</div>
                </div>
                <div className="bg-gray-800 rounded p-1">
                    <div className={`font-bold ${avgBattery > 50 ? 'text-green-400' : avgBattery > 20 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {avgBattery}%
                    </div>
                    <div className="text-gray-500">avg bat</div>
                </div>
            </div>

            {/* Stations info */}
            <div className="text-xs text-gray-400">
                Stations: {activeStations}/{totalStations} active
            </div>

            {/* Worker list */}
            <div className="flex flex-col overflow-y-auto max-h-[200px] gap-0">
                {snapshot.workers.map(w => (
                    <div
                        key={w.id}
                        onClick={() => setSelectedWorkerId(w.id === selectedWorkerId ? null : w.id)}
                        className={`cursor-pointer hover:bg-gray-700/50 px-1 rounded ${w.id === selectedWorkerId ? 'bg-gray-700/50' : ''}`}
                    >
                        <WorkerRow worker={w} />
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="flex gap-1 pt-1 border-t border-gray-700">
                <button
                    onClick={handlePause}
                    className="flex-1 text-xs px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                    {snapshot.paused ? 'Play' : 'Pause'}
                </button>
                <button
                    onClick={handleAddWorker}
                    className="text-xs px-2 py-1.5 bg-green-800 hover:bg-green-700 rounded transition-colors"
                    title="Add worker"
                >
                    +
                </button>
                <button
                    onClick={handleRemoveWorker}
                    className="text-xs px-2 py-1.5 bg-red-800 hover:bg-red-700 rounded transition-colors"
                    title="Remove worker"
                >
                    -
                </button>
                <button
                    onClick={handleReset}
                    className="text-xs px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                    Reset
                </button>
            </div>

            {/* Speed control */}
            <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">Speed:</span>
                <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.25}
                    value={snapshot.simSpeed}
                    onChange={(e) => setSimSpeed(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-cyan-400 w-8">{snapshot.simSpeed.toFixed(1)}x</span>
            </div>
        </div>
    );
}
