import { Navigate, Route, Routes } from 'react-router-dom'
import { Attract } from './screens/Attract'
import { Goals } from './screens/Goals'
import { Recommendations } from './screens/Recommendations'
import { Catalog } from './screens/Catalog'
import { ProductDetail } from './screens/Product'
import { Payment } from './screens/Payment'
import { MbWay } from './screens/MbWay'
import { Ticket } from './screens/Ticket'
import { Success } from './screens/Success'
import { Staff } from './screens/Staff'
import { useIdleReset } from './state/useIdleReset'

export function App() {
  useIdleReset()

  return (
    <Routes>
      <Route path="/kiosk" element={<Attract />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="/recommendations" element={<Recommendations />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/product/:id" element={<ProductDetail />} />
      <Route path="/checkout" element={<Payment />} />
      <Route path="/checkout/mbway" element={<MbWay />} />
      <Route path="/checkout/ticket" element={<Ticket />} />
      <Route path="/success" element={<Success />} />
      {/* Fora do fluxo do cliente: é o painel de quem está ao balcão. */}
      <Route path="/staff" element={<Staff />} />
      {/* Qualquer rota desconhecida cai no repouso, nunca num 404. */}
      <Route path="*" element={<Navigate to="/kiosk" replace />} />
    </Routes>
  )
}
