import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('SQL Data Modeler runtime error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-root" style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="panel-card" style={{ maxWidth: 760, width: '100%', padding: 18, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="#f87171" />
              <strong>Se produjo un error en la interfaz</strong>
            </div>

            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
              Podés recargar la aplicación. Si vuelve a pasar, compartí este mensaje para diagnosticarlo rápido.
            </p>

            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
              }}
            >
              {this.state.message || 'Error inesperado en tiempo de ejecución.'}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                <RotateCcw size={14} /> Recargar app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
