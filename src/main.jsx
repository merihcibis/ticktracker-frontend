import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // ✅ this is crucial for Tailwind to work

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
