import { useCallback } from 'react';

export interface MovementParams {
    walkStepSize: number;
    rechargeStepSize: number;
    targetDistanceThreshold: number;
    turnSpeed: number;
    stationAvoidanceRadius: number;
    pushFactor: number;
    batteryDischargeMin: number;
    batteryDischargeMax: number;
    batteryRechargeRate: number;
}

export const DEFAULT_PARAMS: MovementParams = {
    walkStepSize: 0.01,
    rechargeStepSize: 0.002,
    targetDistanceThreshold: 0.5,
    turnSpeed: 0.05,
    stationAvoidanceRadius: 2,
    pushFactor: 1.5,
    batteryDischargeMin: 2.5,
    batteryDischargeMax: 3.5,
    batteryRechargeRate: 10,
};

interface WorkerControlsProps {
    params: MovementParams;
    onParamsChange: (params: MovementParams) => void;
}

interface SliderConfig {
    key: keyof MovementParams;
    label: string;
    min: number;
    max: number;
    step: number;
}

const SLIDERS: SliderConfig[] = [
    { key: 'walkStepSize', label: 'Walk Speed', min: 0.001, max: 0.02, step: 0.001 },
    { key: 'rechargeStepSize', label: 'Recharge Speed', min: 0.0005, max: 0.05, step: 0.0005 },
    { key: 'targetDistanceThreshold', label: 'Target Threshold', min: 0.1, max: 2, step: 0.1 },
    { key: 'turnSpeed', label: 'Turn Speed', min: 0.01, max: 0.2, step: 0.01 },
    { key: 'stationAvoidanceRadius', label: 'Avoidance Radius', min: 1, max: 5, step: 0.5 },
    { key: 'pushFactor', label: 'Push Factor', min: 0.5, max: 3, step: 0.5 },
    { key: 'batteryDischargeMin', label: 'Battery Drain Min', min: 0.5, max: 5, step: 0.1 },
    { key: 'batteryDischargeMax', label: 'Battery Drain Max', min: 1, max: 6, step: 0.1 },
    { key: 'batteryRechargeRate', label: 'Recharge Rate', min: 5, max: 20, step: 0.5 },
];

export function WorkerControls({ params, onParamsChange }: WorkerControlsProps) {
    const handleChange = useCallback((key: keyof MovementParams, value: number) => {
        onParamsChange({ ...params, [key]: value });
    }, [params, onParamsChange]);

    const handleReset = useCallback(() => {
        onParamsChange({ ...DEFAULT_PARAMS });
    }, [onParamsChange]);

    const formatValue = (key: keyof MovementParams, value: number): string => {
        if (key === 'batteryDischargeMin' || key === 'batteryDischargeMax' || key === 'batteryRechargeRate') {
            return value.toFixed(1) + '%';
        }
        return value.toFixed(4);
    };

    return (
        <div className="w-[220px] flex flex-col absolute top-[140px] right-4 p-3 bg-black/70 text-white rounded gap-2 z-10">
            <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-bold text-gray-300">Movement Controls</h3>
                <button
                    onClick={handleReset}
                    className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
                >
                    Reset
                </button>
            </div>
            {SLIDERS.map(({ key, label, min, max, step }) => (
                <div key={key} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                        <span className="text-gray-400">{label}</span>
                        <span className="text-cyan-400">{formatValue(key, params[key])}</span>
                    </div>
                    <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={params[key]}
                        onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                </div>
            ))}
        </div>
    );
}
