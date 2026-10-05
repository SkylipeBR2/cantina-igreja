# Roadmap de segurança

## Prioridade 0 — antes de nova operação pública

- Publicar a aplicação em URL HTTPS e configurar o webhook do Mercado Pago em
  `/api/webhook-pagamento`; manter `MERCADOPAGO_WEBHOOK_SECRET` somente no
  servidor.
- Vincular o projeto ao Supabase CLI, aplicar e registrar todas as migrações
  pendentes, incluindo a expiração do Pix e a reconciliação de pagamentos.
- Rotacionar as chaves de serviço e do Mercado Pago se elas já tiverem sido
  usadas fora de ambientes secretos; nunca usar `SUPABASE_SERVICE_ROLE_KEY`
  em código cliente ou logs.
- Remover o acesso direto do navegador a alterações de pedidos, itens e
  estoque. Todas as alterações devem passar por rotas autenticadas no servidor.

## Prioridade 1 — autorização e integridade

- Consolidar papéis (`admin`, `manager`, `cashier`, `kitchen`) em políticas e
  APIs: cozinha só muda preparo; caixa registra pagamento presencial; admin
  gerencia catálogo e relatórios.
- Manter pedidos Pix aprovados imutáveis em valor, itens e método de pagamento.
  Correções devem ser estorno/cancelamento auditável, nunca edição direta.
- Criar APIs transacionais para reservas, vendas presenciais, ajuste de estoque
  e edição de pedido pendente; cada ação deve registrar autor, motivo, antes e
  depois em trilha de auditoria.
- Rever RLS em todas as tabelas `public`, deixando `payments`, reservas de
  estoque, eventos de webhook e auditoria acessíveis apenas ao servidor.

## Prioridade 2 — confiabilidade de pagamentos

- Monitorar webhook: alertar se nenhum evento for recebido, se houver 401/500,
  ou se pagamentos pendentes ultrapassarem alguns minutos.
- Manter reconciliação servidor-servidor para pagamentos pendentes, inclusive
  por agendador para funcionar quando o totem estiver fechado.
- Usar chaves de idempotência em toda criação de cobrança e deduplicação de
  evento por ID/status do provedor.
- Validar sempre referência externa, valor, moeda e status obtidos diretamente
  do Mercado Pago antes de liberar pedido ou movimentar estoque.

## Prioridade 3 — proteção da aplicação

- Adicionar validação de payload (por exemplo, Zod) e limites de tamanho em
  todas as rotas públicas; aplicar rate limit em criação de pedido, consulta de
  status, login e webhooks.
- Configurar cabeçalhos de segurança: CSP, HSTS, `X-Content-Type-Options`,
  `Referrer-Policy` e proteção contra framing.
- Não expor detalhes internos em erros ao cliente; manter logs estruturados com
  IDs de pedido/evento, sem chaves, CPF, token de cartão ou payload sensível.
- Criar testes de integração para: Pix aprovado, webhook repetido, webhook
  atrasado, Pix expirado, cancelamento, estoque insuficiente e autorização por
  papel.

## Prioridade 4 — operação contínua

- Backups e teste periódico de restauração; retenção definida para pedidos e
  logs de auditoria.
- Alertas para estoque negativo, pagamentos aprovados sem pedido na cozinha,
  falhas de reconciliação e aumento de recusas.
- Revisão mensal de dependências, permissões, contas de equipe e chaves.
