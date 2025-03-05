import { useEffect, useRef, useState, type ReactNode } from 'react';

type DimensionsRenderFunction = (dimensions: { width: number; height: number }) => ReactNode;

export interface ContainerDimensionsProps {
    children: DimensionsRenderFunction | ReactNode;
    className?: string;
}

export function ContainerDimensions({ children, className = '' }: ContainerDimensionsProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [observer, setObserver] = useState<ResizeObserver | null>(null);

    useEffect(() => {
        const resizeObserver = new ResizeObserver(entries => {
            if (!entries[0]) return;

            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        });

        setObserver(resizeObserver);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!observer || !containerRef.current) return;

        const element = containerRef.current;
        observer.observe(element);

        return () => {
            observer.unobserve(element);
        };
    }, [observer]);

    const renderContent = () => {
        if (dimensions.width === 0 || dimensions.height === 0) return null;

        if (typeof children === 'function') {
            return children(dimensions);
        }

        return children;
    };

    return (
        <div ref={containerRef} className={className}>
            {renderContent()}
        </div>
    );
}