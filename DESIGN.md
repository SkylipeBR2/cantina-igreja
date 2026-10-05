---
name: Cantina PIB
description: Sistema contemporâneo e acolhedor para pedidos, pagamentos e operação da cantina.
colors:
  primary: "#2563eb"
  primary-soft: "#eaf2ff"
  primary-light: "#60a5fa"
  jade: "#159f96"
  navy-deep: "#07111f"
  surface: "#fffefb"
  canvas: "#fafaf6"
  text-strong: "#26364d"
  text-muted: "#66778e"
  border: "#dce4ed"
  success: "#159f74"
  warning: "#d99722"
  danger: "#d84c56"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.05em"
rounded:
  control: "12px"
  card: "16px"
  surface: "24px"
spacing:
  compact: "8px"
  control: "12px"
  standard: "16px"
  section: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px 24px"
  card-default:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "24px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
---

# Design System: Cantina PIB

## Overview

**Creative North Star: "Cantina Contemporânea"**

O sistema combina a clareza de uma ferramenta operacional com o acolhimento de uma comunidade local. Telas de equipe usam uma base clara, azul de confiança e informação organizada em cartões; o totem amplia a atmosfera com azul-marinho e acentos luminosos, mantendo o fluxo de compra simples para qualquer membro.

A profundidade é plana e organizada: separação vem de fundos tonais, bordas suaves e hierarquia de espaço, não de sombras pesadas. Componentes devem transmitir leveza acolhedora, com linguagem direta, alvos de toque generosos e confirmação visual inequívoca.

**Key Characteristics:**
- Azul confiável como sinal de ação e progresso.
- Superfícies claras, arejadas e arredondadas para operação interna.
- Totem escuro, imersivo e legível para autoatendimento.
- Hierarquia forte, sem ruído visual.

## Colors

A paleta separa ação, estado e contexto: azul conduz tarefas, neutros sustentam leitura e cores semânticas comunicam o estado do pedido.

### Primary
- **Azul de Confiança:** usado em ações principais, navegação ativa e progresso; deve concentrar a atenção interativa.
- **Azul Bruma:** fundo suave de estados ativos e ações secundárias.

### Neutral
- **Papel Claro:** superfícies principais de caixa, cozinha e administração.
- **Névoa Operacional:** fundo de páginas e blocos secundários.
- **Grafite de Leitura:** títulos e valores importantes.
- **Cinza de Apoio:** textos auxiliares, rótulos e metadados.

### Named Rules
**The Blue Means Action Rule.** Azul saturado identifica uma ação, estado ativo ou progresso; não deve preencher grandes áreas internas sem propósito.

## Typography

**Display Font:** Fraunces (com fallback Georgia)
**Body Font:** DM Sans (com fallback sans-serif)

**Character:** títulos com calor editorial em Fraunces e dados operacionais muito legíveis em DM Sans. Pesos fortes organizam tickets, totais e títulos sem precisar de ornamento.

### Hierarchy
- **Display** (800, 1.875rem, 1.2): títulos de páginas e etapas do totem.
- **Title** (700–900, 1.25–1.5rem): títulos de cartões e seções.
- **Body** (500–600, 1rem, 1.5): instruções e conteúdo operacional.
- **Label** (700, 0.75rem, 0.05em): filtros, estados e metadados curtos.

## Layout

As telas internas usam páginas com respiro de 16–32px, grades responsivas e cartões em blocos claros. A área de caixa usa uma composição de conteúdo + carrinho lateral; a cozinha prioriza cartões repetíveis; o totem concentra uma tarefa por etapa e mantém controles grandes.

## Elevation & Depth

O sistema é plano por padrão. Bordas claras e diferenças sutis entre `canvas`, superfície e fundo suave determinam grupos. Sombras pequenas aparecem apenas em navegação fixa, modais e estados de interação, nunca como decoração contínua.

### Named Rules
**The Quiet Surface Rule.** Um cartão em repouso deve se separar por borda e contraste tonal antes de usar sombra.

## Shapes

Controles têm cantos suavemente arredondados (12px), cartões usam 16–24px e badges adotam formato de pílula. Bordas são finas, claras e funcionais; formas circulares ficam reservadas para ícones, contadores e estados.

## Components

### Buttons
- **Shape:** arredondados e confortáveis (12–16px).
- **Primary:** azul sólido, texto branco e peso alto; destinado à próxima ação clara.
- **Hover / Focus:** variação discreta de fundo, sem animações longas; foco precisa permanecer visível.
- **Secondary:** fundo azul suave ou branco com borda, para ações de menor prioridade.

### Cards / Containers
- **Corner Style:** arredondamento generoso (16–24px).
- **Background:** branco em operações; transparências azuladas no totem.
- **Border:** contorno suave em cinza-azulado.
- **Internal Padding:** 16–24px conforme densidade da informação.

### Inputs / Fields
- **Style:** fundo branco, borda de 2px e ícone opcional alinhado à esquerda.
- **Focus:** a borda passa para azul de confiança.
- **Error / Disabled:** vermelho suave para erro; cinza de baixo contraste para indisponibilidade.

### Navigation
- **Style:** barra branca translúcida com fundo desfocado e seleção em pílula azul suave.

## Do's and Don'ts

### Do:
- **Do** usar azul forte apenas para a ação principal e estados ativos.
- **Do** manter títulos, totais e números de ticket em peso alto para leitura rápida.
- **Do** dar ao totem áreas de toque generosas e uma etapa por decisão.
- **Do** usar estados semânticos consistentes: verde para concluído, âmbar para atenção e vermelho para erro.

### Don't:
- **Don't** transformar painéis operacionais em superfícies escuras; o tema escuro é específico do totem.
- **Don't** depender apenas da cor para indicar pagamento, atraso ou erro.
- **Don't** empilhar sombras pesadas em cartões comuns.
- **Don't** usar azul de ação para conteúdo meramente decorativo.
