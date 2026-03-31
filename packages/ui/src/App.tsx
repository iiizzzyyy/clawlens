import { Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Bots from './pages/Bots';
import CronJobs from './pages/CronJobs';
import SessionList from './pages/SessionList';
import Replay from './pages/Replay';
import Analytics from './pages/Analytics';
import Flow from './pages/Flow';
import Memory from './pages/Memory';
import Logs from './pages/Logs';
// Topology page removed from nav — API still available at /clawlens/api/topology

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error }: { error: Error | null; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <h2 className="text-xl font-semibold text-red-400 mb-2">Something went wrong</h2>
      <p className="text-slate-400 mb-4 max-w-md">{error?.message || 'An unexpected error occurred'}</p>
      <div className="flex gap-3">
        <button
          onClick={() => { window.location.href = '/clawlens/'; }}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
        >
          Go Home
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter basename="/clawlens">
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/bots" element={<Bots />} />
            <Route path="/cron" element={<CronJobs />} />
            <Route path="/" element={<SessionList />} />
            <Route path="/sessions" element={<SessionList />} />
            <Route path="/replay/:sessionId" element={<Replay />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/flow" element={<Flow />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
