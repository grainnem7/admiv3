import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
// Design system CSS is imported in App.tsx via './design-system/index'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
