export interface WorkerPosition {
    x: number;
    y: number;
    z: number;
}

export type WorkerStatusType = 'idle' | 'working' | 'error' | 'offline' | 'recharging';

export interface WorkerStatus {
    status: WorkerStatusType;
    batteryLevel: number;
    currentTask: string | undefined;
}

interface WorkerStatusProps {
    status: WorkerStatus;
    position: WorkerPosition;
}

export function WorkerStatusPanel({ status, position }: WorkerStatusProps) {
    return (
        <div className="w-[220px] h-[120px] flex flex-col absolute top-4 right-4 p-4 bg-black/70 text-white rounded">
            <div className="w-full h-full flex flex-col justify-center">
                <p>ID: worker17</p>
                <p>Status: <span className={`font-bold ${status.status === 'idle' ? 'text-blue-400' : status.status === 'working' ? 'text-green-400' : status.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{status.status}</span></p>
                <p>Battery: <span className={`font-bold ${status.batteryLevel > 50 ? 'text-green-400' : status.batteryLevel > 20 ? 'text-yellow-400' : 'text-red-400'}`}>{status.batteryLevel}%</span></p>
                {status.currentTask && <p>Task: {status.currentTask}</p>}
                <p>Position: [{position.x.toFixed(1)}, {position.y.toFixed(1)}, {position.z.toFixed(1)}]</p>
            </div>
        </div>
    );
}