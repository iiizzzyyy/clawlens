import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import SessionList from './pages/SessionList';
import Replay from './pages/Replay';
import Analytics from './pages/Analytics';
import Topology from './pages/Topology';

function App() {
  return (
    <BrowserRouter basename="/clawlens">
      <Layout>
        <Routes>
          <Route path="/" element={<SessionList />} />
          <Route path="/replay/:sessionId" element={<Replay />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/topology" element={<Topology />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
