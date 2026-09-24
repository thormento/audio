# Facebook Pro - Extensão Unificada

Combina **Facebook Session Assistant** (gerenciar sessões) com **Cookie Azul** (automação de criação de páginas) em uma única extensão.

## O que faz

### 1. **Sessões** 🏠
- Gerenciar tempo de navegação no Facebook com cronômetros sorteados
- Pausas entre atividades (Feed, Reels, Mensagens, etc)
- Sistema de metas e histórico de sessões
- Gamificação com níveis, badges e XP

### 2. **Criar Páginas** 📄
- Automação para criar múltiplas páginas do Facebook
- Nomes aleatórios ou lista de arquivo (`nomes.txt`)
- Controle total - inicia, para, acompanha progresso

## Estrutura

```
ext-unified/
├── manifest.json          # Configuração v2.0.0
├── popup.html/js          # Painel com abas
├── background.js          # Service worker
├── content.js             # Overlay e scroll do FB
├── page-automation.js     # Automação de páginas
├── options.html/js        # Página de opções
├── utils/                 # Módulos ES6
│   ├── page-creator.js   # API de criação de páginas
│   ├── session.js        # Lógica de sessão
│   ├── storage.js        # Storage local
│   └── ...
└── icons/                 # Icons 16/48/128
```

## Como usar

### 1. Carregar a extensão (Dev)
1. Abra `chrome://extensions/`
2. Ative "Modo do desenvolvedor"
3. Clique em "Carregar extensão não compactada"
4. Selecione a pasta `ext-unified/`

### 2. Usar Sessões
- Clique no ícone da extensão
- Aba "Sessões": escolha atividades e tempo
- Comece: a extensão cronometra tudo

### 3. Criar Páginas
- Clique no ícone da extensão
- Aba "Criar Páginas": defina quantidade
- Opção: usar `nomes.txt` ou gerar aleatoriamente
- Clique "COMEÇAR": abre facebook.com/pages/creation/ e inicia automação

## Variáveis de ambiente (se precisar customizar)

Nenhuma necessária. Tudo é configurável via painel.

## Recursos principais

✅ Sessões com cronômetros variáveis
✅ Automação de criação de páginas  
✅ Histórico local (JSON)
✅ Gamificação (XP, badges, streaks)
✅ Repetição automática de sessões
✅ Interface responsiva

---

**Versão**: 2.0.0  
**Tipo**: Chrome Extension Manifest V3
