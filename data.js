// Camada de dados: lê e grava a planilha no OneDrive pela Microsoft Graph (Excel online).
// Sem clientId configurado (ou em "modo demonstração"), usa uma cópia da planilha em demo-data.json.
const Dados = (() => {
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const cfg = window.APP_CONFIG;
  const RANGES = ['Painel!N2', 'Painel!B5:N25', 'Compromissos!B4:M5', 'Compromissos!B9:I80', 'Compromissos!K9:P40',
    'Compromissos!R8:S13', 'Orçamento!B6:P34', 'Orçamento!B37:P187'];
  const TABELAS = ['tbFluxo', 'tbCartao', 'tbContas', 'tbAvulsos', 'tbAjustes', 'tbCategorias', 'tbCartoes', 'tbEnvelopes', 'tbTipos',
    'tbContasBanco', 'tbMovContas'];

  let cliente = null, conta = null, sessao = null, itemId = null, raw = null, modo = 'demo', leituraFalhou = false;
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
  // Solta a planilha no Excel Online logo depois de ler; sessão aberta deixa o Excel do PC em "somente leitura".
  async function fecharSessao() {
    if (!sessao) return;
    try { await api('POST', wb() + '/closeSession', {}); } catch (e) { /* já expirou */ }
    sessao = null;
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

  // ---------- correção única da planilha (06/11/2026) ----------
  // Compromissos!O9 (coluna Recebido do "A receber") somava pela CATEGORIA: duas receitas com a mesma categoria
  // (Salário Bianca e Complemento Bianca) contavam o mesmo dinheiro. A fórmula nova confere pelo NOME quando há
  // mais de uma receita da mesma categoria. Só troca se encontrar exatamente a fórmula antiga; roda uma vez por ano/aparelho.
  const O9_NOVA = '=LET(n,INDEX(K9#,,2),c,INDEX(K9#,,3),'
    + 'nc,MMULT(--(c=TRANSPOSE(c)),SEQUENCE(ROWS(c),1,1,0)),'
    + 'pn,SUMIFS(tbFluxo[Valor],tbFluxo[Descrição],n,tbFluxo[Mês],MesRef)'
    + '+SUMIFS(tbFluxo[Valor],tbFluxo[Compromisso],n,tbFluxo[Descrição],"<>"&n,tbFluxo[Mês],MesRef),'
    + 'pc,SUMIFS(tbFluxo[Valor],tbFluxo[Categoria final],c,tbFluxo[Mês],MesRef,tbFluxo[Tipo],"Entrada"),'
    + 'IF((c="Diárias")+(c="Reembolso de terceiros")+(nc>1),pn,pc))';
  async function migrarRecebido() {
    const chave = 'migO9-' + planilha().ano;
    if (localStorage.getItem(chave)) return;
    const end = folha('Compromissos') + "/range(address='O9')";
    const f = String((await api('GET', wb() + end + '?$select=formulas')).formulas[0][0] || '');
    const antiga = /LET\(/i.test(f) && f.includes('tbFluxo[Categoria final]') && !/MMULT/i.test(f);
    if (antiga) {
      await api('PATCH', wb() + end, { formulas: [[O9_NOVA]] });
      // confere: se a fórmula nova não "espalhar" certo (erro ou sem valores), volta a antiga na hora
      const v = (await api('GET', wb() + folha('Compromissos') + "/range(address='O9:O12')?$select=values")).values.map((l) => l[0]);
      const ruim = v.some((x) => typeof x === 'string' && x.startsWith('#')) || typeof v[0] !== 'number';
      if (ruim) { await api('PATCH', wb() + end, { formulas: [[f]] }); localStorage.setItem(chave, 'falhou'); return; }
    }
    localStorage.setItem(chave, antiga ? 'corrigida' : 'ok');
  }

  // ---------- correção única da mesada do Miguel (09/11/2026) ----------
  // Antes: compra no cartão com categoria Mesada Miguel recalculava TODAS as sextas, até as já pagas.
  // Agora: sexta paga fica com o valor pago; o que sobra (limite − cartão − já pago) divide entre as não pagas.
  // Troca só os dois trechos exatos da fórmula de Compromissos!B9 (o resto fica igual) e a célula "Por sexta" (S13).
  let avisoMigracao = '';
  const pegarAvisoMigracao = () => { const a = avisoMigracao; avisoMigracao = ''; return a; };
  const MES_ANT1 = 'mp,ROUND(ms/mn,2),';
  const MES_NOV1 = 'mpg,SUMIFS(tbFluxo[Valor],tbFluxo[Descrição],"Mesada Miguel sexta "&mk,tbFluxo[Mês],m)'
    + '+SUMIFS(tbFluxo[Valor],tbFluxo[Compromisso],"Mesada Miguel sexta "&mk,tbFluxo[Descrição],"<>"&("Mesada Miguel sexta "&mk),tbFluxo[Mês],m),'
    + 'mpt,SUM(mpg),mnu,SUM(--(mpg=0)),mrs,MAX(0,ml-mc-mpt),mp,IF(mnu>0,ROUND(mrs/mnu,2),0),mlu,MAX(IF(mpg=0,mk,0)),';
  const MES_ANT2 = 'IF(mk=mn,ms-mp*(mn-1),mp)';
  const MES_NOV2 = 'IF(mpg>0,mpg,IF(mk=mlu,mrs-mp*(mnu-1),mp))';
  const MES_S13 = '=LET(m,MesRef,k,SEQUENCE(S12),n,"Mesada Miguel sexta "&k,'
    + 'pg,SUMIFS(tbFluxo[Valor],tbFluxo[Descrição],n,tbFluxo[Mês],m)+SUMIFS(tbFluxo[Valor],tbFluxo[Compromisso],n,tbFluxo[Descrição],"<>"&n,tbFluxo[Mês],m),'
    + 'nu,SUM(--(pg=0)),IFERROR(IF(nu>0,ROUND(MAX(0,S9-S10-SUM(pg))/nu,2),0),0))';
  async function migrarMesada() {
    const chave = 'migMesada-' + planilha().ano;
    if (localStorage.getItem(chave)) return;
    const comp = folha('Compromissos');
    const lerF = async (a) => String((await api('GET', wb() + comp + "/range(address='" + a + "')?$select=formulas")).formulas[0][0] || '');
    const f = await lerF('B9');
    const conta = (s, t) => s.split(t).length - 1;
    if (f.includes('mpg,')) { localStorage.setItem(chave, 'ok'); return; }
    if (conta(f, MES_ANT1) !== 1 || conta(f, MES_ANT2) !== 1) {
      localStorage.setItem(chave, 'nao-encontrada');
      avisoMigracao = 'Não consegui ajustar a regra da mesada na planilha (fórmula diferente do esperado). Avise o assistente.';
      return;
    }
    const s13 = await lerF('S13');
    await api('PATCH', wb() + comp + "/range(address='B9')", { formulas: [[f.replace(MES_ANT1, MES_NOV1).replace(MES_ANT2, MES_NOV2)]] });
    await api('PATCH', wb() + comp + "/range(address='S13')", { formulas: [[MES_S13]] });
    // confere: a lista do mês tem que continuar aparecendo (datas na coluna B, valores na G), sem erro
    const v = (await api('GET', wb() + comp + "/range(address='B9:G14')?$select=values")).values;
    const ruim = typeof v[0][0] !== 'number' || v.some((l) => l.some((x) => typeof x === 'string' && x.startsWith('#')));
    if (ruim) {
      await api('PATCH', wb() + comp + "/range(address='B9')", { formulas: [[f]] });
      await api('PATCH', wb() + comp + "/range(address='S13')", { formulas: [[s13]] });
      localStorage.setItem(chave, 'falhou');
      avisoMigracao = 'A regra nova da mesada deu erro na planilha e foi desfeita. Avise o assistente.';
      return;
    }
    localStorage.setItem(chave, 'corrigida');
    avisoMigracao = 'Mesada do Miguel ajustada: sextas já pagas não mudam mais.';
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
    leituraFalhou = true;   // só volta a false se a leitura inteira der certo
    if (!sessao) await abrirSessao();
    let rs, ts;
    try {
      try { await migrarRecebido(); } catch (e) { /* não impede a leitura */ }
      try { await migrarMesada(); } catch (e) { /* não impede a leitura */ }
      rs = await emLotes(RANGES, lerRange);
      ts = await emLotes(TABELAS, lerTabela);
    } finally {
      await fecharSessao();
    }
    raw = { ranges: {}, tables: {} };
    RANGES.forEach((a, i) => { raw.ranges[a] = rs[i]; });
    TABELAS.forEach((t, i) => { raw.tables[t] = ts[i]; });
    leituraFalhou = false;
    try { localStorage.setItem('ultimoRaw', JSON.stringify(raw)); localStorage.setItem('ultimoRawEm', new Date().toISOString()); } catch (e) { /* cheio */ }
    return montarModelo(raw);
  }
  function ultimoSalvo() {
    try { const r = JSON.parse(localStorage.getItem('ultimoRaw')); return r ? montarModelo(r) : null; } catch (e) { return null; }
  }

  // ---------- gravar ----------
  async function colunasCalculadas(tabela) {
    if (calcCache[tabela]) return calcCache[tabela];
    // fórmulas da primeira linha de dados: coluna com fórmula = calculada (o app nunca grava nela)
    const p = posTabela(tabela), n = raw.tables[tabela].values[0].length, lin = p.lin0 + 1;
    const end = colLetra(p.col0) + lin + ':' + colLetra(p.col0 + n - 1) + lin;
    const r = await api('GET', wb() + folha(p.folha) + "/range(address='" + end + "')?$select=formulas");
    calcCache[tabela] = r.formulas[0].map((f) => typeof f === 'string' && f.startsWith('='));
    return calcCache[tabela];
  }
  // Monta a linha só com as colunas de digitar; as calculadas vão como null (o Excel preenche).
  function linhaPara(tabela, obj, calc) {
    const cab = raw.tables[tabela].values[0];
    return cab.map((h, i) => (calc && calc[i]) ? null : (h in obj ? obj[h] : ''));
  }

  // ---------- endereço das células de uma tabela ----------
  // A tabela vem lida com o endereço da aba (ex.: "Cadastro!B6:P46"). Com ele o app grava direto nas
  // células pelo caminho worksheets/range(address=...), o jeito documentado da Microsoft para alterar valores.
  const colNum = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const colLetra = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  function posTabela(tabela) {
    const ad = (raw.tables[tabela] || {}).address || '';
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)/.exec(ad);
    if (!m) throw new Error('Não achei o endereço da tabela ' + tabela + '. Toque em Atualizar e tente de novo.');
    return { folha: (m[1] || m[2]).replace(/''/g, "'"), col0: colNum(m[3]), lin0: Number(m[4]) };
  }
  const igual = (a, b) => {
    const va = a === null || a === undefined ? '' : a, vb = b === null || b === undefined ? '' : b;
    if (typeof va === 'number' && typeof vb === 'number') return Math.abs(va - vb) < 1e-6;
    return String(va).trim() === String(vb).trim();
  };
  // Lê a linha como ela está agora na planilha e confere com o que o app leu antes.
  // Se alguém mexeu na planilha nesse meio tempo, não grava (para nunca escrever na linha errada).
  async function conferirLinha(tabela, indice, calc) {
    const p = posTabela(tabela), cab = raw.tables[tabela].values[0], lin = p.lin0 + 1 + indice;
    const end = colLetra(p.col0) + lin + ':' + colLetra(p.col0 + cab.length - 1) + lin;
    const agora = (await api('GET', wb() + folha(p.folha) + "/range(address='" + end + "')?$select=values")).values[0];
    const antes = raw.tables[tabela].values[indice + 1];
    const ok = cab.every((h, i) => (calc && calc[i]) || igual(agora[i], antes[i]));
    if (!ok) throw new Error('A planilha mudou desde a última leitura. Toque em Atualizar (↻) e faça de novo.');
  }
  // Grava só as colunas pedidas (de digitar), em blocos de colunas vizinhas. Fórmulas nunca são tocadas.
  async function gravarCelulas(tabela, indice, porColuna, calc) {
    const p = posTabela(tabela), lin = p.lin0 + 1 + indice;
    const ks = Object.keys(porColuna).map(Number).filter((k) => !(calc && calc[k])).sort((a, b) => a - b);
    let i = 0;
    while (i < ks.length) {
      let j = i;
      while (j + 1 < ks.length && ks[j + 1] === ks[j] + 1) j++;
      const a = ks[i], b = ks[j];
      const end = colLetra(p.col0 + a) + lin + ':' + colLetra(p.col0 + b) + lin;
      await api('PATCH', wb() + folha(p.folha) + "/range(address='" + end + "')", { values: [ks.slice(i, j + 1).map((k) => porColuna[k])] });
      i = j + 1;
    }
  }

  async function adicionar(tabela, obj) {
    if (modo === 'demo') {
      const cab = raw.tables[tabela].values[0];
      raw.tables[tabela].values.push(cab.map((h) => (h in obj ? obj[h] : '')));
      return;
    }
    const calc = await colunasCalculadas(tabela);
    const cab = raw.tables[tabela].values[0];
    // reaproveita a primeira linha vazia da tabela, se houver
    const vals = raw.tables[tabela].values;
    const entradas = calc.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    const vazia = vals.slice(1).findIndex((r) => entradas.every((i) => r[i] === '' || r[i] === null));
    if (vazia >= 0) {
      await conferirLinha(tabela, vazia, calc);
      const porColuna = {};
      entradas.forEach((i) => { porColuna[i] = cab[i] in obj ? obj[cab[i]] : ''; });
      await gravarCelulas(tabela, vazia, porColuna, calc);
    } else {
      await api('POST', wb() + "/tables('" + tabela + "')/rows/add", { values: [linhaPara(tabela, obj, calc)] });
    }
  }

  // Altera colunas de digitar de uma linha que já existe.
  async function alterar(tabela, indice, campos) {
    const cab = raw.tables[tabela].values[0];
    const desconhecida = Object.keys(campos).find((k) => !cab.includes(k));
    if (desconhecida) throw new Error('A coluna "' + desconhecida + '" não existe em ' + tabela + '.');
    if (modo === 'demo') {
      Object.entries(campos).forEach(([k, v]) => { raw.tables[tabela].values[indice + 1][cab.indexOf(k)] = v; });
      return;
    }
    const calc = await colunasCalculadas(tabela);
    const calcPedida = Object.keys(campos).find((k) => calc[cab.indexOf(k)]);
    if (calcPedida) throw new Error('A coluna "' + calcPedida + '" é calculada pela planilha e não pode ser alterada.');
    await conferirLinha(tabela, indice, calc);
    const porColuna = {};
    Object.entries(campos).forEach(([k, v]) => { porColuna[cab.indexOf(k)] = v; });
    await gravarCelulas(tabela, indice, porColuna, calc);
  }

  // "Apagar" sem tirar a linha da tabela: limpa só as colunas de digitar (as fórmulas ficam).
  async function limpar(tabela, indice) {
    const cab = raw.tables[tabela].values[0];
    if (modo === 'demo') { raw.tables[tabela].values[indice + 1] = cab.map(() => ''); return; }
    const calc = await colunasCalculadas(tabela);
    await conferirLinha(tabela, indice, calc);
    const porColuna = {};
    cab.forEach((h, i) => { if (!calc[i]) porColuna[i] = ''; });
    await gravarCelulas(tabela, indice, porColuna, calc);
  }

  async function apagar(tabela, indice) {
    if (modo === 'demo') { raw.tables[tabela].values.splice(indice + 1, 1); return; }
    await conferirLinha(tabela, indice, await colunasCalculadas(tabela));
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
      envelopesCfg: tabela(r, 'tbEnvelopes'), tipos: tabela(r, 'tbTipos').map((t) => t['Tipo de lançamento']),
      contasBanco: tabela(r, 'tbContasBanco'), movContas: tabela(r, 'tbMovContas')
    };
  }

  // token da conta Microsoft, para o servidor de lembretes conferir que é a conta dona das planilhas
  const tokenAtual = () => token();
  // true só quando os dados vieram da planilha agora (não da cópia guardada no aparelho)
  const temDados = () => modo === 'demo' || (raw !== null && !leituraFalhou);

  return { iniciar, entrar, sair, carregar, ultimoSalvo, adicionar, alterar, limpar, apagar, mudarMes, trocarAno, usarDemo, tokenAtual, pegarAvisoMigracao, temDados,
    paraSerie, deSerie, planilha, get modo() { return modo; } };
})();
