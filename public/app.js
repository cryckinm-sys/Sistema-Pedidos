let senhaComprador = null;
let mapaLeaflet = null;

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function preencherSelectsUF() {
  const selectCadastro = document.getElementById('novo-setor-uf');
  ESTADOS.forEach(uf => {
    const opcao = document.createElement('option');
    opcao.value = uf;
    opcao.textContent = uf;
    selectCadastro.appendChild(opcao);
  });
}

async function carregarSetoresParaPedido() {
  const resp = await fetch('/api/setores');
  const setores = await resp.json();
  const select = document.getElementById('setor');

  select.innerHTML = '<option value="">Selecione um setor...</option>' +
    setores.map(s => `<option value="${s.nome}">${s.nome} (${s.uf})</option>`).join('');
}

document.getElementById('form-pedido').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const corpo = {
    solicitante: document.getElementById('solicitante').value.trim(),
    setor: document.getElementById('setor').value,
    item: document.getElementById('item').value.trim(),
    quantidade_estoque: Number(document.getElementById('quantidade_estoque').value),
    quantidade_pedida: Number(document.getElementById('quantidade_pedida').value)
  };

  if (!corpo.setor) {
    alert('Selecione um setor.');
    return;
  }

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
  document.getElementById('mapa-secao').hidden = false;
  document.getElementById('gastos-secao').hidden = false;

  carregarSetoresCadastrados();
  carregarPedidos();
  carregarMapa();
  carregarGastosMensais();
});

document.getElementById('form-setor').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const nome = document.getElementById('novo-setor-nome').value.trim();
  const uf = document.getElementById('novo-setor-uf').value;
  const credenciado = document.getElementById('novo-setor-credenciado').checked;

  if (!nome || !uf) {
    alert('Preencha o nome do setor e escolha o estado.');
    return;
  }

  await fetch('/api/setores', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-senha-comprador': senhaComprador
    },
    body: JSON.stringify({ nome, uf, credenciado })
  });

  document.getElementById('form-setor').reset();
  carregarSetoresCadastrados();
  carregarSetoresParaPedido();
});

async function carregarSetoresCadastrados() {
  const resp = await fetch('/api/setores');
  const setores = await resp.json();
  const lista = document.getElementById('lista-setores');

  lista.innerHTML = setores.length
    ? setores.map(s => `
        <li>
          ${s.nome} (${s.uf})${s.credenciado ? ' — urgente' : ''}
          <button data-setor="${s.nome}" class="remover-setor" title="Remover">×</button>
        </li>
      `).join('')
    : '<span class="vazio">Nenhum setor cadastrado ainda.</span>';

  document.querySelectorAll('.remover-setor').forEach(botao => {
    botao.addEventListener('click', async () => {
      await fetch(`/api/setores/${encodeURIComponent(botao.dataset.setor)}`, {
        method: 'DELETE',
        headers: { 'x-senha-comprador': senhaComprador }
      });
      carregarSetoresCadastrados();
      carregarSetoresParaPedido();
    });
  });
}

async function carregarMapa() {
  const resp = await fetch('/api/mapa', {
    headers: { 'x-senha-comprador': senhaComprador }
  });
  if (!resp.ok) return;
  const dados = await resp.json();

  if (!mapaLeaflet) {
    mapaLeaflet = L.map('mapa').setView([-14.2350, -51.9253], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(mapaLeaflet);
  }

  mapaLeaflet.eachLayer(camada => {
    if (camada instanceof L.CircleMarker) mapaLeaflet.removeLayer(camada);
  });

  if (!dados.length) return;

  const maiorTotal = Math.max(...dados.map(d => d.total));

  dados.forEach(d => {
    const raio = 8 + (d.total / maiorTotal) * 30;
    L.circleMarker([d.lat, d.lng], {
      radius: raio,
      fillColor: '#1f5eff',
      color: '#12306b',
      weight: 1,
      fillOpacity: 0.6
    })
      .bindPopup(`<strong>${d.uf}</strong><br>Total: R$ ${d.total.toFixed(2)}<br>${d.qtd} pedido(s)`)
      .addTo(mapaLeaflet);
  });
}

async function carregarGastosMensais() {
  const resp = await fetch('/api/gastos-mensais', {
    headers: { 'x-senha-comprador': senhaComprador }
  });
  if (!resp.ok) return;
  const dados = await resp.json();
  const lista = document.getElementById('lista-gastos');

  lista.innerHTML = dados.length
    ? dados.map(d => `
        <div class="gasto-mes">
          <span>${d.mes}</span>
          <strong>R$ ${Number(d.total).toFixed(2)}</strong>
        </div>
      `).join('')
    : '<p class="vazio">Nenhum gasto registrado ainda.</p>';
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
      ` : ''}
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
      carregarMapa();
      carregarGastosMensais();
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
      carregarMapa();
      carregarGastosMensais();
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
        alert('Não consegui buscar o preço: ' + (dados.erro || '') + ' | ' + (dados.detalhe || ''));
        botao.textContent = 'Buscar preço';
        botao.disabled = false;
        return;
      }

      carregarPedidos();
    });
  });
}

preencherSelectsUF();
carregarSetoresParaPedido();
