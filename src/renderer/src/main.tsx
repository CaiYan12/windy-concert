// T4.0：设计 tokens 唯一源（docs/design/tokens.css 的复制落位），须在业务样式前引入。
import './styles/tokens.css'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
