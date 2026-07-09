import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './sklad.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
