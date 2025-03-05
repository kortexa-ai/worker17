import { useEffect } from 'react';

export function SafeViewport({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const setViewHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        setViewHeight();
        window.addEventListener('resize', setViewHeight);
        window.addEventListener('orientationchange', setViewHeight);

        return () => {
            window.removeEventListener('resize', setViewHeight);
            window.removeEventListener('orientationchange', setViewHeight);
        };
    }, []);

    return (
        <div
            className="fixed inset-0 flex flex-col"
            style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
        >
            {children}
        </div>
    );
};
