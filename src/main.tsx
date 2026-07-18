import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const motionOverride = new URLSearchParams(window.location.search).get('motion')
if (motionOverride === 'full' || motionOverride === 'reduced') {
  document.documentElement.dataset.motion = motionOverride
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
