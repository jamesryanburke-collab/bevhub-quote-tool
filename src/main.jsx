import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import WorkspaceGate from './workspace/WorkspaceGate.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WorkspaceGate><App /></WorkspaceGate>
  </React.StrictMode>,
)
