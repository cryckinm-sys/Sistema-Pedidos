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
