import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import PublicLanding from './pages/PublicLanding';
import Admin from './pages/Admin';
import Users from './pages/Users';
import Dashboard from './pages/Dashboard';
import Compare from './pages/Compare';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLanding />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/users" element={<Users />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}