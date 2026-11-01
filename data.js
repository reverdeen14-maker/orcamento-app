// Camada de dados: lê e grava a planilha no OneDrive pela Microsoft Graph (Excel online).
// Sem clientId configurado (ou em "modo demonstração"), usa uma cópia da planilha em demo-data.json.
const Dados = (() => {
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const cfg = window.APP_CONFIG;
  const RANGES = ['Painel!N2', 'Painel!B5:N25', 'Compromissos!B4:M5', 'Compromissos!B9:I80', 'Compromissos!K9:P40',
    'Compromissos!R8:S13', 'Orçamento!B6:P34', 'Orçamento!B37:P187'];
  const TABELAS = ['tbFluxo', 'tbCartao', 'tbContas', 'tbAvulsos', 'tbAjustes', 'tbCategorias', 'tbCartoes', 'tbEnvelopes', 'tbTipos'];

  let cliente = null, conta = null, sessao = null, itemId = null, raw = null, modo = 'demo';
  const calcCache = {};

  // ---------- datas (número de série do Excel) ----------
  const BASE = Date.UTC(1899, 11, 30);
  const paraSerie = (d) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - BASE) / 864e5);
  const deSerie = (n) => { const d = new Date(BASE + n * 864e5); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

  // ---------- login Microsoft ----------
  async function iniciar() {
    const preferirDemo = localStorage.getItem('modoDemo') === '1';
    if (!cfg.clientId || !window.msal || preferirDemo) { modo = 'demo'; return { modo, conta: null }; }
    cliente = new window.msal.PublicClientApplication({
      auth: { clientId: cfg.clientId, authority: 'https://login.microsoftonline.com/consumers',
        redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: 'localStorage' }
    });
    const r = await cliente.handleRedirectPromise();
    conta = (r && r.account) || cliente.getAllAccounts()[0] || null;
    modo = conta ? 'onedrive' : 'login';
    return { modo, conta: conta ? (conta.name || conta.username) : null };
  }
  const entrar = () => cliente.loginRedirect({ scopes: cfg.escopos });
  const sair = () => cliente.logoutRedirect({ account: conta });

  async function token() {
    try {
      return (await cliente.acquireTokenSilent({ scopes: cfg.escopos, account: conta })).accessToken;
    } catch (e) {
      await cliente.acquireTokenRedirect({ scopes: cfg.escopos });
      throw e;
    }
  }

  async function api(metodo, caminho, corpo, tentativa = 0) {
    const h = { Authorization: 'Bearer ' + await token() };
    if (corpo !== undefined) h['Content-Type'] = 'application/json';
    if (sessao) h['workbook-session-id'] = sessao;
    const r = await fetch(GRAPH + caminho, { method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    if ((r.status === 429 || r.status === 503 || r.status === 504) && tentativa < 4) {
      await new Promise((ok) => setTimeout(ok, 1500 * (tentativa + 1)));
      return api(metodo, caminho, corpo, tentativa + 1);
    }
    if (!r.ok) {
      const txt = await r.text();
      if (sessao && /session/i.test(txt) && tentativa < 1) { sessao = null; await abrirSessao(); return api(metodo, caminho, corpo, tentativa + 1); }
      throw new Error('Erro ' + r.status + ' da Microsoft: ' + txt.slice(0, 300));
    }
    return r.status === 204 ? null : r.json();
  }

  const planilha = () => cfg.planilhas.find((p) => String(p.ano) === localStorage.getItem('ano')) || cfg.planilhas[0];
  const wb = () => '/me/drive/items/' + itemId + '/workbook';
  const folha = (s) => "/worksheets('" + encodeURIComponent(s) + "')";

  async function abrirSessao() {
    if (!itemId) {
      const p = planilha();
      itemId = (await api('GET', '/me/drive/root:/' + encodeURIComponent(p.caminho) + '?$select=id')).id;
    }
    sessao = (await api('POST', wb() + '/createSession', { persistChanges: true })).id;
  }

  async function lerRange(endereco) {
    const [s, a] = endereco.split('!');
    return (await api('GET', wb() + folha(s) + "/range(address='" + a + "')?$select=values")).values;
  }
  async function lerTabela(nome) {
    const r = await api('GET', wb() + "/tables('" + nome + "')/range?$select=values,address");
    return { address: r.address, values: r.values };
  }

  // várias leituras ao mesmo tempo, poucas por vez
  async function emLotes(itens, fn, n = 3) {
    const out = new Array(itens.length);
    let k = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (k < itens.length) { const i = k++; out[i] = await fn(itens[i]); }
    }));
    return out;
  }

  // ---------- carregar tudo ----------
  async function carregar() {
    if (modo === 'demo') {
      if (!raw) {
        const r = await fetch('demo-data.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('Demonstração indisponível aqui. Ligue o app à sua conta Microsoft (LEIAME.md, parte 1).');
        raw = await r.json();
      }
      return montarModelo(raw);
    }
    if (!sessao) await abrirSessao();
    const rs = await emLotes(RANGES, lerRange);
    const ts = await emLotes(TABELAS, lerTabela);
    raw = { ranges: {}, tables: {} };
    RANGES.forEach((a, i) => { raw.ranges[a] = rs[i]; });
    TABELAS.forEach((t, i) => { raw.tables[t] = ts[i]; });
    try { localStorage.setItem('ultimoRaw', JSON.stringify(raw)); localStorage.setItem('ultimoRawEm', new Date().toISOString()); } catch (e) { /* cheio */ }
    return montarModelo(raw);
  }
  function ultimoSalvo() {
    try { const r = JSON.parse(localStorage.getItem('ultimoRaw')); return r ? montarModelo(r) : null; } catch (e) { return null; }
  }

  // ---------- gravar ----------
  async function colunasCalculadas(tabela) {
    if (calcCache[tabela]) return calcCache[tabela];
    const r = await api('GET', wb() + "/tables('" + tabela + "')/rows/itemAt(index=0)/range?$select=formulas");
    calcCache[tabela] = r.formulas[0].map((f) => typeof f === 'string' && f.startsWith('='));
    return calcCache[tabela];
  }
  // Monta a linha só com as colunas de digitar; as calculadas vão como null (o Excel preenche).
  function linhaPara(tabela, obj, calc) {
    const cab = raw.tables[tabela].values[0];
    return cab.map((h, i) => (calc && calc[i]) ? null : (h in obj ? obj[h] : ''));
  }

  async function adicionar(tabela, obj) {
    if (modo === 'demo') {
      const cab = raw.tables[tabela].values[0];
      raw.tables[tabela].values.push(cab.map((h) => (h in obj ? obj[h] : '')));
      return;
    }
    const calc = await colunasCalculadas(tabela);
    const linha = linhaPara(tabela, obj, calc);
    // reaproveita a primeira linha vazia da tabela, se houver
    const vals = raw.tables[tabela].values;
    const entradas = calc.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    const vazia = vals.slice(1).findIndex((r) => entradas.every((i) => r[i] === '' || r[i] === null));
    if (vazia >= 0) {
      await api('PATCH', wb() + "/tables('" + tabela + "')/rows/itemAt(index=" + vazia + ')/range', { values: [linha] });
    } else {
      await api('POST', wb() + "/tables('" + tabela + "')/rows/add", { values: [linha] });
    }
  }

  async function alterar(tabela, indice, campos) {
    if (modo === 'demo') {
      const cab = raw.tables[tabela].values[0];
      Object.entries(campos).forEach(([k, v]) => { raw.tables[tabela].values[indice + 1][cab.indexOf(k)] = v; });
      return;
    }
    const cab = raw.tables[tabela].values[0];
    const linha = cab.map((h) => (h in campos ? campos[h] : null));
    await api('PATCH', wb() + "/tables('" + tabela + "')/rows/itemAt(index=" + indice + ')/range', { values: [linha] });
  }

  async function apagar(tabela, indice) {
    if (modo === 'demo') { raw.tables[tabela].values.splice(indice + 1, 1); return; }
    await api('DELETE', wb() + "/tables('" + tabela + "')/rows/itemAt(index=" + indice + ')');
  }

  async function mudarMes(serie) {
    if (modo === 'demo') return false;
    await api('PATCH', wb() + folha('Painel') + "/range(address='N2')", { values: [[serie]] });
    return true;
  }

  function trocarAno(ano) { localStorage.setItem('ano', String(ano)); itemId = null; sessao = null; raw = null; }
  function usarDemo(sim) { localStorage.setItem('modoDemo', sim ? '1' : '0'); }

  // ---------- modelo para as telas ----------
  function tabela(r, nome) {
    const v = (r.tables[nome] || { values: [[]] }).values;
    const cab = v[0];
    return v.slice(1).map((linha, i) => {
      const o = { _i: i };
      cab.forEach((h, k) => { o[h] = linha[k]; });
      return o;
    }).filter((o) => cab.some((h) => o[h] !== '' && o[h] !== null));
  }
  const num = (x) => (typeof x === 'number' ? x : 0);
  // O Excel online escreve milhar com vírgula ("R$ 8,848"); volta para o jeito brasileiro ("R$ 8.848").
  const txt = (s) => String(s == null ? '' : s).replace(/(\d),(\d{3})(?!\d)/g, '$1.$2').replace(/(\d),(\d{3})(?!\d)/g, '$1.$2');

  function montarModelo(r) {
    const R = r.ranges;
    const P = R['Painel!B5:N25'];
    const C = R['Compromissos!B4:M5'][1];
    const mesRef = R['Painel!N2'][0][0];
    const envelopes = [];
    for (let k = 11; k < P.length && P[k][0] && P[k][0] !== 'Total'; k++) {
      // Envelope sem limite e sem gasto no mês (ex.: Aniversário Miguel fora de nov/dez) não aparece.
      if (!num(P[k][1]) && !num(P[k][2])) continue;
      envelopes.push({ nome: P[k][0], limite: num(P[k][1]), gasto: num(P[k][2]), restante: num(P[k][3]), uso: num(P[k][4]) });
    }
    const pagar = R['Compromissos!B9:I80'].filter((x) => x[1] !== '' && typeof x[5] === 'number')
      .map((x) => ({ venc: x[0], desc: x[1], parcela: x[2], categoria: x[3], credor: x[4], valor: x[5], status: x[6], prazo: x[7] }));
    const receber = R['Compromissos!K9:P40'].filter((x) => x[1] !== '' && typeof x[3] === 'number')
      .map((x) => ({ data: x[0], desc: x[1], categoria: x[2], previsto: x[3], recebido: num(x[4]), status: x[5] }));
    const M = R['Compromissos!R8:S13'];
    const O = R['Orçamento!B6:P34'];
    const linhaO = (row) => O[row - 6].slice(3, 15).map(num);
    const nomesGrupos = ['Habitação', 'Renegociação Dívidas', 'Saúde', 'Transporte', 'Despesas Pessoais', 'Miguel', 'Lazer', 'Outros',
      'Despesas Temporárias / Variáveis'];
    const grupos = R['Orçamento!B37:P187'].filter((x) => nomesGrupos.includes(x[0]))
      .map((x) => ({ nome: x[0] === 'Despesas Temporárias / Variáveis' ? 'Variáveis' : x[0], valores: x.slice(3, 15).map(num) }));

    return {
      modo, geradoEm: r.geradoEm || null, mesRef,
      painel: {
        receitas: num(P[1][0]), despesas: num(P[1][1]), sobra: num(P[1][3]), saldo: num(P[1][6]), faturas: num(P[1][9]),
        caixinha: num(P[1][12]), txtSobra: txt(P[2][3]), txtSaldo: txt(P[2][6]), txtFaturas: txt(P[2][9]), txtCaixinha: txt(P[2][12]),
        aPagar: num(P[5][0]), atrasado: num(P[5][1]), faltaReceber: num(P[5][3]), txtAPagar: txt(P[6][0]), txtAtraso: txt(P[6][1]), txtReceber: txt(P[6][3])
      },
      envelopes,
      compromissos: { total: num(C[3]), pago: num(C[4]), pendente: num(C[5]), atrasado: num(C[6]), aindaGastar: num(C[7]),
        previsto: num(C[9]), recebido: num(C[10]), falta: num(C[11]) },
      pagar, receber,
      mesada: { mesada: num(M[1][1]), cartao: num(M[2][1]), sobra: num(M[3][1]), sextas: num(M[4][1]), porSexta: num(M[5][1]) },
      orcamento: { meses: O[0].slice(3, 15), anterior: linhaO(10), renda: linhaO(12), aplicacao: linhaO(16), despesas: linhaO(22),
        sobra: linhaO(26), liquido: linhaO(27), taxa: linhaO(33), grupos },
      fluxo: tabela(r, 'tbFluxo'), compras: tabela(r, 'tbCartao'), contas: tabela(r, 'tbContas'), avulsos: tabela(r, 'tbAvulsos'),
      ajustes: tabela(r, 'tbAjustes'), categorias: tabela(r, 'tbCategorias'), cartoes: tabela(r, 'tbCartoes'),
      envelopesCfg: tabela(r, 'tbEnvelopes'), tipos: tabela(r, 'tbTipos').map((t) => t['Tipo de lançamento'])
    };
  }

  return { iniciar, entrar, sair, carregar, ultimoSalvo, adicionar, alterar, apagar, mudarMes, trocarAno, usarDemo,
    paraSerie, deSerie, planilha, get modo() { return modo; } };
})();
