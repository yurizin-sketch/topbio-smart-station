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

As encomendas já não ficam presas ao tablet. O quiosque escreve primeiro em
casa — é o que lhe permite vender com a internet em baixo — e espelha para o D1
assim que houver rede. O `/staff` vê a fila de toda a loja, não só a deste
browser, e o que ficar por enviar sai sozinho quando a ligação voltar.

Falta, para ir para produção:

- o ecrã da matriz. O `/api/matriz/overview` responde com as vendas por posto,
  por produto e por meio de pagamento, mas não há nada que o mostre;
- stock a sério no quiosque: o catálogo ainda traz um `inStore` fixo, sem olhar
  para o que o `/api/stock/list` sabe da prateleira;
- gravar os sete clips da Cláudia (ver `docs/claudia-video.md`);
- ligar impressora, se o comprovante passar a sair em papel. O bloco já está
  isolado no componente `Receipt` e há um `@media print` a limpar o resto da
  página — falta só decidir o modelo e disparar a impressão.

O PIN do `src/config.ts` deixou de ser o do balcão. Com servidor configurado
quem valida é o worker, contra o resumo guardado na tabela `stations`, e o que
volta é uma sessão assinada que dura um turno. Aquele valor no ficheiro só abre
a demonstração publicada, onde não há base de dados nenhuma por trás — e viaja
no pacote do browser, por isso não protege nada.

## Regenerar dados

```bash
node scripts/build-catalog.mjs        # src/data/catalog.seed.ts
node scripts/build-product-images.mjs # public/products/*.webp
```

Ambos são ficheiros gerados — editar o script, nunca o resultado.
