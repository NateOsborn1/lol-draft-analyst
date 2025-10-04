import React from 'react';
import ReactDOM from 'react-dom/client';
// FIX: Explicitly use the file extension in the import path.
import LoLDraftApp from './LoLDraftApp.jsx'; 
import './index.css'; 

// This creates the root and renders your component into the element with id="root"
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(
  <React.StrictMode>
    <LoLDraftApp />
  </React.StrictMode>
);
