require('dotenv').config();
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(path.join(__dirname, 'pedidos.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitante TEXT NOT NULL,
    setor TEXT NOT NULL,
    item TEXT NOT NULL,
    quantidade_estoque INTEGER NOT NULL,
    quantidade_pedida INTEGER NOT NULL,
    urgente INTEGER NOT NULL DEFAULT 0,
    preco_sugerido REAL,
    link_produto TEXT,
    fonte_preco TEXT,
    status TEXT NOT NULL DEFAULT 'aberto',
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS setores_credenciados (
    setor TEXT PRIMARY KEY
  );
`);

const SENHA_COMPRADOR = process.env.COMPRADOR_SENHA;

function exigirSenha(req, res, next) {
  if (!SENHA_COMPRADOR) {
    return res.status(500).json({ erro: 'Senha do comprador não configurada no servidor.' });
  }
  if (req.headers['x-senha-comprador'] !== SENHA_COMPRADOR) {
    return res.status(401).json({ erro: 'Senha incorreta ou não informada.' });
  }
  next();
}

app.post('/api/comprador/login', (req, res) => {
  const { senha } = req.body;
  if (!SENHA_COMPRADOR) {
    return res.status(500).json({ erro: 'Senha do comprador não configurada no servidor.' });
  }
  if (senha === SENHA_COMPRADOR) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ erro: 'Senha incorreta.' });
  }
});

function setorEhCredenciado(setor) {
  const row = db.prepare('SELECT 1 FROM setores_credenciados WHERE setor = ?').get(setor.trim());
  return !!row;
}

app.get('/api/setores-credenciados', (req, res) => {
  const rows = db.prepare('SELECT setor FROM setores_credenciados ORDER BY setor').all();
  res.json(rows.map(r => r.setor));
});

app.post('/api/setores-credenciados', (req, res) => {
  const { setor } = req.body;
  if (!setor) return res.status(400).json({ erro: 'Informe o nome do setor.' });
  db.prepare('INSERT OR IGNORE INTO setores_credenciados (setor) VALUES (?)').run(setor.trim());
  res.json({ ok: true });
});

app.delete('/api/setores-credenciados/:setor', (req, res) => {
  db.prepare('DELETE FROM setores_credenciados WHERE setor = ?').run(req.params.setor);
  res.json({ ok: true });
});

app.get('/api/pedidos', exigirSenha, (req, res) => {
  const pedidos = db.prepare('SELECT * FROM pedidos ORDER BY urgente DESC, criado_em DESC').all();
  res.json(pedidos);
});

app.post('/api/pedidos', (req, res) => {
  const { solicitante, setor, item, quantidade_estoque, quantidade_pedida } = req.body;

  if (!solicitante || !setor || !item || quantidade_estoque === undefined || !quantidade_pedida) {
    return res.status(400).json({ erro: 'Preencha solicitante, setor, item, quantidade em estoque e quantidade pedida.' });
  }

  const estoqueBaixo = Number(quantidade_estoque) < Number(quantidade_pedida) * 0.2;
  const urgente = setorEhCredenciado(setor) || estoqueBaixo;

  const info = db.prepare(`
    INSERT INTO pedidos (solicitante, setor, item, quantidade_estoque, quantidade_pedida, urgente)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(solicitante, setor, item, quantidade_estoque, quantidade_pedida, urgente ? 1 : 0);

  const novoPedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(info.lastInsertRowid);
  res.json(novoPedido);
});

app.patch('/api/pedidos/:id/status', exigirSenha, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/pedidos/:id', exigirSenha, (req, res) => {
  db.prepare('DELETE FROM pedidos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/buscar-preco', exigirSenha, async (req, res) => {
  const { item } = req.body;
  if (!item) return res.status(400).json({ erro: 'Informe o nome do item.' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ erro: 'Chave do OpenRouter não configurada no servidor.' });
  }

  try {
    const resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet:online',
        messages: [{
          role: 'user',
          content: `Pesquise no Mercado Livre (mercadolivre.com.br) o menor preço atual para o produto: "${item}". ` +
            `Responda SOMENTE em JSON, sem markdown, sem texto antes ou depois, no formato: ` +
            `{"produto": "nome exato encontrado", "preco": 99.90, "link": "https://...", "loja_ou_vendedor": "nome"}. ` +
            `Se não encontrar nada confiável, responda {"erro": "não encontrado"}.`
        }]
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('OpenRouter respondeu com erro HTTP:', JSON.stringify(dados));
      return res.status(500).json({ erro: 'debug_http_' + resposta.status, detalhe: JSON.stringify(dados).slice(0, 500) });
    }

    const textoResposta = (dados.choices?.[0]?.message?.content || '')
      .replace(/```json|```/g, '')
      .trim();

    let resultado;
    try {
      resultado = JSON.parse(textoResposta);
    } catch (erroParse) {
      console.error('Não consegui interpretar a resposta da IA:', textoResposta);
      return res.json({ erro: 'debug_parse', detalhe: textoResposta.slice(0, 500) });
    }

    if (resultado.erro) {
      resultado.detalhe = textoResposta.slice(0, 500);
    }

    res.json(resultado);
  } catch (erro) {
    console.error('Erro ao buscar preço:', erro);
    res.status(500).json({ erro: 'Falha ao buscar preço. Tente novamente.', detalhe: String(erro) });
  }
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`Sistema de pedidos rodando em http://localhost:${PORTA}`);
});
