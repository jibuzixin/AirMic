import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AirmicProvider } from '@/lib/airmic-store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AirmicProvider>
      <App />
    </AirmicProvider>
  </StrictMode>,
)
