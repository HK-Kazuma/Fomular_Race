import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
