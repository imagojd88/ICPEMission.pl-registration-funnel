import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App'
import { initAnalytics } from './lib/analytics'

// PostHog bez cookies — tylko publiczne strony; bez klucza nic nie robi.
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
