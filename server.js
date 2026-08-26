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

  CREATE TABLE IF NOT EXISTS setores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    uf TEXT NOT NULL,
    cidade TEXT,
    lat REAL,
    lng REAL,
    credenciado INTEGER NOT NULL DEFAULT 0
  );
`);

const CAPITAIS = {
  AC: [-9.9750, -67.8243], AL: [-9.6498, -35.7089], AP: [0.0349, -51.0694],
  AM: [-3.1190, -60.0217], BA: [-12.9714, -38.5014], CE: [-3.7172, -38.5433],
  DF: [-15.7939, -47.8828], ES: [-20.3155, -40.3128], GO: [-16.6869, -49.2648],
  MA: [-2.5307, -44.3068], MT: [-15.6014, -56.0979], MS: [-20.4697, -54.6201],
  MG: [-19.9167, -43.9345], PA: [-1.4558, -48.4902], PB: [-7.1195, -34.8450],
  PR: [-25.4284, -49.2733], PE: [-8.0476, -34.8770], PI: [-5.0892, -42.8019],
  RJ: [-22.9068, -43.1729], RN: [-5.7945, -35.2110], RS: [-30.0346, -51.2177],
  RO: [-8.7619, -63.9039], RR: [2.8235, -60.6758], SC: [-27.5954, -48.5480],
  SP: [-23.5505, -46.6333], SE: [-10.9472, -37.0731], TO: [-10.1689, -48.3317]
};

async function geocodificarCidade(cidade, uf) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(uf)}&country=Brazil&format=json&limit=1`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'sistema-pedidos-app/1.0 (contato@exemplo.com)',
        'Accept-Language': 'pt-BR'
      }
    });

    if (!resp.ok) {
      return { erro: 'http_' + resp.status };
    }

    const dados = await resp.json();
    if (dados && dados.length > 0) {
      return { coordenadas: [Number(dados[0].lat), Number(dados[0].lon)] };
    }
    return { erro: 'cidade_nao_encontrada' };
  } catch (erro) {
    return { erro: 'excecao_' + String(erro) };
  }
}

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

app.get('/api/setores', (req, res) => {
  const rows = db.prepare('SELECT nome, uf, cidade, credenciado FROM setores ORDER BY nome').all();
  res.json(rows);
});

app.post('/api/setores', exigirSenha, async (req, res) => {
  const { nome, uf, cidade, credenciado } = req.body;
  if (!nome || !uf) return res.status(400).json({ erro: 'Informe nome e estado (UF) do setor.' });
  const ufMaiuscula = uf.toUpperCase();
  if (!CAPITAIS[ufMaiuscula]) return res.status(400).json({ erro: 'Estado (UF) inválido.' });

  let coordenadas = CAPITAIS[ufMaiuscula];
  let debugGeocode = 'usou_capital_padrao';

  if (cidade && cidade.trim()) {
    const resultado = await geocodificarCidade(cidade.trim(), ufMaiuscula);
    if (resultado.coordenadas) {
      coordenadas = resultado.coordenadas;
      debugGeocode = 'encontrou_cidade';
    } else {
      debugGeocode = 'falhou_geocode_' + resultado.erro;
    }
  }

  db.prepare(`
    INSERT INTO setores (nome, uf, cidade, lat, lng, credenciado) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(nome) DO UPDATE SET uf = excluded.uf, cidade = excluded.cidade, lat = excluded.lat, lng = excluded.lng, credenciado = excluded.credenciado
  `).run(nome.trim(), ufMaiuscula, cidade ? cidade.trim() : null, coordenadas[0], coordenadas[1], credenciado ? 1 : 0);

  res.json({ ok: true, debug: debugGeocode, lat: coordenadas[0], lng: coordenadas[1] });
});

app.delete('/api/setores/:nome', exigirSenha, (req, res) => {
  db.prepare('DELETE FROM setores WHERE nome = ?').run(req.params.nome);
  res.json({ ok: true });
});

function setorEhCredenciado(nomeSetor) {
  const row = db.prepare('SELECT credenciado FROM setores WHERE nome = ?').get(nomeSetor.trim());
  return !!(row && row.credenciado);
}

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

app.post('/api/pedidos/:id/buscar-preco', exigirSenha, async (req, res) => {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

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
          content: `Pesquise no Mercado Livre (mercadolivre.com.br) o menor preço atual para o produto: "${pedido.item}". ` +
            `Responda SOMENTE em JSON, sem markdown, sem texto antes ou depois, no formato: ` +
            `{"produto": "nome exato encontrado", "preco": 99.90, "link": "https://...", "loja_ou_vendedor": "nome"}. ` +
            `Se não encontrar nada confiável, responda {"erro": "não encontrado"}.`
        }]
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return res.status(500).json({ erro: 'debug_http_' + resposta.status, detalhe: JSON.stringify(dados).slice(0, 500) });
    }

    const textoResposta = (dados.choices?.[0]?.message?.content || '')
      .replace(/```json|```/g, '')
      .trim();

    let resultado;
    try {
      resultado = JSON.parse(textoResposta);
    } catch (erroParse) {
      return res.json({ erro: 'debug_parse', detalhe: textoResposta.slice(0, 500) });
    }

    if (resultado.erro) {
      resultado.detalhe = textoResposta.slice(0, 500);
      return res.json(resultado);
    }

    db.prepare(`
      UPDATE pedidos SET preco_sugerido = ?, link_produto = ?, fonte_preco = ?
      WHERE id = ?
    `).run(resultado.preco, resultado.link, resultado.loja_ou_vendedor || null, req.params.id);

    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: 'Falha ao buscar preço. Tente novamente.', detalhe: String(erro) });
  }
});

app.post('/api/pedidos/:id/preco-manual', exigirSenha, (req, res) => {
  const { preco, link } = req.body;
  if (!preco || isNaN(Number(preco))) {
    return res.status(400).json({ erro: 'Informe um preço válido.' });
  }

  db.prepare(`
    UPDATE pedidos SET preco_sugerido = ?, link_produto = ?, fonte_preco = 'manual'
    WHERE id = ?
  `).run(Number(preco), link || null, req.params.id);

  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
  res.json(pedido);
});

app.get('/api/mapa', exigirSenha, (req, res) => {
  const mes = req.query.mes;

  const linhas = mes
    ? db.prepare(`
        SELECT setor, SUM(preco_sugerido) as total, COUNT(*) as qtd
        FROM pedidos
        WHERE status = 'comprado' AND preco_sugerido IS NOT NULL AND strftime('%Y-%m', criado_em) = ?
        GROUP BY setor
      `).all(mes)
    : db.prepare(`
        SELECT setor, SUM(preco_sugerido) as total, COUNT(*) as qtd
        FROM pedidos
        WHERE status = 'comprado' AND preco_sugerido IS NOT NULL
        GROUP BY setor
      `).all();

  const setoresInfo = db.prepare('SELECT nome, uf, cidade, lat, lng FROM setores').all();
  const infoPorSetor = {};
  setoresInfo.forEach(s => { infoPorSetor[s.nome] = s; });

  const porLocal = {};
  linhas.forEach(l => {
    const info = infoPorSetor[l.setor];
    if (!info || info.lat === null) return;
    const chave = `${info.lat},${info.lng}`;
    if (!porLocal[chave]) {
      porLocal[chave] = { uf: info.uf, cidade: info.cidade, lat: info.lat, lng: info.lng, total: 0, qtd: 0 };
    }
    porLocal[chave].total += l.total;
    porLocal[chave].qtd += l.qtd;
  });

  res.json(Object.values(porLocal));
});

app.get('/api/gastos-mensais', exigirSenha, (req, res) => {
  const linhas = db.prepare(`
    SELECT strftime('%Y-%m', criado_em) as mes, SUM(preco_sugerido) as total
    FROM pedidos
    WHERE status = 'comprado' AND preco_sugerido IS NOT NULL
    GROUP BY mes
    ORDER BY mes DESC
  `).all();
  res.json(linhas);
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`Sistema de pedidos rodando em http://localhost:${PORTA}`);
});
