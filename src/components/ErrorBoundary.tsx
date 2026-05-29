import React from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Catches render-time errors anywhere below it so a single component crash shows a
 * recovery screen instead of a blank white page for the whole app. Errors in event
 * handlers / async code are not caught by React error boundaries — those are handled
 * by the global error listeners in App.tsx (chunk-load recovery).
 */
class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, info);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-color, #09090b)', color: '#fff', padding: '1rem', textAlign: 'center'
                }}>
                    <div style={{ maxWidth: '420px', width: '100%' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: '0.75rem' }}>Възникна грешка</h1>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '2rem', lineHeight: 1.5 }}>
                            Нещо се обърка при зареждането на тази секция. Опитайте да презаредите.
                        </p>
                        <button
                            onClick={this.handleReload}
                            style={{
                                padding: '0.9rem 2rem', background: 'var(--primary-color, #00ADB5)', color: '#fff',
                                borderRadius: '50px', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: 'pointer'
                            }}
                        >
                            Презареди
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
