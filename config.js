// Configuração do app. Depois de registrar o app na Microsoft (veja LEIAME.md), cole o
// "ID do aplicativo (cliente)" em clientId. Enquanto estiver vazio, o app abre em modo demonstração.
window.APP_CONFIG = {
  clientId: '6a6a1791-5e9c-4ee1-a5c0-16e8231c4d4b',

  // Planilhas na raiz do seu OneDrive (o app abre a do ano escolhido em Mais > Planilha).
  planilhas: [
    { ano: 2026, caminho: 'ORÇAMENTO FAMILIA - NOVA VERSÃO.xlsx' },
    { ano: 2027, caminho: 'ORÇAMENTO FAMILIA 2027 - NOVA VERSÃO.xlsx' }
  ],

  // Permissões pedidas à conta Microsoft: ler e gravar arquivos do OneDrive.
  escopos: ['Files.ReadWrite', 'User.Read'],

  // Servidor que manda o lembrete das 6h (pasta orcamento-lembretes). Vazio = lembretes desligados.
  lembretes: 'https://orcamento-lembretes.drabiancaalvess.workers.dev'
};
