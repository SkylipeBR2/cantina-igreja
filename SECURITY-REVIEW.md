# Revisão de acesso e cadastro de usuários — 15/11/2026

## Entrega

No admin, **Usuários e acessos → Gerenciar usuários** exige a senha da conta administradora atual. Somente `app_metadata.role = admin` pode confirmar, listar, criar ou alterar acessos. Gerentes não recebem essa permissão.

| Perfil novo | Páginas e operações |
| --- | --- |
| Totem | Autoatendimento, catálogo, criação e pagamento de pedidos, acompanhamento por token e avaliação |
| Cantina | Caixa, cozinha, preparo e entrega; sem administração, cancelamento administrativo ou totem |

Os perfis legados admin, manager, cashier e kitchen continuam funcionando. O formulário permite converter contas operacionais para totem/cantina, mas não alterar contas administrativas. Autorizações são verificadas nas APIs; ocultar links é apenas uma melhoria de navegação. O servidor consulta o usuário no Auth, não confia no cargo enviado pelo navegador nem em `user_metadata`.

## Controles implementados

- Confirmação de senha via cliente Supabase isolado; a sessão temporária é encerrada sem substituir a sessão do administrador.
- Autorização assinada com HMAC, duração de cinco minutos, vinculada ao administrador e à sessão. O token fica somente na memória do formulário. Fechar e reabrir exige nova confirmação.
- Campos e papéis permitidos explicitamente selecionados no servidor. Senhas de 12–128 caracteres; confirmação também no formulário.
- Cadastro via Auth Admin API, somente no servidor. Nenhuma senha é retornada, registrada em logs ou gravada em arquivo pela funcionalidade.
- Proteção de origem nas mutações, limite de tentativas e respostas sem cache na gestão de contas.
- Limite de 16 KiB durante a leitura do corpo, inclusive sem Content-Length.
- Paginação da lista e retorno restrito a nome, e-mail, ID e perfil; sem metadados internos do Auth.
- Filtros de data validados e CSV protegido contra fórmulas e quebra de células por conteúdo de nomes.

## SQL injection e banco

Revisadas as chamadas `.from()`/`.rpc()` de `app/api` e `lib/server`, e as migrações versionadas. As consultas usam argumentos do cliente Supabase; não foi encontrada concatenação de entradas do usuário em comandos SQL. O SQL dinâmico das migrações usa identificadores escapados com `%I`. O novo cadastro não adiciona SQL nem modifica o esquema.

As migrações versionadas restringem tabelas e funções públicas a `service_role` e habilitam RLS. **Não foi verificado se essas migrações estão aplicadas no banco remoto**, nem inspecionadas funções remotas ausentes do repositório, como a definição original de `process_order`.

## Verificação

- `node scripts/security-tests.cjs`: 15 verificações aprovadas, incluindo escalada de privilégio, confirmação incorreta, origem externa, adulteração/expiração de token, sessão diferente, matriz de páginas, corpo excessivo e CSV. Executa os handlers reais com Auth/banco simulados; não cria contas reais.
- `npm run typecheck`: aprovado.
- ESLint dos novos componentes, helpers e APIs de usuários: aprovado.
- `npm audit` e `npm audit --omit=dev`: nenhum alerta conhecido nas versões instaladas em 15/11/2026. Isso não prova ausência de vulnerabilidades na aplicação.
- `npm run build`: aprovado após autorizar rede para baixar DM Sans/Fraunces do Google Fonts; compilação, TypeScript e geração das páginas concluídos.

## Limites e operação

- Ainda é necessário validar no ambiente conectado o ciclo completo de confirmação, cadastro, login e mudança de perfil com contas de teste. Nenhum deploy foi feito.
- O limitador existente mantém estado em memória por processo. Em múltiplas instâncias/reinícios, ele não é um limite global; usar armazenamento compartilhado ou controle de borda para proteção distribuída contra força bruta.
- A revisão não é um pentest completo. Configuração remota de Auth, políticas efetivamente aplicadas, revogação de sessões já emitidas e infraestrutura não foram certificadas.
- Não exportar senhas existentes: o Supabase guarda hashes, que não permitem recuperar a senha original. Não foi criado arquivo de senhas fora do projeto. A preferência por um cofre criptografado ou gerenciador de senhas foi solicitada separadamente.
- `email_confirm: true` é intencional para provisionamento interno pelo administrador; o cadastro não comprova posse da caixa de e-mail.

## Referências

- Componente adaptado: [Password Input, UI Layout / 21st.dev](https://21st.dev/@uilayout.contact/components/password-input), com botão acessível para mostrar/ocultar senha.
- [Supabase Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
- [Supabase signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).
- Guias locais da versão instalada do Next.js: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` e `01-app/02-guides/authentication.md`.
