import AppErrorBoundary from './AppErrorBoundary';
import ERDApp from './ERDApp';

interface AppRootProps {
  mode?: 'app' | 'benchmark';
}

export default function AppRoot({ mode = 'app' }: AppRootProps) {
  return (
    <AppErrorBoundary>
      <ERDApp mode={mode} />
    </AppErrorBoundary>
  );
}
