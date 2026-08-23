let senhaComprador = null;

document.getElementById('form-pedido').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const corpo = {
    solicitante: document.getElementById('solicitante').value.trim(),
    setor: document.getElementById('setor').value.trim(),
    item: document.getElementById('item').value.trim(),
    quantidade_estoque: Number(document.getElementById('quantidade_estoque').value),
    quantidade_pedida: Number(document.getElementById('quantidade_pedida').value)
  };

  const resp = await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });

  if (!resp.ok) {
    const erro = await resp.json();
    alert(erro.erro || 'Erro ao criar pedido.');
    return;
  }

  document.getElementById('form-pedido').reset();
  alert('Pedido criado com sucesso!');
});

document.getElementById('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const senha = document.getElementById('senha-comprador').value;
  const erroLogin = document.getElementById('erro-login');

  const resp = await fetch('/api/comprador/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha })
  });

  if (!resp.ok) {
    erroLogin.hidden = false;
    return;
  }

  erroLogin.hidden = true;
  senhaComprador = senha;

  document.getElementById('login-secao').hidden = true;
  document.getElementById('area-comprador').hidden = false;
  document.getElementById('pedidos-secao').hidden = false;

  carregarSetores();
  carregarPedidos();
});

document.getElementById('form-setor').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const campo = document.getElementById('novo-setor');
  const setor = campo.value.trim();
  if (!setor) return;

  await fetch('/api/setores-credenciados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setor })
  });

  campo.value = '';
  carregarSetores();
});

async function carregarSetores() {
  const resp = await fetch('/api/setores-credenciados');
  const setores = await resp.json();
  const lista = document.getElementById('lista-setores');

  lista.innerHTML = setores.length
    ? setores.map(s => `
        <li>
          ${s}
          <button data-setor="${s}" class="remover-setor" title="Remover">×</button>
        </li>
      `).join('')
    : '<span class="vazio">Nenhum setor credenciado ainda.</span>';

  document.querySelectorAll('.remover-setor').forEach(botao => {
    botao.addEventListener('click', async () => {
      await fetch(`/api/setores-credenciados/${encodeURIComponent(botao.dataset.setor)}`, {
        method: 'DELETE',
        headers: { 'x-senha-comprador': senhaComprador }
      });
      carregarSetores();
    });
  });
}

async function carregarPedidos() {
  const resp = await fetch('/api/pedidos', {
    headers: { 'x-senha-comprador': senhaComprador }
  });

  if (!resp.ok) {
    document.getElementById('lista-pedidos').innerHTML = '<p class="vazio">Não foi possível carregar os pedidos.</p>';
    return;
  }

  const pedidos = await resp.json();
  const lista = document.getElementById('lista-pedidos');

  if (!pedidos.length) {
    lista.innerHTML = '<p class="vazio">Nenhum pedido cadastrado ainda.</p>';
    return;
  }

  lista.innerHTML = pedidos.map(p => `
    <div class="pedido ${p.urgente ? 'urgente' : ''}">
      <div class="pedido-info">
        <strong>${p.item} — ${p.quantidade_pedida} un.</strong>
        <span>${p.solicitante} · Setor: ${p.setor} · Estoque: ${p.quantidade_estoque}</span>
        <span>Status: ${p.status}</span>
        ${p.urgente ? '<span class="selo-urgente">URGENTE</span>' : ''}
      </div>
      ${p.preco_sugerido ? `
        <div class="preco-info">
          Melhor preço encontrado: R$ ${Number(p.preco_sugerido).toFixed(2)}
          ${p.link_produto ? `<br><a href="${p.link_produto}" target="_blank" rel="noopener">Ver no Mercado Livre</a>` : ''}
        </div>
      ` : `<div class="preco-info-vazio" data-id="${p.id}"></div>`}
      <div class="pedido-acoes">
        ${!p.preco_sugerido ? `<button class="btn-buscar-preco-pedido" data-id="${p.id}">Buscar preço</button>` : ''}
        ${p.status !== 'comprado' ? `<button class="btn-comprado" data-id="${p.id}">Marcar comprado</button>` : ''}
        <button class="btn-excluir" data-id="${p.id}">Excluir</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.btn-comprado').forEach(botao => {
    botao.addEventListener('click', async () => {
      await fetch(`/api/pedidos/${botao.dataset.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-senha-comprador': senhaComprador
        },
        body: JSON.stringify({ status: 'comprado' })
      });
      carregarPedidos();
    });
  });

  document.querySelectorAll('.btn-excluir').forEach(botao => {
    botao.addEventListener('click', async () => {
      if (!confirm('Tem certeza que quer excluir este pedido?')) return;
      await fetch(`/api/pedidos/${botao.dataset.id}`, {
        method: 'DELETE',
        headers: { 'x-senha-comprador': senhaComprador }
      });
      carregarPedidos();
    });
  });

  document.querySelectorAll('.btn-buscar-preco-pedido').forEach(botao => {
    botao.addEventListener('click', async () => {
      botao.textContent = 'Buscando...';
      botao.disabled = true;

      const resp = await fetch(`/api/pedidos/${botao.dataset.id}/buscar-preco`, {
        method: 'POST',
        headers: { 'x-senha-comprador': senhaComprador }
      });
      const dados = await resp.json();

      if (dados.erro) {
        alert('DEBUG: ' + (dados.erro || '') + ' | ' + (dados.detalhe || 'sem detalhe'));
        botao.textContent = 'Buscar preço';
        botao.disabled = false;
        return;
      }

      carregarPedidos();
    });
  });
}
