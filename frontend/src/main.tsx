// ============================================================
// main.tsx — Punto de entrada de React
// ============================================================
// Este archivo es el primero que se ejecuta en el navegador.
// Monta la aplicación React dentro del <div id="root"> del HTML.
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// createRoot() es la forma moderna de iniciar React 18+.
// BrowserRouter habilita la navegación por URLs sin recargar
// la página (Single Page Application / SPA).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
