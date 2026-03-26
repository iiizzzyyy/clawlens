import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Bots from './pages/Bots';
import CronJobs from './pages/CronJobs';
import SessionList from './pages/SessionList';
import Replay from './pages/Replay';
import Analytics from './pages/Analytics';
// Topology page removed from nav — API still available at /clawlens/api/topology

function App() {
  return (
    <BrowserRouter basename="/clawlens">
      <Layout>
        <Routes>
          <Route path="/bots" element={<Bots />} />
          <Route path="/cron" element={<CronJobs />} />
          <Route path="/" element={<SessionList />} />
          <Route path="/replay/:sessionId" element={<Replay />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
