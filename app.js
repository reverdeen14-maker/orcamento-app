// Telas do app. Tudo é desenhado a partir do modelo que Dados.carregar() monta da planilha.
(() => {
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const hoje = new Date();
  const isoHoje = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');

  const st = {
    aba: 'inicio', sub: 'pagar', m: null, carregando: true, erro: '', aviso: '', conta: null, modo: 'demo', atualizadoEm: null,
    fat: { cartao: null, idx: null, filtro: 'Todos' }, orcMes: null, aberto: 'planilha', folha: null,
    lanc: { forma: 'cartao', tipo: 'Saída', valor: '', desc: '', data: isoHoje, cat: '', cartao: '', parcelas: 1, mensal: false, comp: '', modoValor: 'total' },
    aj: { mes: isoHoje.slice(0, 7), conta: '', valor: '', obs: '' },
    av: { tipo: 'Despesa', venc: isoHoje, desc: '', cat: '', valor: '' },
    of: { servidor: localStorage.getItem('ofServidor') || '', itens: [], buscando: false },
    fx: { tipo: 'Todas', ativas: false }, avTodos: false, envMes: null, envv: {}, abertura: true,
    lb: { inscrito: false, perm: 'Notification' in window ? Notification.permission : 'default', ocupado: false, info: '' }
  };
  // tocar na notificação abre o app já na lista de contas (…/?aba=contas)
  (() => {
    const p = new URLSearchParams(location.search).get('aba');
    if (['inicio', 'contas', 'cartoes', 'orcamento', 'mais'].includes(p)) { st.aba = p; if (p === 'contas') st.sub = 'pagar'; history.replaceState(null, '', location.pathname); }
  })();
  const $app = document.getElementById('app');

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => (n < 0 ? '−' : '') + Math.abs(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rs = (n) => 'R$ ' + brl(n);
  const dm = (s) => { if (typeof s !== 'number') return esc(s); const d = Dados.deSerie(s); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
  const numBR = (t) => { const n = parseFloat(String(t).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const serieISO = (iso) => { const [a, m, d] = iso.split('-').map(Number); return Dados.paraSerie(new Date(a, m - 1, d)); };
  const mesDaSerie = (s) => { const d = Dados.deSerie(s); return { ano: d.getFullYear(), mes: d.getMonth() }; };
  const idxDe = (ano, mes) => ano * 12 + mes + 1;
  const deIdx = (i) => ({ ano: Math.floor((i - 1) / 12), mes: (i - 1) % 12 });
  const icone = {
    inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    contas: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    cartoes: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
    orcamento: '<path d="M5 20V11M12 20V5M19 20v-6M3 20h18"/>',
    mais: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    mais2: '<path d="M12 5v14M5 12h14"/>',
    atualizar: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  const svg = (k, t = 24, w = 2) => '<svg width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icone[k] + '</svg>';

  function avisar(t) { st.aviso = t; desenhar(); clearTimeout(avisar.t); avisar.t = setTimeout(() => { st.aviso = ''; desenhar(); }, 3500); }

  // ---------- carregar ----------
  async function recarregar(silencioso) {
    if (!silencioso) { st.carregando = true; desenhar(); }
    try {
      st.m = await Dados.carregar();
      st.erro = ''; st.atualizadoEm = new Date();
    } catch (e) {
      st.erro = e.message || String(e);
      if (!st.m) st.m = Dados.ultimoSalvo();
    }
    st.carregando = false;
    desenhar();
  }

  async function gravar(fn, okMsg, patchDemo) {
    st.carregando = true; desenhar();
    try {
      await fn();
      if (Dados.modo === 'demo') {
        // na demonstração a mudança fica só na memória do app (some ao fechar)
        if (patchDemo) patchDemo(); else st.m = await Dados.carregar();
        st.carregando = false; avisar('Modo demonstração: nada foi gravado na planilha.');
        return true;
      }
      await recarregar(true);
      avisar(okMsg || 'Salvo na planilha.');
      return true;
    } catch (e) {
      st.carregando = false; avisar('Não deu para salvar: ' + (e.message || e));
      return false;
    }
  }

  // ---------- telas ----------
  function cabecalho(titulo, sub, extra) {
    return '<header class="cab"><div><span class="sub">' + esc(sub) + '</span><h1>' + esc(titulo) + '</h1></div>' + (extra || '') + '</header>';
  }
  const nomeMes = (s) => { const x = mesDaSerie(s); return MESES[x.mes][0].toUpperCase() + MESES[x.mes].slice(1) + ' ' + x.ano; };

  function telaInicio() {
    const m = st.m, p = m.painel;
    const prox = m.pagar.filter((x) => x.status !== 'Pago').slice(0, 6);
    const env = m.envelopes.map((e) => {
      const uso = e.limite ? e.gasto / e.limite : 0;
      const cls = uso > 1 ? 'estouro' : uso >= 0.85 ? 'alerta' : '';
      const resta = e.limite - e.gasto;
      const disp = resta < 0 ? '<b class="vermelho">' + rs(-resta) + ' acima</b>' : '<b class="' + (cls ? 'laranja' : 'verde') + '">' + rs(resta) + ' disponível</b>';
      return '<div class="env"><div class="lin"><span>' + esc(e.nome) + '</span>' + disp + '</div>'
        + '<div class="trilho"><div class="barra ' + cls + '" style="width:' + Math.min(100, Math.round(uso * 100)) + '%"></div></div>'
        + '<span class="cinza pp">Gastou ' + brl(e.gasto) + ' de ' + brl(e.limite) + '</span></div>';
    }).join('');
    const restam = m.envelopes.reduce((t, e) => t + e.restante, 0);
    return cabecalho(nomeMes(m.mesRef), 'Mês de referência',
      '<div class="acoes-cab"><button class="redondo" data-a="mes" data-d="-1" aria-label="Mês anterior">‹</button>'
      + '<button class="redondo" data-a="mes" data-d="1" aria-label="Próximo mês">›</button>'
      + '<button class="redondo" data-a="atualizar" aria-label="Atualizar da planilha">' + svg('atualizar', 20) + '</button></div>')
      + '<section class="destaque"><span class="rot">Saldo em conta agora</span><strong class="grande">' + rs(p.saldo) + '</strong>'
      + '<span class="rot">' + esc(p.txtSaldo) + '</span><div class="duas">'
      + '<div><span>Caixinha</span><b>' + rs(p.caixinha) + '</b></div><div><span>Faturas do mês</span><b>' + rs(p.faturas) + '</b></div></div></section>'
      + secaoContas()
      + '<div class="grade3"><div class="card"><span class="cinza p">Receitas</span><b class="verde">' + brl(p.receitas) + '</b></div>'
      + '<div class="card"><span class="cinza p">Despesas</span><b class="vermelho">' + brl(p.despesas) + '</b></div>'
      + '<div class="card"><span class="cinza p">Sobra</span><b>' + brl(p.sobra) + '</b><span class="cinza pp">' + esc(p.txtSobra) + '</span></div></div>'
      + '<div class="duas-cards"><button class="card link" data-a="aba" data-v="contas"><span class="cinza p">A pagar no mês</span><b class="m">' + rs(p.aPagar) + '</b><span class="cinza pp">' + esc(p.txtAPagar) + '</span></button>'
      + '<button class="card link" data-a="aba" data-v="contas" data-s="receber"><span class="cinza p">Falta receber</span><b class="m">' + rs(p.faltaReceber) + '</b><span class="cinza pp">' + esc(p.txtReceber) + '</span></button></div>'
      + '<section class="bloco"><div class="lin"><h2>Envelopes</h2><span class="cinza">restam ' + rs(restam) + '</span></div>' + env + '</section>'
      + '<section class="bloco lista"><div class="lin"><h2>Próximos vencimentos</h2><button class="texto" data-a="aba" data-v="contas">Ver todos</button></div>'
      + prox.map((x) => '<div class="item"><div class="dia"><b>' + dm(x.venc).slice(0, 2) + '</b><span>' + ABREV[mesDaSerie(x.venc).mes].toUpperCase() + '</span></div>'
        + '<span class="cresce">' + esc(x.desc) + '</span><b>' + brl(x.valor) + '</b></div>').join('')
      + '</section>' + rodapeStatus();
  }

  // ---------- contas nos bancos e cofrinhos (aba Contas da planilha) ----------
  const BANCOS = {
    '99Pay': { cor: '#FFDD00', fim: '#FFB800', texto: '#1A1A1A', sigla: '99' },
    Nubank: { cor: '#820AD1', fim: '#5B0896', texto: '#FFFFFF', sigla: 'Nu' },
    'Mercado Pago': { cor: '#00B1EA', fim: '#0A6FD6', texto: '#FFFFFF', sigla: 'MP' },
    Bradesco: { cor: '#CC092F', fim: '#8E0620', texto: '#FFFFFF', sigla: 'B' }
  };
  const COFRES = {
    Casamento: { dica: 'Reserva do casamento', cor: '#E8579A' },
    'Economia Lucas': { dica: 'Poupança pessoal do Lucas', cor: '#2563EB' },
    Miguel: { dica: 'Poupança do Miguel', cor: '#16A34A' },
    Casal: { dica: 'Poupança do casal', cor: '#F59E0B' },
    'Cartão Bradesco': { dica: 'Guardado para a fatura Bradesco', cor: '#CC092F' }
  };
  const LIGACAO = {
    'Fluxo principal': 'Segue o Fluxo da planilha',
    'Aplicações da caixinha': 'Soma as aplicações da caixinha',
    'Mesadas do Miguel': 'Soma as mesadas pagas'
  };
  const estiloBanco = (c) => BANCOS[c.Banco] || { cor: c.Cor || '#64748B', fim: c.Cor || '#334155', texto: '#FFFFFF', sigla: (c.Conta || '?').slice(0, 2) };
  const quando = (s) => {
    if (typeof s !== 'number' || !s) return '';
    const d = new Date(Date.UTC(1899, 11, 30) + s * 864e5);
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0')
      + ' às ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  };
  const serieAgora = () => { const d = new Date(); return Dados.paraSerie(d) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; };
  const legenda = (c) => c['Ligação'] && !c['Data do saldo'] ? LIGACAO[c['Ligação']]
    : c['Data do saldo'] ? 'Atualizado ' + quando(c['Data do saldo']) : 'Toque para informar o saldo';

  function secaoContas() {
    const cs = st.m.contasBanco || [];
    if (!cs.length) return '';
    const contas = cs.filter((c) => c.Tipo === 'Conta'), cofres = cs.filter((c) => c.Tipo === 'Cofrinho');
    const reservas = cofres.reduce((t, c) => t + (Number(c['Saldo atual']) || 0), 0);
    const cartao = (c) => {
      const b = estiloBanco(c), i = cs.indexOf(c);
      const semSaldo = !c['Ligação'] && !c['Data do saldo'];
      return '<button class="banco" style="--c1:' + b.cor + ';--c2:' + b.fim + ';--tx:' + b.texto + '" data-a="abrirConta" data-i="' + i + '">'
        + '<span class="selo">' + esc(b.sigla) + '</span><span class="nome">' + esc(c.Conta) + '</span>'
        + '<b class="saldo">' + (semSaldo ? 'Informar saldo' : rs(c['Saldo atual'])) + '</b>'
        + '<span class="leg">' + esc(c['Ligação'] === 'Fluxo principal' ? 'Dinheiro da família' : legenda(c)) + '</span></button>';
    };
    const cofre = (c) => {
      const k = COFRES[c.Conta] || { dica: 'Cofrinho', cor: '#00B1EA' }, i = cs.indexOf(c);
      return '<button class="cofre" style="--k:' + k.cor + '" data-a="abrirConta" data-i="' + i + '">'
        + '<span class="porco" aria-hidden="true">' + porquinho(k.cor) + '</span>'
        + '<span class="nome">' + esc(c.Conta) + '</span><b>' + rs(c['Saldo atual']) + '</b><span class="leg">' + esc(k.dica) + '</span></button>';
    };
    return '<section class="bloco contas-bancos"><div class="lin"><h2>Contas</h2><span class="cinza">toque para atualizar</span></div>'
      + '<div class="bancos">' + contas.map(cartao).join('') + '</div></section>'
      + '<section class="bloco cofres-mp"><div class="lin"><h2><span class="mp-tag">MP</span> Cofrinhos</h2><span class="cinza">reservas ' + rs(reservas) + '</span></div>'
      + '<p class="dica">Ficam fora do orçamento: são reservas do Mercado Pago.</p>'
      + '<div class="cofres">' + cofres.map(cofre).join('') + '</div></section>';
  }

  function porquinho(cor) {
    return '<svg viewBox="0 0 40 32" width="34" height="27"><ellipse cx="20" cy="18" rx="14" ry="11" fill="' + cor + '"/>'
      + '<path d="M10 9 8 2l7 4z" fill="' + cor + '"/><rect x="16" y="6" width="8" height="2.4" rx="1.2" fill="#fff" opacity=".85"/>'
      + '<ellipse cx="32" cy="18" rx="4" ry="3.4" fill="' + cor + '" stroke="#fff" stroke-opacity=".5"/><circle cx="25" cy="14" r="1.6" fill="#fff"/>'
      + '<rect x="11" y="26" width="5" height="5" rx="2" fill="' + cor + '"/><rect x="23" y="26" width="5" height="5" rx="2" fill="' + cor + '"/></svg>';
  }

  // Extrato de uma conta: movimentos manuais + o que vem sozinho do Fluxo
  function extratoConta(c) {
    const man = (st.m.movContas || []).filter((x) => x.Conta === c.Conta).map((x) => ({
      data: x.Data, desc: x.Tipo + (x['Descrição'] ? ' · ' + x['Descrição'] : ''), manual: true, saldo: x.Tipo === 'Saldo informado',
      valor: x.Tipo === 'Saída' ? -x.Valor : x.Valor
    }));
    const fl = st.m.fluxo || [];
    let aut = [];
    if (c['Ligação'] === 'Fluxo principal') aut = fl.filter((x) => typeof x.Data === 'number').map((x) => ({ data: x.Data, desc: x['Descrição'], valor: Number(x.Movimento) || 0 }));
    else if (c['Ligação'] === 'Aplicações da caixinha') aut = fl.filter((x) => x['Categoria final'] === 'Caixinha Mercado Pago' && (x.Tipo === 'Aplicação' || x.Tipo === 'Resgate'))
      .map((x) => ({ data: x.Data, desc: x['Descrição'], valor: x.Tipo === 'Resgate' ? -x.Valor : x.Valor }));
    else if (c['Ligação'] === 'Mesadas do Miguel') aut = fl.filter((x) => x['Categoria final'] === 'Mesada Miguel' && x.Tipo === 'Saída')
      .map((x) => ({ data: x.Data, desc: x['Descrição'], valor: x.Valor }));
    return man.concat(aut).filter((x) => typeof x.data === 'number').sort((a, b) => b.data - a.data).slice(0, 25);
  }

  function folhaConta(f) {
    const c = st.m.contasBanco[f.i];
    if (!c) return '';
    const ehCofre = c.Tipo === 'Cofrinho';
    const b = ehCofre ? { cor: (COFRES[c.Conta] || {}).cor || '#00B1EA', fim: '#0A6FD6', texto: '#FFFFFF', sigla: 'MP' } : estiloBanco(c);
    const modos = [['saldo', 'Atualizar saldo'], ['Entrada', ehCofre ? 'Guardar' : 'Entrada'], ['Saída', ehCofre ? 'Retirar' : 'Saída']];
    const ext = extratoConta(c);
    return '<div class="conta-cab" style="--c1:' + b.cor + ';--c2:' + b.fim + ';--tx:' + b.texto + '"><span class="selo">' + esc(b.sigla) + '</span>'
      + '<div><span class="nome">' + esc(c.Conta) + (ehCofre ? ' · cofrinho Mercado Pago' : '') + '</span><b>' + rs(c['Saldo atual']) + '</b>'
      + '<span class="leg">' + esc(legenda(c)) + '</span></div></div>'
      + '<div class="seg">' + modos.map(([id, nome]) => '<button class="' + (f.modo === id ? 'on' : '') + '" data-a="modoConta" data-v="' + id + '">' + nome + '</button>').join('') + '</div>'
      + '<label class="campo"><span class="cinza">' + (f.modo === 'saldo' ? 'Saldo que aparece no banco agora' : 'Valor') + '</span><input inputmode="decimal" placeholder="0,00" data-c="folha.valor" value="' + esc(f.valor) + '"></label>'
      + (f.modo !== 'saldo' ? '<label class="campo"><span class="cinza">Descrição</span><input data-c="folha.desc" value="' + esc(f.desc) + '" placeholder="' + (ehCofre ? 'Ex.: mesada da semana' : 'Ex.: transferência') + '"></label>' : '')
      + '<p class="dica">' + (f.modo === 'saldo' ? 'O saldo passa a valer a partir de agora' + (c['Ligação'] ? '; o que for lançado no Fluxo depois continua entrando sozinho.' : '.')
        : 'Fica no extrato desta ' + (ehCofre ? 'reserva' : 'conta') + ' e não mexe no orçamento.') + '</p>'
      + '<div class="botoes"><button class="btn" data-a="salvarConta">Salvar</button><button class="btn sec" data-a="fechar">Fechar</button></div>'
      + '<h3 class="ext-tit">Extrato</h3><div class="extrato">' + (ext.length ? ext.map((x) => '<div class="item"><span class="cinza pp larg">' + dm(Math.floor(x.data)) + '</span>'
        + '<span class="cresce">' + esc(x.desc) + (x.manual ? '' : ' <span class="tag-fluxo">Fluxo</span>') + '</span>'
        + '<b class="' + (x.saldo ? 'azul' : x.valor < 0 ? 'vermelho' : 'verde') + '">' + (x.saldo ? '= ' + brl(x.valor) : (x.valor > 0 ? '+' : '') + brl(x.valor)) + '</b></div>').join('')
        : '<p class="dica">Nenhum movimento ainda.</p>') + '</div>';
  }

  function rodapeStatus() {
    const pl = Dados.planilha();
    const fonte = Dados.modo === 'demo' ? 'Modo demonstração · cópia da planilha de ' + (st.m.geradoEm || '')
      : 'Planilha ' + pl.ano + ' no OneDrive' + (st.atualizadoEm ? ' · atualizado às ' + st.atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
    return '<p class="status">' + esc(fonte) + (st.erro ? '<br><span class="vermelho">' + esc(st.erro) + '</span>' : '') + '</p>';
  }

  function segmento(itens, atual, acao) {
    return '<div class="seg" role="tablist">' + itens.map(([id, nome]) =>
      '<button role="tab" aria-selected="' + (id === atual) + '" class="' + (id === atual ? 'on' : '') + '" data-a="' + acao + '" data-v="' + id + '">' + esc(nome) + '</button>').join('') + '</div>';
  }

  function telaContas() {
    const m = st.m, c = m.compromissos;
    let corpo = '';
    if (st.sub === 'pagar') {
      corpo = '<div class="grade3"><div class="card"><span class="cinza p">Total</span><b>' + brl(c.total) + '</b></div>'
        + '<div class="card"><span class="cinza p">Pago</span><b class="verde">' + brl(c.pago) + '</b></div>'
        + '<div class="card"><span class="cinza p">Pendente</span><b class="laranja">' + brl(c.pendente + c.atrasado) + '</b></div></div>'
        + '<div class="card linha"><span class="cinza">Ainda a gastar nos envelopes</span><b>' + rs(c.aindaGastar) + '</b></div>'
        + '<p class="dica">Toque no círculo para pagar: o app lança no Fluxo com o nome do compromisso.</p>'
        + '<section class="bloco lista">' + m.pagar.map((x, i) => {
          const pago = x.status === 'Pago';
          return '<div class="item"><button class="ck ' + (pago ? 'on' : '') + '" data-a="pagar" data-i="' + i + '" aria-label="' + (pago ? 'Desfazer pagamento de ' : 'Pagar ') + esc(x.desc) + '">' + svg('check', 14, 3.2) + '</button>'
            + '<div class="cresce col"><span>' + esc(x.desc) + '</span><span class="cinza pp">' + dm(x.venc) + ' · ' + esc(x.parcela) + (x.credor ? ' · ' + esc(x.credor) : '') + '</span></div>'
            + '<div class="col dir"><b>' + brl(x.valor) + '</b><span class="st ' + (pago ? 'verde' : x.status === 'Atrasado' ? 'vermelho' : 'laranja') + '">' + esc(x.status) + '</span></div></div>';
        }).join('') + '</section>';
    } else if (st.sub === 'receber') {
      corpo = '<div class="grade3"><div class="card"><span class="cinza p">Previsto</span><b>' + brl(c.previsto) + '</b></div>'
        + '<div class="card"><span class="cinza p">Recebido</span><b class="verde">' + brl(c.recebido) + '</b></div>'
        + '<div class="card"><span class="cinza p">Falta</span><b class="laranja">' + brl(c.falta) + '</b></div></div>'
        + '<section class="bloco lista">' + m.receber.map((x, i) => {
          const ok = x.status === 'Recebido';
          return '<div class="item"><button class="ck ' + (ok ? 'on' : '') + '" data-a="receber" data-i="' + i + '" aria-label="' + (ok ? 'Desfazer ' : 'Receber ') + esc(x.desc) + '">' + svg('check', 14, 3.2) + '</button>'
            + '<div class="cresce col"><span>' + esc(x.desc) + '</span><span class="cinza pp">' + dm(x.data) + ' · ' + esc(x.categoria) + '</span></div>'
            + '<div class="col dir"><b class="verde">' + brl(x.previsto) + '</b><span class="st ' + (ok ? 'verde' : 'laranja') + '">' + esc(x.status) + '</span></div></div>';
        }).join('') + '</section>';
    } else {
      const me = m.mesada;
      const sextas = m.pagar.filter((x) => /^Mesada Miguel sexta/.test(x.desc));
      corpo = '<section class="bloco"><h2>Mesada do Miguel</h2>'
        + '<div class="lin"><span class="cinza">Mesada do mês</span><b>' + rs(me.mesada) + '</b></div>'
        + '<div class="lin"><span class="cinza">Já gasto no cartão</span><b class="vermelho">− ' + rs(me.cartao) + '</b></div>'
        + '<div class="lin"><span class="cinza">Sobra para as sextas</span><b>' + rs(me.sobra) + '</b></div><hr>'
        + '<div class="lin"><span class="cinza">' + me.sextas + ' sextas · por sexta</span><b class="azul grande2">' + rs(me.porSexta) + '</b></div></section>'
        + '<p class="dica">Compras com a categoria Mesada Miguel abatem na fatura em que caem.</p>'
        + '<section class="bloco lista">' + sextas.map((x) => '<div class="item"><span class="cinza p larg">' + dm(x.venc) + '</span><span class="cresce">' + esc(x.desc) + '</span><b>' + brl(x.valor) + '</b><span class="st ' + (x.status === 'Pago' ? 'verde' : 'laranja') + '">' + esc(x.status) + '</span></div>').join('') + '</section>';
    }
    return cabecalho('Compromissos', nomeMes(m.mesRef)) + segmento([['pagar', 'A pagar'], ['receber', 'A receber'], ['mesada', 'Mesada Miguel']], st.sub, 'sub') + corpo;
  }

  function regraCartao(nome) {
    const c = st.m.cartoes.find((x) => x['Cartão'] === nome) || { Fechamento: 14, Vencimento: 25 };
    return { fe: Number(c.Fechamento), ve: Number(c.Vencimento) };
  }
  function faturaDaCompra(nome, iso) {
    const { fe, ve } = regraCartao(nome);
    const [a, m, d] = iso.split('-').map(Number);
    const mf = m + (d >= fe ? 1 : 0) + (ve <= fe ? 1 : 0);
    return new Date(a, mf - 1, ve);
  }
  function periodo(nome, i) {
    const { fe, ve } = regraCartao(nome);
    const { ano, mes } = deIdx(i);
    const fim = new Date(ano, mes - (ve <= fe ? 1 : 0), fe - 1);
    const ini = new Date(fim.getFullYear(), fim.getMonth() - 1, fe);
    const f = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    return 'Fecha dia ' + fe + ' · compras de ' + f(ini) + ' a ' + f(fim) + ' · vence ' + String(ve).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0');
  }

  function telaCartoes() {
    const m = st.m;
    const ref = mesDaSerie(m.mesRef);
    if (st.fat.idx == null) st.fat.idx = idxDe(ref.ano, ref.mes);
    if (!st.fat.cartao) st.fat.cartao = (m.cartoes[0] || {})['Cartão'];
    const i = st.fat.idx;
    const daFatura = (nome) => m.compras.filter((x) => x['Cartão'] === nome && typeof x.IdxIni === 'number' && x.IdxIni <= i && i <= x.IdxFim);
    const soma = (l) => l.reduce((t, x) => t + (Number(x['Valor parcela']) || 0), 0);
    const chips = m.cartoes.map((c) => {
      const nome = c['Cartão'], on = nome === st.fat.cartao;
      return '<button class="cartao ' + (on ? 'on' : '') + '" data-a="cartao" data-v="' + esc(nome) + '"><span>' + esc(nome) + '</span><b>' + brl(soma(daFatura(nome))) + '</b><span class="pp">vence dia ' + c.Vencimento + '</span></button>';
    }).join('');
    const env = (x) => x['Envelope final'] || (x['Família'] === 'Não' ? 'Fora do orçamento' : 'Sem envelope');
    const todas = daFatura(st.fat.cartao);
    const nomes = ['Todos'];
    todas.forEach((x) => { if (!nomes.includes(env(x))) nomes.push(env(x)); });
    if (!nomes.includes(st.fat.filtro)) st.fat.filtro = 'Todos';
    const sel = todas.filter((x) => st.fat.filtro === 'Todos' || env(x) === st.fat.filtro);
    const total = soma(todas), fora = soma(todas.filter((x) => x['Família'] === 'Não'));
    const pf = total > 0 ? Math.max(0, Math.min(100, Math.round(((total - fora) / total) * 100))) : 0;
    const parc = (x) => {
      if (x.Parcelas === 'Mensal') return 'Mensal';
      const n = Number(x.Parcelas) || 1;
      return n === 1 ? 'À vista' : (i - x.IdxIni + 1) + ' de ' + n;
    };
    const { ano, mes } = deIdx(i);
    return cabecalho('Cartões', 'Fatura que vence em ' + MESES[mes] + '/' + String(ano).slice(2),
      '<div class="acoes-cab"><button class="redondo" data-a="fatmes" data-d="-1" aria-label="Fatura anterior">‹</button><button class="redondo" data-a="fatmes" data-d="1" aria-label="Próxima fatura">›</button></div>')
      + '<div class="cartoes">' + chips + '</div>'
      + '<section class="bloco"><span class="cinza p">' + esc(periodo(st.fat.cartao, i)) + '</span>'
      + '<div class="lin"><span class="cinza">Total da fatura</span><b class="grande2">' + rs(total) + '</b></div>'
      + '<div class="trilho grosso"><div class="barra" style="width:' + pf + '%"></div><div class="barra laranja-f" style="width:' + (100 - pf) + '%"></div></div>'
      + '<div class="lin pp"><span>● Família ' + rs(total - fora) + '</span><span class="laranja">● Fora do orçamento ' + rs(fora) + '</span></div></section>'
      + '<div class="chips">' + nomes.map((n) => '<button class="chip ' + (n === st.fat.filtro ? 'on' : '') + '" data-a="filtro" data-v="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>'
      + '<section class="bloco lista"><div class="lin"><b>' + sel.length + ' compras</b><b class="azul">' + rs(soma(sel)) + '</b></div>'
      + '<p class="dica">Toque numa compra para corrigir ou apagar.</p>'
      + sel.map((x) => '<div class="item"><button class="linha-edit" data-a="editCompra" data-i="' + x._i + '"><span class="cinza pp larg">' + dm(x.Data) + '</span><span class="cresce col"><span>' + esc(x['Descrição']) + '</span><span class="cinza pp">' + esc(x.Categoria) + ' · ' + parc(x) + '</span></span>'
        + '<b class="' + (x['Valor parcela'] < 0 ? 'verde' : x['Família'] === 'Não' ? 'laranja' : '') + '">' + brl(x['Valor parcela']) + '</b><span class="seta" aria-hidden="true">›</span></button></div>').join('') + '</section>';
  }

  function telaOrcamento() {
    const o = st.m.orcamento;
    if (st.orcMes == null) { const r = mesDaSerie(st.m.mesRef); const k = o.meses.findIndex((s) => typeof s === 'number' && mesDaSerie(s).mes === r.mes); st.orcMes = k < 0 ? 0 : k; }
    const k = st.orcMes;
    const mesAtual = idxDe(hoje.getFullYear(), hoje.getMonth());
    const futuro = typeof o.meses[k] === 'number' && idxDe(mesDaSerie(o.meses[k]).ano, mesDaSerie(o.meses[k]).mes) > mesAtual;
    const max = Math.max(1, ...o.sobra.map(Math.abs));
    const barras = o.sobra.map((v, i) => {
      const h = Math.round((Math.abs(v) / max) * 100);
      const cls = (v < 0 ? 'neg' : 'pos') + (i === k ? ' sel' : '');
      return '<button class="mesbar" data-a="orcmes" data-v="' + i + '" aria-label="' + MESES[i] + '"><div class="meia">' + (v >= 0 ? '<div class="b ' + cls + '" style="height:' + h + '%"></div>' : '') + '</div><div class="eixo"></div>'
        + '<div class="meia baixo">' + (v < 0 ? '<div class="b ' + cls + '" style="height:' + h + '%"></div>' : '') + '</div><span class="' + (i === k ? 'forte' : '') + '">' + ABREV[i][0] + '</span></button>';
    }).join('');
    const gmax = Math.max(1, ...o.grupos.map((g) => g.valores[k]));
    const linha = (rot, v, cls) => '<div class="lin"><span class="cinza">' + rot + '</span><b class="' + (cls || '') + '">' + rs(v) + '</b></div>';
    return cabecalho('Orçamento', 'Ano de ' + (typeof o.meses[0] === 'number' ? mesDaSerie(o.meses[0]).ano : ''), '<span class="tag ' + (futuro ? 'prev' : 'real') + '">' + (futuro ? 'Previsão' : 'Realizado') + '</span>')
      + '<section class="bloco"><span class="cinza p">Sobra de cada mês · toque para abrir</span><div class="grafico">' + barras + '</div></section>'
      + '<section class="bloco"><h2>' + MESES[k][0].toUpperCase() + MESES[k].slice(1) + '</h2>'
      + linha('Sobra do mês anterior', o.anterior[k]) + linha('Renda da família', o.renda[k], 'verde') + linha('Aplicação (caixinha)', o.aplicacao[k])
      + linha('Despesas da família', o.despesas[k], 'vermelho') + '<hr>'
      + '<div class="lin"><span class="cinza">Sobra mensal</span><b class="grande2 ' + (o.sobra[k] < 0 ? 'vermelho' : 'verde') + '">' + rs(o.sobra[k]) + '</b></div>'
      + linha('Saldo que passa para o próximo mês', o.liquido[k])
      + '<div class="lin"><span class="cinza">Taxa de poupança</span><b>' + Math.round(o.taxa[k] * 100) + '%</b></div></section>'
      + '<section class="bloco"><h2>Despesas por grupo</h2>' + o.grupos.map((g) => '<div class="env"><div class="lin"><span>' + esc(g.nome) + '</span><span class="cinza">' + rs(g.valores[k]) + '</span></div>'
        + '<div class="trilho fino"><div class="barra" style="width:' + Math.round((g.valores[k] / gmax) * 100) + '%"></div></div></div>').join('') + '</section>';
  }

  function opcoesCategorias(sel) {
    const grupos = {};
    st.m.categorias.filter((c) => c.Categoria && c.Natureza !== 'Saldo').forEach((c) => { (grupos[c.Grupo] = grupos[c.Grupo] || []).push(c.Categoria); });
    return '<option value="">Escolha…</option>' + Object.entries(grupos).map(([g, cs]) => '<optgroup label="' + esc(g) + '">'
      + cs.map((c) => '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</optgroup>').join('');
  }

  // Compra parcelada: a planilha guarda o valor de UMA parcela. Se a pessoa digitou o total, divide.
  function valorParcela(l) {
    const v = numBR(l.valor);
    if (l.forma !== 'cartao' || l.mensal || l.parcelas <= 1 || l.modoValor !== 'total') return v;
    return Math.round((v / l.parcelas) * 100) / 100;
  }

  function telaLancar() {
    const l = st.lanc, m = st.m;
    const parcelado = l.forma === 'cartao' && !l.mensal && l.parcelas > 1;
    if (!l.cartao) l.cartao = (m.cartoes[0] || {})['Cartão'] || '';
    const cat = m.categorias.find((c) => c.Categoria === l.cat);
    const envTxt = !cat ? '' : cat.Natureza === 'Fora do orçamento' ? 'Fora do orçamento da família.' : cat.Envelope ? 'Envelope ' + cat.Envelope + ': abate do limite do mês.' : 'Sem envelope: entra direto na categoria.';
    let extra = '';
    if (l.forma === 'cartao') {
      const v = faturaDaCompra(l.cartao, l.data);
      const f = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2);
      const ult = new Date(v.getFullYear(), v.getMonth() + l.parcelas - 1, v.getDate());
      extra = '<div class="campo-bloco"><span class="cinza">Cartão</span><div class="chips">' + m.cartoes.map((c) => '<button class="chip ' + (c['Cartão'] === l.cartao ? 'on' : '') + '" data-a="lc" data-v="' + esc(c['Cartão']) + '">' + esc(c['Cartão']) + '</button>').join('') + '</div></div>'
        + '<div class="campo"><span class="cinza">Parcelas</span><div class="passo"><button data-a="parc" data-d="-1" aria-label="Menos parcelas">−</button><b>' + (l.mensal ? 'Mensal' : l.parcelas === 1 ? 'À vista' : l.parcelas + 'x') + '</b><button data-a="parc" data-d="1" aria-label="Mais parcelas">+</button></div></div>'
        + '<label class="campo"><span class="cinza">Assinatura mensal</span><input type="checkbox" data-c="lanc.mensal"' + (l.mensal ? ' checked' : '') + '></label>'
        + '<div class="info">Cai na fatura que vence ' + f(v) + (l.mensal ? ' e todo mês depois' : l.parcelas > 1 ? ' · última em ' + f(ult) : '') + '<br><span>' + esc(periodo(l.cartao, idxDe(v.getFullYear(), v.getMonth()))) + '</span></div>';
    } else {
      extra = '<div class="campo-bloco"><span class="cinza">Tipo</span><div class="chips">' + m.tipos.map((t) => '<button class="chip ' + (t === l.tipo ? 'on' : '') + '" data-a="lt" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div></div>'
        + '<label class="campo"><span class="cinza">Compromisso</span><select data-c="lanc.comp"><option value="">Nenhum</option>'
        + m.pagar.filter((x) => x.status !== 'Pago').map((x) => '<option' + (x.desc === l.comp ? ' selected' : '') + '>' + esc(x.desc) + '</option>').join('') + '</select></label>';
    }
    return '<header class="cab barra-acao"><button class="texto" data-a="aba" data-v="inicio">Cancelar</button><h1 class="peq">Novo lançamento</h1><button class="texto forte" data-a="salvarLanc">Salvar</button></header>'
      + segmento([['pix', 'Pix / débito / dinheiro'], ['cartao', 'Cartão de crédito']], l.forma, 'forma')
      + '<section class="bloco centro">'
      + (parcelado ? segmento([['total', 'Valor total da compra'], ['parcela', 'Valor da parcela']], l.modoValor, 'modoValor') : '')
      + '<label for="valor" class="cinza p">' + (!parcelado ? 'Valor' : l.modoValor === 'total' ? 'Valor total da compra' : 'Valor de cada parcela') + '</label>'
      + '<div class="valor"><span>R$</span><input id="valor" inputmode="decimal" placeholder="0,00" value="' + esc(l.valor) + '" data-c="lanc.valor"></div>'
      + (parcelado && numBR(l.valor) ? '<span class="resumo-parc">' + l.parcelas + 'x de <b>' + rs(valorParcela(l)) + '</b> · total ' + rs(valorParcela(l) * l.parcelas) + '</span>' : '') + '</section>'
      + '<section class="bloco form"><label class="campo"><span class="cinza">Descrição</span><input data-c="lanc.desc" value="' + esc(l.desc) + '" placeholder="Ex.: Nosso Atacarejo"></label>'
      + '<label class="campo"><span class="cinza">Data</span><input type="date" data-c="lanc.data" value="' + esc(l.data) + '"></label>'
      + '<label class="campo"><span class="cinza">Categoria</span><select data-c="lanc.cat">' + opcoesCategorias(l.cat) + '</select></label>'
      + (envTxt ? '<p class="dica">' + esc(envTxt) + '</p>' : '') + extra + '</section>';
  }

  function secao(id, sigla, cor, nome, sub, corpo) {
    const ab = st.aberto === id;
    return '<div class="secao"><button class="secao-cab" data-a="abrir" data-v="' + id + '" aria-expanded="' + ab + '"><span class="sigla" style="background:' + cor + '">' + sigla + '</span>'
      + '<span class="cresce col"><span>' + esc(nome) + '</span><span class="cinza pp">' + esc(sub) + '</span></span><span class="cinza">' + (ab ? '⌃' : '⌄') + '</span></button>'
      + (ab ? '<div class="secao-corpo">' + corpo + '</div>' : '') + '</div>';
  }

  // ---------- lembretes (notificação às 6h) ----------
  const lbSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function lbVerificar() {
    if (!lbSuportado()) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      st.lb.inscrito = !!(await reg.pushManager.getSubscription());
      st.lb.perm = Notification.permission;
    } catch (e) { /* sem service worker */ }
    desenhar();
  }
  async function lbApi(caminho, corpo) {
    const r = await fetch(window.APP_CONFIG.lembretes.replace(/\/$/, '') + caminho, {
      method: 'POST', headers: { Authorization: 'Bearer ' + await Dados.tokenAtual(), 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'servidor respondeu ' + r.status);
    return j;
  }
  const chaveBytes = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

  // limite digitado (ainda não salvo) diferente do que está na planilha?
  function envAlterado(e, mes) {
    const k = mes + '_' + e._i, col = ABREV[mes];
    if (st.envv[k] === undefined) return false;
    const atual = typeof e[col] === 'number' ? Math.round(e[col] * 100) / 100 : 0;
    return Math.round(numBR(st.envv[k]) * 100) / 100 !== atual;
  }
  const isoDe = (s) => { if (typeof s !== 'number') return isoHoje; const d = Dados.deSerie(Math.floor(s)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function telaMais() {
    const m = st.m, pl = Dados.planilha();
    const mesRef = mesDaSerie(m.mesRef);
    const cfg = window.APP_CONFIG;
    const planilhaCorpo = '<div class="lin"><span>Conta</span><b>' + esc(st.conta || (Dados.modo === 'demo' ? 'Modo demonstração' : 'Não conectada')) + '</b></div>'
      + '<div class="lin"><span>Ano</span><div class="chips">' + cfg.planilhas.map((p) => '<button class="chip ' + (p.ano === pl.ano ? 'on' : '') + '" data-a="ano" data-v="' + p.ano + '">' + p.ano + '</button>').join('') + '</div></div>'
      + '<p class="dica">Arquivo: ' + esc(pl.caminho) + '</p>'
      + '<div class="botoes">' + (Dados.modo === 'onedrive' ? '<button class="btn" data-a="atualizar">Atualizar agora</button><button class="btn sec" data-a="sair">Sair da conta</button>'
        : cfg.clientId ? '<button class="btn" data-a="entrar">Entrar com a conta Microsoft</button>' : '<p class="dica">Para ligar ao OneDrive, siga o LEIAME.md (registrar o app na Microsoft e colar o ID em config.js).</p>')
      + (cfg.clientId ? '<button class="btn sec" data-a="demo">' + (Dados.modo === 'demo' ? 'Sair da demonstração' : 'Ver demonstração') + '</button>' : '') + '</div>';
    const fx = st.fx;
    const listaContas = m.contas.filter((c) => (fx.tipo === 'Todas' || c.Tipo === fx.tipo) && (fx.ativas ? c.Ativo !== 'Não' : true));
    const contas = '<p class="dica">Toque numa conta para mudar valor, dia, credor ou observação. O botão da direita liga e desliga a conta.</p>'
      + '<div class="chips">' + ['Todas', 'Despesa', 'Receita', 'Aplicação'].map((t) => '<button class="chip ' + (fx.tipo === t ? 'on' : '') + '" data-a="fxTipo" data-v="' + t + '">' + t + '</button>').join('')
      + '<button class="chip ' + (fx.ativas ? 'on' : '') + '" data-a="fxAtivas">Só ativas</button></div>'
      + '<div class="lista-edit">' + listaContas.map((c) => '<div class="item"><button class="linha-edit" data-a="editConta" data-i="' + c._i + '"><span class="cresce col"><span>' + esc(c['Descrição']) + '</span><span class="cinza pp">' + esc(c.Tipo) + ' · dia ' + esc(c.Dia) + (c['Situação no mês'] ? ' · ' + esc(c['Situação no mês']) : '') + '</span></span><b>' + brl(c.Valor) + '</b><span class="seta" aria-hidden="true">›</span></button>'
      + '<button class="chip ' + (c.Ativo === 'Não' ? '' : 'on') + '" data-a="ativo" data-i="' + c._i + '" data-v="' + (c.Ativo === 'Não' ? 'Sim' : 'Não') + '">' + (c.Ativo === 'Não' ? 'Inativo' : 'Ativo') + '</button></div>').join('')
      + (listaContas.length ? '' : '<p class="dica">Nenhuma conta neste filtro.</p>') + '</div>';
    const aj = st.aj;
    const mesAno = (s) => (typeof s === 'number' ? MESES[mesDaSerie(s).mes] + '/' + String(mesDaSerie(s).ano).slice(2) : '');
    const valores = '<p class="dica">Toque num valor para corrigir ou apagar.</p>' + m.ajustes.filter((a) => a.Conta).map((a) => '<div class="item"><button class="linha-edit" data-a="editAjuste" data-i="' + a._i + '"><span class="cresce col"><span>' + esc(a.Conta) + '</span><span class="cinza pp">' + mesAno(a['Mês']) + (a['Observação'] ? ' · ' + esc(a['Observação']) : '') + '</span></span><b>' + brl(a.Valor) + '</b><span class="seta" aria-hidden="true">›</span></button></div>').join('')
      + '<h3 class="sub-tit">Novo valor do mês</h3>'
      + '<div class="mini-form"><label class="campo"><span class="cinza">Mês</span><input type="month" data-c="aj.mes" value="' + esc(aj.mes) + '"></label>'
      + '<label class="campo"><span class="cinza">Conta</span><select data-c="aj.conta"><option value="">Escolha…</option>' + m.contas.map((c) => '<option' + (c['Descrição'] === aj.conta ? ' selected' : '') + '>' + esc(c['Descrição']) + '</option>').join('') + '</select></label>'
      + '<label class="campo"><span class="cinza">Valor</span><input inputmode="decimal" data-c="aj.valor" value="' + esc(aj.valor) + '" placeholder="0,00"></label>'
      + '<label class="campo"><span class="cinza">Observação</span><input data-c="aj.obs" value="' + esc(aj.obs) + '"></label>'
      + '<button class="btn" data-a="salvarAjuste">Adicionar valor do mês</button></div>';
    const av = st.av;
    const listaAv = m.avulsos.filter((a) => a['Descrição'] && (st.avTodos || (typeof a['Mês'] === 'number' && a['Mês'] >= m.mesRef)));
    const avulsos = '<p class="dica">Toque num gasto para corrigir ou apagar.</p>'
      + '<div class="chips"><button class="chip ' + (st.avTodos ? '' : 'on') + '" data-a="avTodos" data-v="0">Deste mês em diante</button><button class="chip ' + (st.avTodos ? 'on' : '') + '" data-a="avTodos" data-v="1">Todos</button></div>'
      + listaAv.map((a) => '<div class="item"><button class="linha-edit" data-a="editAvulso" data-i="' + a._i + '"><span class="cinza pp larg">' + dm(a.Vencimento) + '</span><span class="cresce col"><span>' + esc(a['Descrição']) + '</span><span class="cinza pp">' + esc(a.Tipo) + ' · ' + esc(a.Categoria) + '</span></span><b class="' + (a.Tipo === 'Receita' ? 'verde' : '') + '">' + brl(a.Valor) + '</b><span class="seta" aria-hidden="true">›</span></button></div>').join('')
      + (listaAv.length ? '' : '<p class="dica">Nenhum gasto avulso aqui.</p>')
      + '<h3 class="sub-tit">Novo gasto avulso</h3>'
      + '<div class="mini-form"><div class="chips">' + ['Despesa', 'Receita'].map((t) => '<button class="chip ' + (t === av.tipo ? 'on' : '') + '" data-a="avtipo" data-v="' + t + '">' + t + '</button>').join('') + '</div>'
      + '<label class="campo"><span class="cinza">Vencimento</span><input type="date" data-c="av.venc" value="' + esc(av.venc) + '"></label>'
      + '<label class="campo"><span class="cinza">Descrição</span><input data-c="av.desc" value="' + esc(av.desc) + '"></label>'
      + '<label class="campo"><span class="cinza">Categoria</span><select data-c="av.cat">' + opcoesCategorias(av.cat) + '</select></label>'
      + '<label class="campo"><span class="cinza">Valor</span><input inputmode="decimal" data-c="av.valor" value="' + esc(av.valor) + '" placeholder="0,00"></label>'
      + '<button class="btn" data-a="salvarAvulso">Adicionar gasto avulso</button></div>';
    if (st.envMes == null) st.envMes = mesRef.mes;
    const ce = ABREV[st.envMes];
    const envMudou = (e) => envAlterado(e, st.envMes);
    const nMud = m.envelopesCfg.filter(envMudou).length;
    const envs = '<div class="lin mes-nav"><button class="redondo peq" data-a="envMes" data-d="-1" aria-label="Mês anterior">‹</button><b>' + MESES[st.envMes][0].toUpperCase() + MESES[st.envMes].slice(1) + '</b>'
      + '<button class="redondo peq" data-a="envMes" data-d="1" aria-label="Próximo mês">›</button></div>'
      + '<p class="dica">Mude os limites e toque em Salvar. Para passar dinheiro de um mês para outro, ajuste os dois meses.</p>'
      + m.envelopesCfg.filter((e) => e.Envelope).map((e) => {
        const k = st.envMes + '_' + e._i;
        const v = st.envv[k] !== undefined ? st.envv[k] : (typeof e[ce] === 'number' ? brl(e[ce]) : '');
        return '<div class="item"><span class="cresce">' + esc(e.Envelope) + '</span>'
          + '<input class="num' + (envMudou(e) ? ' mudou' : '') + '" inputmode="decimal" placeholder="0,00" data-c="envv.' + k + '" value="' + esc(v) + '" aria-label="Limite de ' + esc(e.Envelope) + ' em ' + MESES[st.envMes] + '"></div>';
      }).join('')
      + '<div class="botoes"><button class="btn" data-a="salvarEnvs">' + (nMud ? 'Salvar ' + nMud + (nMud === 1 ? ' limite' : ' limites') : 'Salvar limites') + '</button>'
      + (nMud ? '<button class="btn sec" data-a="descartarEnvs">Desfazer</button>' : '') + '</div>';
    const of = st.of;
    const ofCorpo = '<p class="dica">Importa as compras e os pagamentos do banco por Open Finance. Precisa de um servidor de conexão (veja LEIAME.md, parte 4). Enquanto não houver, nada é enviado a lugar nenhum.</p>'
      + '<label class="campo"><span class="cinza">Servidor</span><input data-c="of.servidor" value="' + esc(of.servidor) + '" placeholder="https://…"></label>'
      + '<div class="botoes"><button class="btn" data-a="ofBuscar"' + (of.servidor ? '' : ' disabled') + '>' + (of.buscando ? 'Buscando…' : 'Buscar transações') + '</button></div>'
      + (of.itens.length ? '<div class="lista">' + of.itens.map((t, k) => '<div class="item"><input type="checkbox" data-c="of.sel.' + k + '"' + (t.sel ? ' checked' : '') + ' aria-label="Importar ' + esc(t.description) + '">'
        + '<div class="cresce col"><span>' + esc(t.description) + '</span><span class="cinza pp">' + esc(t.date) + ' · ' + esc(t.destino) + '</span>'
        + '<select data-c="of.cat.' + k + '">' + opcoesCategorias(t.cat) + '</select></div><b>' + brl(Math.abs(t.amount)) + '</b></div>').join('')
        + '<button class="btn" data-a="ofImportar">Importar selecionadas</button></div>' : '');
    const lb = st.lb, srv = cfg.lembretes;
    let lbCorpo;
    if (!srv) lbCorpo = '<p class="dica">O servidor de lembretes ainda não foi ligado.</p>';
    else if (!lbSuportado()) lbCorpo = '<p class="dica">Neste aparelho não dá. No iPhone, abra o app pelo ícone da Tela de Início (iOS 16.4 ou mais novo).</p>';
    else if (Dados.modo !== 'onedrive') lbCorpo = '<p class="dica">Entre com a conta Microsoft para ligar os lembretes.</p>';
    else {
      const ligado = lb.inscrito && lb.perm === 'granted';
      lbCorpo = '<p>Todo dia às <b>6h</b> chega uma notificação com as contas que vencem no dia (e as em atraso). Em dia sem conta, não chega nada.</p>'
        + '<div class="lin"><span>Neste aparelho</span><b class="' + (ligado ? 'verde' : 'cinza') + '">' + (lb.perm === 'denied' ? 'Bloqueado' : ligado ? 'Ligado ✓' : 'Desligado') + '</b></div>'
        + (lb.perm === 'denied' ? '<p class="dica">As notificações foram recusadas. No iPhone: Ajustes → Notificações → Orçamento → Permitir.</p>' : '')
        + (lb.info ? '<p class="dica">' + esc(lb.info) + '</p>' : '')
        + '<div class="botoes">' + (ligado ? '<button class="btn" data-a="lbTeste"' + (lb.ocupado ? ' disabled' : '') + '>' + (lb.ocupado ? 'Enviando…' : 'Mandar um teste agora') + '</button>'
          + '<button class="btn sec" data-a="lbDesativar"' + (lb.ocupado ? ' disabled' : '') + '>Desligar neste aparelho</button>'
          : '<button class="btn" data-a="lbAtivar"' + (lb.ocupado || lb.perm === 'denied' ? ' disabled' : '') + '>' + (lb.ocupado ? 'Ligando…' : 'Ligar lembretes') + '</button>') + '</div>'
        + '<p class="dica">Cada celular liga o seu (o seu e o da Bianca).</p>';
    }
    const instalar = '<p>No iPhone, abra o endereço do app no <b>Safari</b>, toque em <b>Compartilhar</b> (quadrado com seta) e depois em <b>Adicionar à Tela de Início</b>. O ícone abre o app em tela cheia.</p>';
    return cabecalho('Mais', 'Cadastro e ajustes') + '<section class="bloco secoes">'
      + secao('planilha', 'XL', '#157F3B', 'Planilha e conta', Dados.modo === 'demo' ? 'Modo demonstração' : 'OneDrive · ' + pl.ano, planilhaCorpo)
      + secao('contas', 'CF', '#1D4ED8', 'Contas fixas e parcelas', 'Cadastro · geram os compromissos do mês', contas)
      + secao('valores', 'VM', '#B45309', 'Valores do mês', 'Quando uma conta muda só num mês', valores)
      + secao('avulsos', 'AV', '#6D28D9', 'Gastos avulsos', 'Aniversários, IPVA, revisões…', avulsos)
      + secao('envelopes', 'EN', '#0F766E', 'Limites dos envelopes', 'Mês de ' + MESES[st.envMes], envs)
      + secao('lembretes', '🔔', '#E9A21C', 'Lembretes no celular', 'Aviso das contas do dia às 6h', lbCorpo)
      + secao('openfinance', 'OF', '#45454A', 'Conexões bancárias', 'Open Finance (precisa de servidor)', ofCorpo)
      + secao('instalar', 'IN', '#B42318', 'Instalar no iPhone', 'Ícone na tela de início', instalar)
      + '</section>' + rodapeStatus();
  }

  function navegacao() {
    const it = (id, nome) => '<button class="tab ' + (st.aba === id ? 'on' : '') + '" data-a="aba" data-v="' + id + '"' + (st.aba === id ? ' aria-current="page"' : '') + '>' + svg(id) + '<span>' + nome + '</span></button>';
    return '<nav class="tabs">' + it('inicio', 'Início') + it('contas', 'Contas')
      + '<button class="tab mais-c" data-a="aba" data-v="lancar" aria-label="Lançar"><span class="bola">' + svg('mais2', 24, 2.4) + '</span></button>'
      + it('cartoes', 'Cartões') + it('orcamento', 'Orçamento') + it('mais', 'Mais') + '</nav>';
  }

  function folha() {
    const f = st.folha;
    if (!f) return '';
    let corpo = '';
    if (f.tipo === 'pagar' || f.tipo === 'receber') {
      corpo = '<h2>' + (f.tipo === 'pagar' ? 'Pagar ' : 'Receber ') + esc(f.item.desc) + '</h2>'
        + '<label class="campo"><span class="cinza">Valor</span><input inputmode="decimal" data-c="folha.valor" value="' + esc(f.valor) + '"></label>'
        + '<label class="campo"><span class="cinza">Data</span><input type="date" data-c="folha.data" value="' + esc(f.data) + '"></label>'
        + '<p class="dica">Vai para o Fluxo como ' + esc(f.lancTipo) + (f.item.categoria ? ' · ' + esc(f.item.categoria) : '') + '.</p>'
        + '<div class="botoes"><button class="btn" data-a="confirmar">Confirmar</button><button class="btn sec" data-a="fechar">Cancelar</button></div>';
    } else if (f.tipo === 'desfazer') {
      corpo = '<h2>Desfazer ' + esc(f.item.desc) + '?</h2><p class="dica">Apaga do Fluxo o lançamento de ' + rs(f.linha.Valor) + ' em ' + dm(f.linha.Data) + '.</p>'
        + '<div class="botoes"><button class="btn perigo" data-a="confirmarDesfazer">Apagar lançamento</button><button class="btn sec" data-a="fechar">Cancelar</button></div>';
    } else if (f.tipo === 'editCompra') {
      const np = f.mensal ? 1 : Math.max(1, parseInt(f.parcelas, 10) || 1);
      corpo = '<h2>Compra no cartão ' + esc(f.cartao) + '</h2>'
        + '<label class="campo"><span class="cinza">Descrição</span><input data-c="folha.desc" value="' + esc(f.desc) + '"></label>'
        + '<label class="campo"><span class="cinza">Data</span><input type="date" data-c="folha.data" value="' + esc(f.data) + '"></label>'
        + '<label class="campo"><span class="cinza">Valor de cada parcela</span><input inputmode="decimal" data-c="folha.valor" value="' + esc(f.valor) + '" placeholder="0,00"></label>'
        + '<div class="campo"><span class="cinza">Parcelas</span><div class="passo"><button data-a="fParc" data-d="-1" aria-label="Menos parcelas">−</button><b>' + (f.mensal ? 'Mensal' : np === 1 ? 'À vista' : np + 'x') + '</b><button data-a="fParc" data-d="1" aria-label="Mais parcelas">+</button></div></div>'
        + '<label class="campo"><span class="cinza">Categoria</span><select data-c="folha.cat">' + opcoesCategorias(f.cat) + '</select></label>'
        + (!f.mensal && np > 1 && numBR(f.valor) ? '<p class="info">' + np + 'x de ' + rs(numBR(f.valor)) + ' · total ' + rs(numBR(f.valor) * np) + '</p>' : '')
        + '<p class="dica">Se você lançou o total como se fosse a parcela, toque em "Dividir pelo nº de parcelas".</p>'
        + '<div class="botoes"><button class="btn" data-a="salvarCompra">Salvar</button><button class="btn sec" data-a="dividirCompra">Dividir pelo nº de parcelas</button>'
        + '<button class="btn sec" data-a="fechar">Cancelar</button><button class="btn perigo-sec" data-a="pedirLimpar" data-v="tbCartao">Apagar</button></div>';
    } else if (f.tipo === 'escolherDesfazer') {
      corpo = '<h2>Desfazer ' + esc(f.item.desc) + '</h2><p class="dica">Não há lançamento com esse nome no Fluxo. Estes são os lançamentos do mês na categoria '
        + esc(f.item.categoria) + '. Toque no que deve ser apagado:</p>'
        + '<div class="lista">' + f.cands.map((x, k) => '<div class="item"><button class="linha-edit" data-a="escolherLinha" data-i="' + k + '"><span class="cinza pp larg">' + dm(x.Data) + '</span>'
          + '<span class="cresce">' + esc(x['Descrição']) + '</span><b>' + brl(x.Valor) + '</b><span class="seta" aria-hidden="true">›</span></button></div>').join('') + '</div>'
        + '<div class="botoes"><button class="btn sec" data-a="fechar">Cancelar</button></div>';
    } else if (f.tipo === 'conta') {
      corpo = folhaConta(f);
    } else if (f.tipo === 'editConta') {
      const c = st.m.contas.find((x) => x._i === f.i) || {};
      corpo = '<h2>' + esc(c['Descrição']) + '</h2><span class="cinza pp">' + esc(c.Tipo) + ' · ' + esc(c.Categoria) + (c.Parcelas ? ' · ' + esc(c.Parcelas) + ' parcelas' : ' · sem fim') + '</span>'
        + '<label class="campo"><span class="cinza">Valor</span><input inputmode="decimal" data-c="folha.valor" value="' + esc(f.valor) + '" placeholder="0,00"></label>'
        + '<label class="campo"><span class="cinza">Dia do vencimento</span><input inputmode="numeric" data-c="folha.dia" value="' + esc(f.dia) + '"></label>'
        + '<label class="campo"><span class="cinza">Credor</span><input data-c="folha.credor" value="' + esc(f.credor) + '"></label>'
        + '<div class="campo"><span class="cinza">Situação</span><div class="chips">' + ['Sim', 'Não'].map((v) => '<button class="chip ' + (f.ativo === v ? 'on' : '') + '" data-a="fAtivo" data-v="' + v + '">' + (v === 'Sim' ? 'Ativo' : 'Inativo') + '</button>').join('') + '</div></div>'
        + '<label class="campo"><span class="cinza">Meses sem cobrança</span><input data-c="folha.sem" value="' + esc(f.sem) + '" placeholder="Ex.: 7,12"></label>'
        + '<label class="campo"><span class="cinza">Observação</span><input data-c="folha.obs" value="' + esc(f.obs) + '"></label>'
        + '<p class="dica">O valor novo vale para o mês atual e os próximos (os meses fechados não mudam). Se a conta muda só num mês, use <b>Valores do mês</b>.</p>'
        + '<div class="botoes"><button class="btn" data-a="salvarEditConta">Salvar</button><button class="btn sec" data-a="fechar">Cancelar</button></div>';
    } else if (f.tipo === 'editAjuste') {
      corpo = '<h2>Valor do mês</h2>'
        + '<label class="campo"><span class="cinza">Mês</span><input type="month" data-c="folha.mes" value="' + esc(f.mes) + '"></label>'
        + '<label class="campo"><span class="cinza">Conta</span><select data-c="folha.conta">' + st.m.contas.map((c) => '<option' + (c['Descrição'] === f.conta ? ' selected' : '') + '>' + esc(c['Descrição']) + '</option>').join('') + '</select></label>'
        + '<label class="campo"><span class="cinza">Valor</span><input inputmode="decimal" data-c="folha.valor" value="' + esc(f.valor) + '" placeholder="0,00"></label>'
        + '<label class="campo"><span class="cinza">Observação</span><input data-c="folha.obs" value="' + esc(f.obs) + '"></label>'
        + '<div class="botoes"><button class="btn" data-a="salvarEditAjuste">Salvar</button><button class="btn sec" data-a="fechar">Cancelar</button>'
        + '<button class="btn perigo-sec" data-a="pedirLimpar" data-v="tbAjustes">Apagar</button></div>';
    } else if (f.tipo === 'editAvulso') {
      corpo = '<h2>Gasto avulso</h2>'
        + '<div class="campo"><span class="cinza">Tipo</span><div class="chips">' + ['Despesa', 'Receita'].map((t) => '<button class="chip ' + (f.tipoAv === t ? 'on' : '') + '" data-a="fTipoAv" data-v="' + t + '">' + t + '</button>').join('') + '</div></div>'
        + '<label class="campo"><span class="cinza">Vencimento</span><input type="date" data-c="folha.venc" value="' + esc(f.venc) + '"></label>'
        + '<label class="campo"><span class="cinza">Descrição</span><input data-c="folha.desc" value="' + esc(f.desc) + '"></label>'
        + '<label class="campo"><span class="cinza">Categoria</span><select data-c="folha.cat">' + opcoesCategorias(f.cat) + '</select></label>'
        + '<label class="campo"><span class="cinza">Credor</span><input data-c="folha.credor" value="' + esc(f.credor) + '"></label>'
        + '<label class="campo"><span class="cinza">Valor</span><input inputmode="decimal" data-c="folha.valor" value="' + esc(f.valor) + '" placeholder="0,00"></label>'
        + '<div class="botoes"><button class="btn" data-a="salvarEditAvulso">Salvar</button><button class="btn sec" data-a="fechar">Cancelar</button>'
        + '<button class="btn perigo-sec" data-a="pedirLimpar" data-v="tbAvulsos">Apagar</button></div>';
    } else if (f.tipo === 'limpar') {
      corpo = '<h2>Apagar ' + esc(f.nome) + '?</h2><p class="dica">A linha fica vazia na planilha (as fórmulas continuam lá). Dá para lançar de novo depois, se precisar.</p>'
        + '<div class="botoes"><button class="btn perigo" data-a="confirmarLimpar">Apagar</button><button class="btn sec" data-a="fechar">Cancelar</button></div>';
    }
    return '<div class="fundo" data-a="fechar"></div><div class="folha" role="dialog" aria-modal="true">' + corpo + '</div>';
  }

  function telaLogin() {
    return '<div class="login"><img src="icon-192.png" alt="" width="96" height="96"><h1>Orçamento Família</h1>'
      + '<p>Entre com a conta Microsoft do OneDrive onde estão as planilhas.</p>'
      + '<button class="btn" data-a="entrar">Entrar com a conta Microsoft</button>'
      + '<button class="btn sec" data-a="demo">Ver demonstração</button></div>';
  }

  // Abertura animada (a mesma de index.html, para não "piscar" na troca)
  function telaAbertura(saindo) {
    return '<div class="abertura' + (saindo ? ' sai' : '') + '" role="status" aria-label="Abrindo o Orçamento Família">'
      + '<div class="ab-luz"></div>'
      + '<div class="ab-cena"><span class="ab-brilho b1"></span><span class="ab-brilho b2"></span><span class="ab-brilho b3"></span>'
      + '<div class="ab-moeda"><div class="ab-gira"><img src="icone-moeda.svg" alt="" width="132" height="132"></div></div><div class="ab-sombra"></div>'
      + '<div class="ab-barras"><i></i><i></i><i></i><i></i></div></div>'
      + '<h1 class="ab-tit">Orçamento <span>Família</span></h1>'
      + '<div class="ab-frases"><span>Abrindo o cofre…</span><span>Somando receitas e despesas…</span><span>Conferindo os envelopes…</span><span>Quase pronto…</span></div>'
      + '<div class="ab-prog"><i></i></div></div>';
  }

  function desenhar() {
    const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.c : null;
    let html;
    if (st.modo === 'login') html = telaLogin();
    else if (!st.m && st.erro && !st.carregando) html = '<div class="login"><img src="icon-192.png" alt="" width="88" height="88"><p>' + esc(st.erro) + '</p><button class="btn" data-a="atualizar">Tentar de novo</button></div>';
    else if (!st.m || st.abertura === true) {
      // abertura já na tela (inclusive a de index.html): não redesenha, senão a animação recomeça
      if ($app.querySelector('.abertura:not(.sai)') && !st.aviso) return;
      html = telaAbertura(false);
    } else {
      const t = { inicio: telaInicio, contas: telaContas, lancar: telaLancar, cartoes: telaCartoes, orcamento: telaOrcamento, mais: telaMais }[st.aba]();
      html = '<main class="rolagem' + (st.abertura === 'saindo' ? ' entra' : '') + '">' + t + '</main>' + (st.aba === 'lancar' ? '' : navegacao()) + folha();
    }
    // na saída, a mesma abertura que estava na tela esmaece por cima das telas (sem recomeçar a animação)
    const velha = st.abertura === 'saindo' ? $app.querySelector('.abertura') : null;
    if (st.carregando && st.m && !st.abertura) html +='<div class="carregando" role="status"><span class="giro"></span>Conversando com a planilha…</div>';
    if (st.aviso) html += '<div class="aviso" role="status">' + esc(st.aviso) + '</div>';
    const rol = $app.querySelector('.rolagem');
    const topo = rol ? rol.scrollTop : 0;
    const mesmaAba = desenhar.ultima === st.aba;
    $app.innerHTML = html;
    if (velha) { velha.classList.add('sai'); $app.appendChild(velha); }
    desenhar.ultima = st.aba;
    const nova = $app.querySelector('.rolagem');
    if (nova && mesmaAba) nova.scrollTop = topo;
    if (foco) { const el = $app.querySelector('[data-c="' + foco + '"]'); if (el) el.focus(); }
  }

  // ---------- campos ----------
  function campo(el) {
    const caminho = el.dataset.c.split('.');
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (caminho[0] === 'of' && (caminho[1] === 'sel' || caminho[1] === 'cat')) {
      st.of.itens[Number(caminho[2])][caminho[1]] = v; return false;
    }
    if (caminho[0] === 'envv') { st.envv[caminho[1]] = v; return false; }
    if (!st[caminho[0]]) return false;
    st[caminho[0]][caminho[1]] = v;
    if (caminho.join('.') === 'of.servidor') { localStorage.setItem('ofServidor', v); return true; }
    if (caminho.join('.') === 'lanc.mensal') { if (v) st.lanc.parcelas = 1; return true; }
    return ['lanc.data', 'lanc.cat', 'lanc.valor'].includes(caminho.join('.'));
  }
  $app.addEventListener('input', (e) => { if (e.target.dataset.c && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'date') campo(e.target); });
  // Campo de digitar: o "change" chega quando o teclado fecha, no mesmo toque do botão Salvar.
  // Redesenhar na hora apagaria o botão antes do clique (o toque se perdia). Por isso espera um pouco.
  const ehTexto = (el) => el.tagName === 'INPUT' && !['checkbox', 'date', 'month'].includes(el.type);
  $app.addEventListener('change', (e) => {
    if (!e.target.dataset.c || !campo(e.target)) return;
    if (ehTexto(e.target)) { clearTimeout(desenhar.adiado); desenhar.adiado = setTimeout(desenhar, 400); } else desenhar();
  });

  // ---------- ações ----------
  function lancamentoDe(item, tipo) {
    const cat = st.m.categorias.find((c) => c.Categoria === item.categoria);
    if (tipo === 'receber') return 'Entrada';
    if (item.parcela === 'Fatura') return 'Pagamento fatura';
    if (cat && /Aplica/i.test(cat.Natureza || '')) return 'Aplicação';
    return 'Saída';
  }
  function abrirFolha(tipo, item) {
    const mesmoMes = (s) => s === st.m.mesRef;
    if (item.status === 'Pago' || item.status === 'Recebido' || item.status === 'Parcial') {
      const doMes = st.m.fluxo.filter((x) => mesmoMes(x['Mês']));
      const l = doMes.filter((x) => x.Compromisso === item.desc || x['Descrição'] === item.desc).pop();
      if (l) st.folha = { tipo: 'desfazer', item, linha: l };
      else {
        // lançado com outro nome: mostra os lançamentos do mês da mesma categoria para escolher qual apagar
        const cands = doMes.filter((x) => item.categoria && x['Categoria final'] === item.categoria && (tipo !== 'receber' || x.Tipo === 'Entrada'));
        if (!cands.length) { avisar('Não achei no Fluxo deste mês um lançamento de ' + item.desc + '. Desfaça pela planilha.'); return; }
        st.folha = { tipo: 'escolherDesfazer', item, cands };
      }
    } else {
      const venc = typeof (item.venc || item.data) === 'number' ? Dados.deSerie(item.venc || item.data) : hoje;
      const d = venc > hoje ? hoje : venc;
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      st.folha = { tipo, item, valor: brl(item.valor != null ? item.valor : item.previsto), data: iso, lancTipo: lancamentoDe(item, tipo) };
    }
    desenhar();
  }

  const acoes = {
    aba: (d) => { st.aba = d.v; if (d.s) st.sub = d.s; else if (d.v === 'contas' && !d.s) st.sub = st.sub || 'pagar'; desenhar(); },
    sub: (d) => { st.sub = d.v; desenhar(); },
    atualizar: () => recarregar(),
    mes: async (d) => {
      const x = mesDaSerie(st.m.mesRef);
      const novo = Dados.paraSerie(new Date(x.ano, x.mes + Number(d.d), 1));
      if (Dados.modo === 'demo') { avisar('Na demonstração o mês fica em ' + MESES[x.mes] + '.'); return; }
      st.orcMes = null; st.fat.idx = null;
      await gravar(() => Dados.mudarMes(novo), 'Mês de referência: ' + nomeMes(novo));
    },
    pagar: (d) => abrirFolha('pagar', st.m.pagar[Number(d.i)]),
    receber: (d) => abrirFolha('receber', st.m.receber[Number(d.i)]),
    fechar: () => { st.folha = null; desenhar(); },
    confirmar: () => {
      const f = st.folha, it = f.item;
      const valor = numBR(f.valor);
      if (!valor) { avisar('Informe o valor.'); return; }
      const linha = { Data: serieISO(f.data), Tipo: f.lancTipo, 'Descrição': it.desc, Categoria: f.lancTipo === 'Pagamento fatura' ? '' : (it.categoria || ''),
        Compromisso: f.tipo === 'pagar' ? it.desc : '', Envelope: '', Valor: valor };
      st.folha = null;
      gravar(() => Dados.adicionar('tbFluxo', linha), (f.tipo === 'pagar' ? 'Pago: ' : 'Recebido: ') + it.desc,
        () => { it.status = f.tipo === 'pagar' ? 'Pago' : 'Recebido'; });
    },
    escolherLinha: (d) => { const f = st.folha; st.folha = { tipo: 'desfazer', item: f.item, linha: f.cands[Number(d.i)] }; desenhar(); },
    confirmarDesfazer: () => {
      const f = st.folha; st.folha = null;
      gravar(() => Dados.apagar('tbFluxo', f.linha._i), 'Lançamento apagado.', () => { f.item.status = f.item.recebido !== undefined ? 'A receber' : 'Pendente'; });
    },
    abrirConta: (d) => { st.folha = { tipo: 'conta', i: Number(d.i), modo: 'saldo', valor: '', desc: '' }; desenhar(); },
    modoConta: (d) => { st.folha.modo = d.v; desenhar(); },
    salvarConta: () => {
      const f = st.folha, c = st.m.contasBanco[f.i], valor = numBR(f.valor);
      if (!valor && !(f.modo === 'saldo' && String(f.valor).trim() !== '')) { avisar('Informe o valor.'); return; }
      const tipo = f.modo === 'saldo' ? 'Saldo informado' : f.modo;
      const linha = { Data: serieAgora(), Conta: c.Conta, Tipo: tipo, 'Descrição': f.modo === 'saldo' ? 'Saldo do app do banco' : f.desc.trim(), Valor: valor };
      const msg = f.modo === 'saldo' ? 'Saldo de ' + c.Conta + ' atualizado.' : (tipo === 'Entrada' ? 'Entrada' : 'Saída') + ' salva em ' + c.Conta + '.';
      st.folha = null;
      gravar(() => Dados.adicionar('tbMovContas', linha), msg, () => {
        st.m.movContas.push(linha);
        c['Saldo atual'] = f.modo === 'saldo' ? valor : (Number(c['Saldo atual']) || 0) + (tipo === 'Saída' ? -valor : valor);
        if (f.modo === 'saldo') c['Data do saldo'] = linha.Data;
      });
    },
    cartao: (d) => { st.fat.cartao = d.v; st.fat.filtro = 'Todos'; desenhar(); },
    fatmes: (d) => { st.fat.idx += Number(d.d); desenhar(); },
    filtro: (d) => { st.fat.filtro = d.v; desenhar(); },
    orcmes: (d) => { st.orcMes = Number(d.v); desenhar(); },
    forma: (d) => { st.lanc.forma = d.v; desenhar(); },
    lt: (d) => { st.lanc.tipo = d.v; desenhar(); },
    lc: (d) => { st.lanc.cartao = d.v; desenhar(); },
    modoValor: (d) => { st.lanc.modoValor = d.v; desenhar(); },
    // ----- corrigir/apagar compra no cartão -----
    editCompra: (d) => {
      const x = st.m.compras.find((c) => c._i === Number(d.i));
      if (!x) return;
      st.folha = { tipo: 'editCompra', i: x._i, cartao: x['Cartão'], desc: x['Descrição'] || '', data: isoDe(x.Data), valor: brl(Number(x['Valor parcela']) || 0),
        parcelas: x.Parcelas === 'Mensal' ? 1 : (Number(x.Parcelas) || 1), mensal: x.Parcelas === 'Mensal', cat: x.Categoria || '', nome: x['Descrição'] };
      desenhar();
    },
    fParc: (d) => { const f = st.folha; f.mensal = false; f.parcelas = Math.max(1, Math.min(48, (parseInt(f.parcelas, 10) || 1) + Number(d.d))); desenhar(); },
    dividirCompra: () => {
      const f = st.folha, n = parseInt(f.parcelas, 10) || 1;
      if (f.mensal || n <= 1) { avisar('Só dá para dividir uma compra parcelada.'); return; }
      f.valor = brl(Math.round((numBR(f.valor) / n) * 100) / 100); desenhar();
      avisar('Valor dividido em ' + n + ' parcelas. Confira e toque em Salvar.');
    },
    salvarCompra: () => {
      const f = st.folha, x = st.m.compras.find((c) => c._i === f.i);
      if (!x) return;
      const valor = numBR(f.valor), parcelas = f.mensal ? 'Mensal' : (parseInt(f.parcelas, 10) || 1), data = serieISO(f.data);
      if (!f.desc.trim() || !f.cat || !String(f.valor).trim() || !f.data) { avisar('Preencha descrição, data, valor e categoria.'); return; }
      const mud = {};
      if (f.desc.trim() !== String(x['Descrição'] || '').trim()) mud['Descrição'] = f.desc.trim();
      if (data !== Math.floor(Number(x.Data) || 0)) mud.Data = data;
      if (Math.round(valor * 100) !== Math.round((Number(x['Valor parcela']) || 0) * 100)) mud['Valor parcela'] = valor;
      if (String(parcelas) !== String(x.Parcelas)) mud.Parcelas = parcelas;
      if (f.cat !== x.Categoria) mud.Categoria = f.cat;
      if (!Object.keys(mud).length) { st.folha = null; avisar('Nada mudou.'); return; }
      st.folha = null;
      gravar(() => Dados.alterar('tbCartao', x._i, mud), 'Compra corrigida.');
    },
    parc: (d) => { st.lanc.mensal = false; st.lanc.parcelas = Math.max(1, Math.min(48, st.lanc.parcelas + Number(d.d))); desenhar(); },
    salvarLanc: () => {
      const l = st.lanc, valor = numBR(l.valor);
      if (!valor) { avisar('Informe o valor.'); return; }
      if (!l.desc.trim()) { avisar('Informe a descrição.'); return; }
      if (!l.cat && !(l.forma === 'pix' && l.tipo === 'Pagamento fatura')) { avisar('Escolha a categoria.'); return; }
      const limpar = () => { st.lanc = { ...st.lanc, valor: '', desc: '', comp: '', parcelas: 1, mensal: false, modoValor: 'total' }; st.aba = 'inicio'; };
      if (l.forma === 'cartao') {
        const linha = { Data: serieISO(l.data), 'Descrição': l.desc.trim(), 'Cartão': l.cartao, 'Valor parcela': valorParcela(l),
          Parcelas: l.mensal ? 'Mensal' : l.parcelas, Categoria: l.cat, Envelope: '', 'Ajuste 1ª fatura': '' };
        gravar(() => Dados.adicionar('tbCartao', linha), 'Compra salva no Cartão.', null).then((ok) => { if (ok) { limpar(); desenhar(); } });
      } else {
        const linha = { Data: serieISO(l.data), Tipo: l.tipo, 'Descrição': l.desc.trim(), Categoria: l.cat, Compromisso: l.comp, Envelope: '', Valor: valor };
        gravar(() => Dados.adicionar('tbFluxo', linha), 'Lançamento salvo no Fluxo.', null).then((ok) => { if (ok) { limpar(); desenhar(); } });
      }
    },
    abrir: (d) => { st.aberto = st.aberto === d.v ? '' : d.v; desenhar(); if (st.aberto === 'lembretes') lbVerificar(); },
    lbAtivar: async () => {
      const lb = st.lb;
      try {
        // o pedido de permissão precisa vir logo no toque (regra do iPhone)
        const perm = await Notification.requestPermission();
        lb.perm = perm;
        if (perm !== 'granted') { desenhar(); avisar('Sem permissão, não dá para mandar notificações.'); return; }
        lb.ocupado = true; lb.info = ''; desenhar();
        const srv = window.APP_CONFIG.lembretes.replace(/\/$/, '');
        const chave = await (await fetch(srv + '/vapid')).text();
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) }));
        const r = await lbApi('/subscribe', { subscription: sub.toJSON(), aparelho: /iPhone/.test(navigator.userAgent) ? 'iPhone' : navigator.platform || 'aparelho' });
        lb.inscrito = true; lb.info = r.aparelhos + (r.aparelhos === 1 ? ' aparelho recebe' : ' aparelhos recebem') + ' os lembretes.';
        avisar('Lembretes ligados. Toque em "Mandar um teste agora" para ver como chega.');
      } catch (e) { avisar('Não deu para ligar: ' + (e.message || e)); }
      lb.ocupado = false; desenhar();
    },
    lbTeste: async () => {
      const lb = st.lb;
      lb.ocupado = true; desenhar();
      try {
        const r = await lbApi('/test');
        if (r.erro === 'SEM_LOGIN') lb.info = 'O servidor precisa entrar na conta Microsoft (link do servidor /auth/login).';
        else if (r.erro) lb.info = 'Erro no servidor: ' + r.erro;
        else lb.info = 'Teste enviado para ' + r.entregues + ' de ' + r.aparelhos + ' aparelho(s). Hoje: ' + r.hoje + ' conta(s) vencendo, ' + r.atraso + ' em atraso.' + (r.erros && r.erros.length ? ' Falhas: ' + r.erros.join('; ') : '');
      } catch (e) { lb.info = 'Não deu: ' + (e.message || e); }
      lb.ocupado = false; desenhar();
    },
    lbDesativar: async () => {
      const lb = st.lb;
      lb.ocupado = true; desenhar();
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await lbApi('/unsubscribe', { subscription: sub.toJSON() }).catch(() => {}); await sub.unsubscribe(); }
        lb.inscrito = false; lb.info = '';
        avisar('Lembretes desligados neste aparelho.');
      } catch (e) { avisar('Não deu: ' + (e.message || e)); }
      lb.ocupado = false; desenhar();
    },
    ano: (d) => { Dados.trocarAno(d.v); st.m = null; st.orcMes = null; st.fat.idx = null; recarregar(); },
    entrar: () => { Dados.usarDemo(false); Dados.entrar(); },
    sair: () => Dados.sair(),
    demo: () => { Dados.usarDemo(Dados.modo !== 'demo'); location.reload(); },
    ativo: (d) => gravar(() => Dados.alterar('tbContas', Number(d.i), { Ativo: d.v }), d.v === 'Sim' ? 'Conta ativada.' : 'Conta desativada.'),
    salvarAjuste: () => {
      const a = st.aj, valor = numBR(a.valor);
      if (!a.conta || !valor || !a.mes) { avisar('Preencha mês, conta e valor.'); return; }
      const [ano, mes] = a.mes.split('-').map(Number);
      gravar(() => Dados.adicionar('tbAjustes', { 'Mês': Dados.paraSerie(new Date(ano, mes - 1, 1)), Conta: a.conta, Valor: valor, 'Observação': a.obs }),
        'Valor do mês salvo.').then((ok) => { if (ok) st.aj = { ...st.aj, conta: '', valor: '', obs: '' }; desenhar(); });
    },
    // ----- aba Mais: filtros -----
    fxTipo: (d) => { st.fx.tipo = d.v; desenhar(); },
    fxAtivas: () => { st.fx.ativas = !st.fx.ativas; desenhar(); },
    avTodos: (d) => { st.avTodos = d.v === '1'; desenhar(); },
    // ----- contas fixas -----
    editConta: (d) => {
      const c = st.m.contas.find((x) => x._i === Number(d.i));
      if (!c) return;
      st.folha = { tipo: 'editConta', i: c._i, valor: typeof c.Valor === 'number' ? brl(c.Valor) : '', dia: c.Dia === '' ? '' : String(c.Dia),
        credor: c.Credor || '', ativo: c.Ativo === 'Não' ? 'Não' : 'Sim', sem: c['Meses sem cobrança'] == null ? '' : String(c['Meses sem cobrança']), obs: c['Observação'] || '' };
      desenhar();
    },
    fAtivo: (d) => { st.folha.ativo = d.v; desenhar(); },
    salvarEditConta: () => {
      const f = st.folha, c = st.m.contas.find((x) => x._i === f.i);
      if (!c) return;
      const mud = {};
      const valor = numBR(f.valor);
      if (String(f.valor).trim() === '') { avisar('Informe o valor.'); return; }
      if (Math.round(valor * 100) !== Math.round((Number(c.Valor) || 0) * 100)) mud.Valor = valor;
      const dia = Number(String(f.dia).trim());
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) { avisar('O dia precisa ser de 1 a 31.'); return; }
      if (dia !== Number(c.Dia)) mud.Dia = dia;
      if (f.credor.trim() !== String(c.Credor || '').trim()) mud.Credor = f.credor.trim();
      if (f.ativo !== (c.Ativo === 'Não' ? 'Não' : 'Sim')) mud.Ativo = f.ativo;
      const sem = String(f.sem).replace(/\s/g, '');
      if (sem && !/^\d{1,2}(,\d{1,2})*$/.test(sem)) { avisar('Meses sem cobrança: números separados por vírgula, ex.: 7,12'); return; }
      // vai como texto (com apóstrofo) para o Excel não ler "7,12" como número
      if (sem !== String(c['Meses sem cobrança'] == null ? '' : c['Meses sem cobrança']).replace(/\s/g, '')) mud['Meses sem cobrança'] = sem && Dados.modo !== 'demo' ? "'" + sem : sem;
      if (f.obs.trim() !== String(c['Observação'] || '').trim()) mud['Observação'] = f.obs.trim();
      if (!Object.keys(mud).length) { st.folha = null; avisar('Nada mudou.'); return; }
      st.folha = null;
      gravar(() => Dados.alterar('tbContas', c._i, mud), c['Descrição'] + ' atualizada.');
    },
    // ----- valores do mês -----
    editAjuste: (d) => {
      const a = st.m.ajustes.find((x) => x._i === Number(d.i));
      if (!a) return;
      st.folha = { tipo: 'editAjuste', i: a._i, mes: isoDe(a['Mês']).slice(0, 7), conta: a.Conta, valor: typeof a.Valor === 'number' ? brl(a.Valor) : '', obs: a['Observação'] || '', nome: a.Conta + ' de ' + (typeof a['Mês'] === 'number' ? MESES[mesDaSerie(a['Mês']).mes] : '') };
      desenhar();
    },
    salvarEditAjuste: () => {
      const f = st.folha, a = st.m.ajustes.find((x) => x._i === f.i);
      if (!a) return;
      if (!f.mes || !f.conta || String(f.valor).trim() === '') { avisar('Preencha mês, conta e valor.'); return; }
      const [ano, mes] = f.mes.split('-').map(Number);
      const serie = Dados.paraSerie(new Date(ano, mes - 1, 1)), valor = numBR(f.valor), mud = {};
      if (serie !== a['Mês']) mud['Mês'] = serie;
      if (f.conta !== a.Conta) mud.Conta = f.conta;
      if (Math.round(valor * 100) !== Math.round((Number(a.Valor) || 0) * 100)) mud.Valor = valor;
      if (f.obs.trim() !== String(a['Observação'] || '').trim()) mud['Observação'] = f.obs.trim();
      if (!Object.keys(mud).length) { st.folha = null; avisar('Nada mudou.'); return; }
      st.folha = null;
      gravar(() => Dados.alterar('tbAjustes', a._i, mud), 'Valor do mês atualizado.');
    },
    // ----- gastos avulsos -----
    editAvulso: (d) => {
      const a = st.m.avulsos.find((x) => x._i === Number(d.i));
      if (!a) return;
      st.folha = { tipo: 'editAvulso', i: a._i, tipoAv: a.Tipo || 'Despesa', venc: isoDe(a.Vencimento), desc: a['Descrição'] || '', cat: a.Categoria || '',
        credor: a.Credor || '', valor: typeof a.Valor === 'number' ? brl(a.Valor) : '', nome: a['Descrição'] };
      desenhar();
    },
    fTipoAv: (d) => { st.folha.tipoAv = d.v; desenhar(); },
    salvarEditAvulso: () => {
      const f = st.folha, a = st.m.avulsos.find((x) => x._i === f.i);
      if (!a) return;
      if (!f.desc.trim() || !f.cat || String(f.valor).trim() === '' || !f.venc) { avisar('Preencha vencimento, descrição, categoria e valor.'); return; }
      const valor = numBR(f.valor), venc = serieISO(f.venc), mud = {};
      if (f.tipoAv !== a.Tipo) mud.Tipo = f.tipoAv;
      if (venc !== a.Vencimento) mud.Vencimento = venc;
      if (f.desc.trim() !== String(a['Descrição'] || '').trim()) mud['Descrição'] = f.desc.trim();
      if (f.cat !== a.Categoria) mud.Categoria = f.cat;
      if (f.credor.trim() !== String(a.Credor || '').trim()) mud.Credor = f.credor.trim();
      if (Math.round(valor * 100) !== Math.round((Number(a.Valor) || 0) * 100)) mud.Valor = valor;
      if (!Object.keys(mud).length) { st.folha = null; avisar('Nada mudou.'); return; }
      st.folha = null;
      gravar(() => Dados.alterar('tbAvulsos', a._i, mud), 'Gasto avulso atualizado.');
    },
    pedirLimpar: (d) => { st.folha = { tipo: 'limpar', tabela: d.v, i: st.folha.i, nome: st.folha.nome }; desenhar(); },
    confirmarLimpar: () => {
      const f = st.folha; st.folha = null;
      gravar(() => Dados.limpar(f.tabela, f.i), 'Apagado.');
    },
    // ----- limites dos envelopes -----
    envMes: (d) => { st.envMes = (st.envMes + Number(d.d) + 12) % 12; desenhar(); },
    descartarEnvs: () => { st.envv = {}; desenhar(); },
    salvarEnvs: () => {
      const mes = st.envMes, col = ABREV[mes];
      const lista = st.m.envelopesCfg.filter((e) => envAlterado(e, mes));
      if (!lista.length) { avisar('Nenhum limite mudou em ' + MESES[mes] + '.'); return; }
      gravar(async () => {
        for (const e of lista) await Dados.alterar('tbEnvelopes', e._i, { [col]: Math.round(numBR(st.envv[mes + '_' + e._i]) * 100) / 100 });
      }, lista.length === 1 ? 'Limite de ' + lista[0].Envelope + ' salvo.' : lista.length + ' limites salvos.').then((ok) => {
        if (ok) lista.forEach((e) => { delete st.envv[mes + '_' + e._i]; });
        desenhar();
      });
    },
    avtipo: (d) => { st.av.tipo = d.v; desenhar(); },
    salvarAvulso: () => {
      const a = st.av, valor = numBR(a.valor);
      if (!a.desc || !a.cat || !valor) { avisar('Preencha descrição, categoria e valor.'); return; }
      gravar(() => Dados.adicionar('tbAvulsos', { Tipo: a.tipo, Vencimento: serieISO(a.venc), 'Descrição': a.desc, Categoria: a.cat, Credor: '', Valor: valor }),
        'Gasto avulso salvo.', null).then(() => { st.av = { ...st.av, desc: '', valor: '' }; desenhar(); });
    },
    ofBuscar: async () => {
      const of = st.of;
      of.buscando = true; desenhar();
      try {
        const desde = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().slice(0, 10);
        const r = await fetch(of.servidor.replace(/\/$/, '') + '/transactions?since=' + desde);
        if (!r.ok) throw new Error('servidor respondeu ' + r.status);
        const j = await r.json();
        const ja = JSON.parse(localStorage.getItem('ofImportados') || '[]');
        const nomes = st.m.cartoes.map((c) => c['Cartão']);
        of.itens = (j.transactions || []).filter((t) => !ja.includes(t.id)).map((t) => {
          const cartao = t.source && t.source.type === 'credit_card' && nomes.includes(t.source.name) ? t.source.name : '';
          return { ...t, sel: true, cat: '', cartao, destino: cartao ? 'Cartão ' + cartao : (t.amount < 0 ? 'Fluxo · Saída' : 'Fluxo · Entrada') };
        });
        if (!of.itens.length) avisar('Nenhuma transação nova.');
      } catch (e) { avisar('Open Finance: ' + (e.message || e)); }
      of.buscando = false; desenhar();
    },
    ofImportar: async () => {
      const sel = st.of.itens.filter((t) => t.sel);
      if (sel.some((t) => !t.cat)) { avisar('Escolha a categoria de cada transação marcada.'); return; }
      const ja = JSON.parse(localStorage.getItem('ofImportados') || '[]');
      await gravar(async () => {
        for (const t of sel) {
          const data = serieISO(t.date.slice(0, 10)), v = Math.abs(t.amount);
          if (t.cartao) await Dados.adicionar('tbCartao', { Data: data, 'Descrição': t.description, 'Cartão': t.cartao, 'Valor parcela': v, Parcelas: 1, Categoria: t.cat, Envelope: '', 'Ajuste 1ª fatura': '' });
          else await Dados.adicionar('tbFluxo', { Data: data, Tipo: t.amount < 0 ? 'Saída' : 'Entrada', 'Descrição': t.description, Categoria: t.cat, Compromisso: '', Envelope: '', Valor: v });
          ja.push(t.id);
        }
        localStorage.setItem('ofImportados', JSON.stringify(ja));
      }, sel.length + ' transações importadas.', null);
      st.of.itens = st.of.itens.filter((t) => !t.sel); desenhar();
    }
  };
  $app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const fn = acoes[b.dataset.a];
    if (fn) fn(b.dataset, b);
  });

  // volta para o app: relê a planilha se passou mais de 2 minutos
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Dados.modo === 'onedrive' && st.atualizadoEm && Date.now() - st.atualizadoEm > 120000) recarregar(true);
  });

  // Abertura: fica no mínimo ~2 s (para a animação aparecer inteira) e some com um esmaecer suave.
  async function fimAbertura(t0) {
    const falta = 2200 - (Date.now() - t0);
    if (falta > 0) await new Promise((ok) => setTimeout(ok, falta));
    if (!st.m) { st.abertura = false; desenhar(); return; }
    st.abertura = 'saindo'; desenhar();
    setTimeout(() => { st.abertura = false; desenhar(); }, 650);
  }

  (async () => {
    const t0 = Date.now();
    try {
      const r = await Dados.iniciar();
      st.modo = r.modo; st.conta = r.conta;
      if (r.modo === 'login') { st.abertura = false; st.carregando = false; desenhar(); return; }
      await recarregar();
    } catch (e) {
      st.erro = e.message || String(e); st.carregando = false;
    }
    await fimAbertura(t0);
  })();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
