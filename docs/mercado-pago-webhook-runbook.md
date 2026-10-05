# Mercado Pago: configuração e operação

Configure em **Suas integrações → Webhooks** a URL HTTPS pública:

`https://SEU-DOMINIO/api/webhook-pagamento`

Selecione o tópico **Order** e copie a chave secreta gerada para `MERCADOPAGO_WEBHOOK_SECRET`. Nunca a exponha em uma variável `NEXT_PUBLIC_`.

Variáveis obrigatórias no servidor:

- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Para um totem com adquirente físico, configure também `MERCADOPAGO_POINT_TERMINAL_ID` e envie uma Order com `type: "point"`, `config.point.terminal_id` e uma `external_reference` igual ao ID interno do pedido. O terminal não confirma o pedido: aguarde sempre a notificação assinada e a reconciliação server-to-server.

## Papéis da equipe

As rotas de operação leem somente `app_metadata.role` do usuário autenticado; nunca use `user_metadata` para autorização. Papéis aceitos: `admin`, `manager`, `cashier` e `kitchen`. Configure-os pelo Admin API do Supabase antes de liberar a equipe. `admin` e `manager` podem cancelar apenas pedidos não pagos; pedidos aprovados exigem fluxo de estorno no gateway.

O endpoint rejeita uma assinatura inválida com 401. Para uma assinatura válida, consulta novamente a Order no Mercado Pago e compara a referência externa e o valor antes de alterar o pedido. Eventos repetidos são reconhecidos pela tabela `payment_webhook_events` e não movimentam estoque nem reenfileiram a cozinha.

## Incidente

- Webhook com 401: confirme a chave secreta e a URL configurada no painel do Mercado Pago.
- Webhook com 500: consulte `payment_webhook_events`, `payments` e os logs da aplicação; o Mercado Pago reenviará notificações que não recebem 200.
- Pedido pago não aparece na cozinha: confira a publicação `supabase_realtime`, a política RLS da equipe e se `orders.status = 'paid'` e `payment_status = 'approved'`.
