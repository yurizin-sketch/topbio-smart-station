import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Frame } from '../components/ui'
import { formatPrice } from '../config'
import { apiEnabled } from '../services/api'
import { getCatalog } from '../services/catalog'
import {
  explainMatriz,
  matrizLogin,
  overview,
  type MatrizSession,
  type Overview,
} from '../services/matriz'
import { PAYMENT_LABELS, type PaymentMethod, type Product } from '../types'

/**
 * O ecrã do armazém.
 *
 * O balcão pergunta «este código é válido?». Aqui pergunta-se outra coisa:
 * «onde é que isto foi vendido, e ainda lá há?». São as duas perguntas que a
 * matriz faz e que nenhum tablet de loja sabe responder, porque cada um só
 * conhece as suas próprias vendas.
 *
 * Não é para viver num tablet de loja. É para se abrir num portátil no
 * armazém, por isso a tabela pode ser larga e não há aqui botões de dedo.
 */

/** Janelas de tempo. Dias, porque é assim que se fala de vendas. */
const PERIODOS = [
  { dias: 1, label: 'Hoje' },
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
] as const

export function Matriz() {
  const [session, setSession] = useState<MatrizSession | null>(null)
  const [password, setPassword] = useState('')
  const [dias, setDias] = useState<number>(30)
  const [dados, setDados] = useState<Overview | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // O catálogo dá nome aos produtos. O servidor só manda o id, e "omega3" não
  // é o que está escrito na prateleira de quem vai buscar a caixa.
  const [produtos, setProdutos] = useState<Product[]>([])
  useEffect(() => getCatalog().subscribe(setProdutos), [])
  const nomeProduto = useCallback(
    (id: string) => produtos.find((p) => p.id === id)?.name ?? id,
    [produtos],
  )

  const carregar = useCallback(
    async (s: MatrizSession, janela: number) => {
      setOcupado(true)
      setErro(null)
      try {
        setDados(await overview(s, janela))
      } catch (e) {
        setErro(explainMatriz(e))
      } finally {
        setOcupado(false)
      }
    },
    [],
  )

  // Trocar de período recarrega. Só depois de haver sessão, claro.
  useEffect(() => {
    if (session) void carregar(session, dias)
  }, [session, dias, carregar])

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setErro(null)
    try {
      setSession(await matrizLogin(password))
      setPassword('')
    } catch (err) {
      setErro(explainMatriz(err))
      setOcupado(false)
    }
  }

  // O nome da loja, não o id. Um mapa feito uma vez serve as três tabelas.
  const nomePosto = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of dados?.stations ?? []) m.set(p.id, p.name)
    return (id: string) => m.get(id) ?? id
  }, [dados])

  const totalCents = useMemo(
    () => (dados?.porPosto ?? []).reduce((s, p) => s + p.totalCents, 0),
    [dados],
  )
  const totalVendas = useMemo(
    () => (dados?.porPosto ?? []).reduce((s, p) => s + p.vendas, 0),
    [dados],
  )

  if (!apiEnabled()) {
    return (
      <Frame dark>
        <p className="eyebrow">Armazém</p>
        <h1 className="display">Matriz</h1>
        <p className="subtitle">
          Este ecrã vive do servidor: mostra as vendas de todas as lojas, e
          nenhum tablet sozinho as conhece. Sem servidor configurado não há nada
          para mostrar aqui.
        </p>
      </Frame>
    )
  }

  if (!session) {
    return (
      <Frame dark>
        <p className="eyebrow">Acesso reservado</p>
        <h1 className="display">Matriz</h1>
        <p className="subtitle">
          Vendas e stock de todas as lojas. Escreva a palavra-passe do armazém.
        </p>
        <form className="staff__login" onSubmit={entrar}>
          <label className="staff__field">
            <span>Palavra-passe</span>
            <input
              className="staff__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {erro && <p className="staff__feedback staff__feedback--warn">{erro}</p>}
          <Button type="submit" disabled={ocupado || !password}>
            {ocupado ? 'A entrar…' : 'Entrar'}
          </Button>
        </form>
      </Frame>
    )
  }

  return (
    <Frame
      dark
      actions={
        <Button variant="ghost" onClick={() => void carregar(session, dias)}>
          {ocupado ? 'A carregar…' : 'Actualizar'}
        </Button>
      }
    >
      <p className="eyebrow">Armazém</p>
      <h1 className="display">Matriz</h1>

      <div className="matriz__periodos" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button
            key={p.dias}
            type="button"
            className={
              p.dias === dias
                ? 'matriz__periodo matriz__periodo--activo'
                : 'matriz__periodo'
            }
            onClick={() => setDias(p.dias)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {erro && <p className="staff__feedback staff__feedback--warn">{erro}</p>}

      {dados && (
        <>
          <p className="matriz__total">
            <strong>{formatPrice(totalCents)}</strong> em {totalVendas}{' '}
            {totalVendas === 1 ? 'venda' : 'vendas'}, somando as lojas todas.
          </p>

          <Tabela
            titulo="Por loja"
            vazio="Nenhuma loja vendeu neste período."
            colunas={['Loja', 'Vendas', 'Total']}
            linhas={dados.porPosto.map((p) => [
              nomePosto(p.stationId),
              String(p.vendas),
              formatPrice(p.totalCents),
            ])}
          />

          <Tabela
            titulo="Por produto e loja"
            vazio="Sem vendas por produto neste período."
            colunas={['Loja', 'Produto', 'Vendas', 'Total']}
            linhas={dados.porProduto.map((p) => [
              nomePosto(p.stationId),
              nomeProduto(p.productId),
              String(p.vendas),
              formatPrice(p.totalCents),
            ])}
          />

          <Tabela
            titulo="Como o dinheiro entrou"
            vazio="Sem pagamentos registados neste período."
            colunas={['Método', 'Vendas', 'Total']}
            linhas={dados.porMetodo.map((m) => [
              PAYMENT_LABELS[m.method as PaymentMethod] ?? m.method,
              String(m.vendas),
              formatPrice(m.totalCents),
            ])}
          />

          {/*
            O stock não tem período: é o que lá está agora. Fica em último de
            propósito — quem abre isto vem quase sempre pelas vendas, e só
            desce até aqui quando já sabe qual a loja que lhe interessa.
          */}
          <Tabela
            titulo="Stock por loja"
            vazio="Nenhuma loja está a contar stock."
            colunas={['Loja', 'Produto', 'Unidades']}
            linhas={dados.stock.map((s) => [
              nomePosto(s.stationId),
              nomeProduto(s.productId),
              String(s.qty),
            ])}
          />

          <p className="matriz__nota">
            Conta só o que foi mesmo pago. Códigos emitidos e nunca levantados
            não entram — se entrassem, o mapa dizia que a loja facturou o que
            não facturou.
          </p>
        </>
      )}
    </Frame>
  )
}

/**
 * Uma tabela e o seu vazio.
 *
 * O vazio importa tanto como as linhas: uma tabela em branco deixa quem está a
 * conferir sem saber se não houve vendas ou se isto se partiu. Dizê-lo por
 * extenso custa uma linha e evita um telefonema.
 */
function Tabela({
  titulo,
  colunas,
  linhas,
  vazio,
}: {
  titulo: string
  colunas: string[]
  linhas: string[][]
  vazio: string
}) {
  return (
    <section className="matriz__seccao">
      <h2 className="matriz__titulo">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="matriz__vazio">{vazio}</p>
      ) : (
        <table className="matriz__tabela">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={i}>
                {linha.map((celula, j) => (
                  <td key={j}>{celula}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
