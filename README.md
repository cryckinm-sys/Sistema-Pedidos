# Sistema de Pedidos

Sistema para cadastrar pedidos de compra, marcar urgência automaticamente
e buscar o melhor preço no Mercado Livre usando IA.

## Como funciona a urgência
- Setor credenciado → sempre urgente
- Estoque abaixo de 20% da quantidade pedida → urgente

## Variáveis de ambiente necessárias
- ANTHROPIC_API_KEY — chave da API da Anthropic, usada para buscar preços
- PORT — porta do servidor (opcional, padrão 3000)
