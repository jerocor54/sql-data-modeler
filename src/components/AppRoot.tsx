import AppErrorBoundary from './AppErrorBoundary';
import ERDApp from './ERDApp';

export default function AppRoot() {
  return (
    <AppErrorBoundary>
      <ERDApp />
    </AppErrorBoundary>
  );
}
