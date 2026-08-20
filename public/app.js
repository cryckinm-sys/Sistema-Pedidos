let precoEncontrado = null;

document.getElementById('btn-buscar-preco').addEventListener('click', async () => {
  const item = document.getElementById('item').value.trim();
  const caixaResultado = document.getElementById('resultado-preco');

  if (!item) {
    alert('Digite o nome do item antes de buscar o preço.');
    return;
  }

  caixaResultado.hidden = false;
  caixaResultado.textContent = 'Buscando no Mercado Livre...';

  try {
    const resp = await fetch('/api/buscar-preco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item })
    });
    const dados = await resp.json();

    if (dados.erro) {
      caixaResultado.textContent = 'Não consegui encontrar um preço confiável para esse item.';
      precoEncontrado = null;
      return;
    }

    precoEncontrado = dados;
    caixaResultado.innerHTML = `
      <strong>${dados.produto}</strong><br>
      Preço encontrado: R$ ${Number(dados.preco).toFixed(2)}<br>
      Vendedor: ${dados.loja_ou_vendedor || '—'}<br>
      <a href="${dados.link}" target="_blank" rel="noopener">Ver no Mercado Livre</a>
    `;
  } catch (erro) {
    caixaResultado.textContent = 'Erro ao buscar preço. Confira se o servidor está rodando e a chave da IA foi configurada.';
  }
});

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
  document.getElementById('resultado-preco').hidden = true;
  precoEncontrado = null;
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
      await fetch(`/api/setores-credenciados/${encodeURIComponent(botao.dataset.setor)}`, { method: 'DELETE' });
      carregarSetores();
    });
  });
}

async function carregarPedidos() {
  const resp = await fetch('/api/pedidos');
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
      </div>
      ${p.urgente ? '<span class="selo-urgente">URGENTE</span>' : ''}
    </div>
  `).join('');
}

carregarSetores();
carregarPedidos();
