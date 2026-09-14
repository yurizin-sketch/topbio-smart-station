import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { SessionProvider } from './state/session'
import { AssistantProvider } from './state/assistant'
import { ativarModoQuiosque } from './services/kiosk'
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

// Pôr o tablet a portar-se como quiosque: ecrã sempre aceso, sem menu de toque
// longo nem zoom. O cadeado a sério — não deixar fechar a app — é no aparelho
// (Android: fixar ecrã / Fully Kiosk; iPad: Acesso Guiado). Ver services/kiosk.ts.
ativarModoQuiosque()

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <SessionProvider>
        {/* Dentro do router e da sessão: a Cláudia precisa de saber em que ecrã
            está e o que o cliente já escolheu para dizer o que quer que seja. */}
        <AssistantProvider>
          <App />
        </AssistantProvider>
      </SessionProvider>
    </HashRouter>
  </StrictMode>,
)
