import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Promotor from "./pages/Promotor"; // 👈 P mayúscula
import './global.css';
import Admin from './pages/Admin';
import Users from './pages/Users';
import Dashboard from './pages/Dashboard';
import Compare from "./pages/Compare";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/promotor" element={<Promotor />} />
		<Route path="/admin" element={<Admin />} />  
		<Route path="/admin/users" element={<Users />} />
		<Route path="/admin/dashboard" element={<Dashboard />} />
		<Route path="/admin/compare" element={<Compare />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
