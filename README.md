# TopBio Smart Station

Estação de recomendação e compra assistida — um tablet dentro da loja. O
cliente escolhe um objetivo, recebe sugestões e sai com um código que troca
pelo produto no balcão. **Paga-se sempre na loja**, a uma pessoa: nem a
estação cobra, nem entrega.

**Demonstração:** publicada por GitHub Pages a cada envio para a `main`.

## Correr localmente

```bash
npm install
npm run dev
```

Abre em <http://localhost:5173>. Os ecrãs vivem atrás do `#`:

| Ecrã | Endereço |
| --- | --- |
| Quiosque | `#/kiosk` |
| Balcão | `#/staff` |

## Estado

O percurso do cliente está completo e não há pagamento nenhum a fingir: a
estação emite um código e é o balcão que cobra. «Pago» só se escreve em
`/staff`, com PIN, e o funcionário diz como recebeu — dinheiro, MB WAY ou
cartão.

Falta, para ir para produção:

- tirar as encomendas do `localStorage` — hoje o `/staff` só vê os pedidos
  feitos no mesmo browser, e a matriz não vê nada;
- ligar impressora, se o comprovante passar a sair em papel. O bloco já está
  isolado no componente `Receipt` e há um `@media print` a limpar o resto da
  página — falta só decidir o modelo e disparar a impressão.

O PIN do balcão está em `src/config.ts` e viaja no pacote do browser. Serve
para demonstrar, não para proteger.

## Regenerar dados

```bash
node scripts/build-catalog.mjs        # src/data/catalog.seed.ts
node scripts/build-product-images.mjs # public/products/*.webp
```

Ambos são ficheiros gerados — editar o script, nunca o resultado.
