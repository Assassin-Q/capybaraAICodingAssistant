import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installClientLogForwarder } from '@/lib/clientLog'

// Installed before the first render so a failure during mount is still recorded. The panel is
// served by the plugin itself, so its own origin is the address to report back to.
installClientLogForwarder(window.location.origin)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
