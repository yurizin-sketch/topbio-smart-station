import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { SessionProvider } from './state/session'
import { AssistantProvider } from './state/assistant'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/kiosk.css'

/**
 * HashRouter e não BrowserRouter: a estação pode acabar a correr a partir de
 * um ficheiro local ou de um servidor sem reescrita de rotas, e o hash
 * funciona em ambos sem configuração de servidor.
 */

const root = document.getElementById('root')
if (!root) throw new Error('#root não encontrado')

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <SessionProvider>
        {/* Dentro do router e da sessão: a Bia precisa de saber em que ecrã
            está e o que o cliente já escolheu para dizer o que quer que seja. */}
        <AssistantProvider>
          <App />
        </AssistantProvider>
      </SessionProvider>
    </HashRouter>
  </StrictMode>,
)
