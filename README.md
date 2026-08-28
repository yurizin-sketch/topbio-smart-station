# TopBio Smart Station

Quiosque de recomendação e compra assistida para a porta da loja: o cliente
escolhe um objetivo, recebe sugestões, paga por MB WAY ou ao balcão, e o
produto sai na máquina.

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

O percurso do cliente está completo, mas **os pagamentos e o hardware são
simulados**. Falta, para ir para produção:

- integração real com a SIBS (MB WAY) e o backend que recebe o webhook;
- escolher a máquina e escrever o adaptador (`src/services/dispenser.ts` já
  define o contrato);
- tirar as encomendas do `localStorage` — hoje o `/staff` só vê os pedidos
  feitos no mesmo browser.

O PIN do balcão está em `src/config.ts` e viaja no pacote do browser. Serve
para demonstrar, não para proteger.

## Regenerar dados

```bash
node scripts/build-catalog.mjs        # src/data/catalog.seed.ts
node scripts/build-product-images.mjs # public/products/*.webp
```

Ambos são ficheiros gerados — editar o script, nunca o resultado.
