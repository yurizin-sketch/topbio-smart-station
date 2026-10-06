import { Navigate, Route, Routes } from 'react-router-dom'
import { Attract } from './screens/Attract'
import { Goals } from './screens/Goals'
import { Recommendations } from './screens/Recommendations'
import { Catalog } from './screens/Catalog'
import { ProductDetail } from './screens/Product'
import { Ticket } from './screens/Ticket'
import { Invoice } from './screens/Invoice'
import { Pay } from './screens/Pay'
import { Success } from './screens/Success'
import { Staff } from './screens/Staff'
import { Matriz } from './screens/Matriz'
import { Assistant } from './components/Assistant'
import { useIdleReset } from './state/useIdleReset'

export function App() {
  useIdleReset()

  return (
    <>
      <Routes>
        <Route path="/kiosk" element={<Attract />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        {/* Comprar: o QR do MB WAY e, depois de pago, a fatura. Sem pagamento no
            tablet (sem a chave da Stripe no servidor), o QR segue sozinho
            para a ficha do balcão, e paga-se lá como sempre. */}
        <Route path="/checkout" element={<Navigate to="/checkout/pay" replace />} />
        <Route path="/checkout/pay" element={<Pay />} />
        <Route path="/checkout/fatura" element={<Invoice />} />
        <Route path="/checkout/ticket" element={<Ticket />} />
        <Route path="/success" element={<Success />} />
        {/* Fora do fluxo do cliente: é o painel de quem está ao balcão. */}
        <Route path="/staff" element={<Staff />} />
        <Route path="/matriz" element={<Matriz />} />
        {/* Qualquer rota desconhecida cai no repouso, nunca num 404. */}
          <Route path="*" element={<Navigate to="/kiosk" replace />} />
      </Routes>

      {/* Fora das rotas de propósito: a Cláudia tem de sobreviver à navegação. Se
          vivesse dentro de cada ecrã, calava-se e recomeçava a cada toque. */}
      <Assistant />
    </>
  )
}
