// =================================================================
// SCRIPT.JS - VERSÃO FINAL (CORREÇÃO DE ORDENAÇÃO DE STRING)
// =================================================================

// ===== Firebase (MANTIDO) =====
const firebaseConfig = {
  apiKey: "AIzaSyD6m7jDQfeGgAaKozzHlXsHfv-AQXsaKd4",
  authDomain: "appapontamentoprodutividade.firebaseapp.com",
  projectId: "appapontamentoprodutividade",
  storageBucket: "appapontamentoprodutividade.firebasestorage.app",
  messagingSenderId: "775647390603",
  appId: "1:775647390603:web:9febe5c49f08e5c04cdd8e",
  measurementId: "G-69RHFDSX4G"
};

try {
    firebase.initializeApp(firebaseConfig);
} catch(e) {
    // Firebase já foi inicializado
}
const db = firebase.firestore();

// ===== Utils (MANTIDO) =====
let dadosDoRelatorio = [];
const TOTAL_COLABORADORES = 16;
let unsubscribeHistorico = null;
let animacaoIntervalo = null;
let corOriginalMaiorFatia = null;

const formatarTempo = (totalSegundos) => {
  if (isNaN(totalSegundos) || totalSegundos <= 0) return "00:00:00";
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = Math.floor(totalSegundos % 60);
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
};

const converterDuracaoParaSegundos = (duracaoStr) => {
    if (!duracaoStr || typeof duracaoStr !== 'string') return 0;
    const partes = duracaoStr.split(':');
    if (partes.length !== 3) return 0;
    const horas = parseInt(partes[0], 10) || 0;
    const minutos = parseInt(partes[1], 10) || 0;
    const segundos = parseInt(partes[2], 10) || 0;
    return (horas * 3600) + (minutos * 60) + segundos;
};

// ===== DOM Elements (MANTIDO) =====
const apontamentosTabela = document.getElementById("apontamentos-tabela");
const cardComApontamento = document.getElementById("card-com-apontamento");
const cardSemApontamento = document.getElementById("card-sem-apontamento");
const cardParados = document.getElementById("card-parados");
const cardParadosContainer = document.querySelector(".info-card.parado");
const graficoAtividadesCanvas = document.getElementById("grafico-atividades");
const graficoProdutividadeCanvas = document.getElementById("grafico-produtividade");
const filtroDataInicio = document.getElementById("filtro-data-inicio");
const filtroDataFim = document.getElementById("filtro-data-fim");
const btnFiltrar = document.getElementById("btn-filtrar");
const btnLimpar = document.getElementById("btn-limpar");
const btnLimparPainel = document.getElementById("btn-limpar-painel");
const btnExportarExcel = document.getElementById("btn-exportar-excel");
const btnExportarExcelDetalhado = document.getElementById("btn-exportar-excel-detalhado");
const btnExportarPdf = document.getElementById("btn-exportar-pdf");

// ===== Chart Instances (MANTIDO) =====
let graficoAtividades;
let graficoProdutividade;

const ATIVIDADES = ["Checklist", "Deslocamento", "Em Atividade", "Parado", "Almoço", "Aguardando cliente", "Carregamento"];
const CORES_ATIVIDADES = {
 "Checklist": "#8e00e0ff",
 "Deslocamento": "#d3c610ff",
 "Em Atividade": "#38c202ff",
 "Parado": "#da1912ff",
 "Almoço": "#0594e7ff",
 "Aguardando cliente": "#fc7a00ff",
 "Carregamento": "#5a5a59ff",
};

Chart.register(ChartDataLabels);

// ==================================================
// ===== FUNÇÃO CRÍTICA: CONVERSÃO DE DATA (ROBUSTA) =====
// ==================================================
const parseDate = (dado) => {
    if (!dado) return null;
    if (dado.toDate && typeof dado.toDate === 'function') return dado.toDate();
    if (typeof dado === 'string') {
        const match = dado.match(/^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2}):(\d{2})$/);
        if (match) {
            const [, dia, mes, ano, hora, minuto, segundo] = match;
            const isoString = `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}`;
            const d = new Date(isoString);
            if (!isNaN(d.getTime())) return d;
        }
        const d = new Date(dado);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
};

// ==================================================
// ===== FUNÇÃO DE VERIFICAÇÃO (SIMPLIFICADA) =====
// ==================================================
const isApontamentoDeHoje = (dataHoraClique) => {
    if (!dataHoraClique) return false;
    const dataApontamentoStr = dataHoraClique.substring(0, 10);
    const hoje = new Date();
    const diaHoje = String(hoje.getDate()).padStart(2, '0');
    const mesHoje = String(hoje.getMonth() + 1).padStart(2, '0');
    const anoHoje = hoje.getFullYear();
    const hojeStr = `${diaHoje}-${mesHoje}-${anoHoje}`;
    return dataApontamentoStr === hojeStr;
};

// ==================================================
// ===== FUNÇÃO PARA RENDERIZAR O PAINEL (COM CORREÇÃO DE ORDENAÇÃO) =====
// ==================================================
const renderizarStatusAtual = (todosOsApontamentos) => {
  if (!apontamentosTabela) return;
  apontamentosTabela.innerHTML = "";

  // 1. CRIA UM MAPA PARA ARMAZENAR APENAS O APONTAMENTO MAIS RECENTE DE CADA COLABORADOR
  const ultimosApontamentosMap = new Map();
  todosOsApontamentos.forEach(apontamento => {
    const colaborador = apontamento.colaboradorNome;
    if (!colaborador) return; // Ignora se não tiver nome

    const dataAtual = parseDate(apontamento.dataHoraClique);
    if (!dataAtual) return; // Ignora se a data for inválida

    // Se o colaborador ainda não está no mapa OU se o apontamento atual é mais recente que o já salvo
    if (!ultimosApontamentosMap.has(colaborador) || dataAtual.getTime() > parseDate(ultimosApontamentosMap.get(colaborador).dataHoraClique).getTime()) {
      ultimosApontamentosMap.set(colaborador, apontamento);
    }
  });

  // Converte o mapa para um array
  const ultimosApontamentos = Array.from(ultimosApontamentosMap.values());

  // 2. ORDENA O ARRAY FINAL PELA DATA CORRETA (DO MAIS NOVO PARA O MAIS ANTIGO)
  ultimosApontamentos.sort((a, b) => {
      const timeA = parseDate(a.dataHoraClique)?.getTime() || 0;
      const timeB = parseDate(b.dataHoraClique)?.getTime() || 0;
      return timeB - timeA;
  });

  let totalComApontamentoHoje = 0;
  let totalParados = 0;

  // 3. RENDERIZA A TABELA JÁ COM OS DADOS CORRETOS E ORDENADOS
  ultimosApontamentos.forEach(a => {
    const ehDeHoje = isApontamentoDeHoje(a.dataHoraClique); 
    if (ehDeHoje) {
        totalComApontamentoHoje++;
        if ((a.atividadeClicada || "").toLowerCase() === "parado") {
            totalParados++;
        }
    }
    const tr = document.createElement("tr");
    if ((a.atividadeClicada || "").toLowerCase() === "parado") tr.classList.add("parado-row");
    if (!ehDeHoje) tr.classList.add("apontamento-antigo");
    let dataApontamento = parseDate(a.dataHoraClique);
    let dataFormatada = dataApontamento ? dataApontamento.toLocaleString('pt-BR') : "Data inválida";
    tr.innerHTML = `
      <td>${a.clientName || "—"}</td>
      <td>${a.colaboradorNome || "N/A"}</td>
      <td>${a.atividadeClicada || "N/A"}</td>
      <td>${dataFormatada}</td>
      <td>${a.motivo || ""}</td>
    `;
    apontamentosTabela.appendChild(tr);
  });

  if (cardComApontamento) cardComApontamento.textContent = totalComApontamentoHoje;
  if (cardSemApontamento) cardSemApontamento.textContent = TOTAL_COLABORADORES - totalComApontamentoHoje;
  if (cardParados) cardParados.textContent = totalParados;
  if (cardParadosContainer) cardParadosContainer.classList.toggle("alerta-parado", totalParados > 0);
};

// ==================================================
// ===== FUNÇÃO DE CARREGAMENTO (AJUSTADA) =====
// ==================================================
const carregarDadosDoPainel = () => {
  limparPainelVisualmente();
  
  // Listener para a tabela de status (em tempo real)
  // AGORA ELE BUSCA TODOS OS DOCUMENTOS E A LÓGICA DE FILTRAGEM FICA NO CLIENTE
  db.collection("apontamentos_realtime")
    .onSnapshot((snap) => {
      const todosOsDocs = [];
      snap.forEach(doc => {
        todosOsDocs.push(doc.data());
      });
      // Chama a função de renderização que agora contém a lógica de ordenação e filtragem
      renderizarStatusAtual(todosOsDocs);
    }, (error) => {
      console.error("Erro ao buscar status em tempo real:", error);
    });
  
  if (unsubscribeHistorico) unsubscribeHistorico();

  // Listener para os dados históricos (GRÁFICOS) - Sem alterações
  unsubscribeHistorico = db.collection("apontamentos")
    .onSnapshot((snapshot) => {
      let inicio, fim;
      const dataInicioFiltro = filtroDataInicio.value;
      const dataFimFiltro = filtroDataFim.value;
      if (dataInicioFiltro && dataFimFiltro) {
        inicio = new Date(dataInicioFiltro + 'T00:00:00');
        fim = new Date(dataFimFiltro + 'T23:59:59');
      } else {
        const hoje = new Date();
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
        fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);
      }
      const todosApontamentos = [];
      snapshot.forEach(doc => todosApontamentos.push(doc.data()));
      const apontamentosDoPeriodo = todosApontamentos.filter(dado => {
          const dataDoc = parseDate(dado.dataRegistro);
          return dataDoc && dataDoc >= inicio && dataDoc <= fim;
      });
      dadosDoRelatorio = apontamentosDoPeriodo;
      if (apontamentosDoPeriodo.length > 0) {
        atualizarGraficoPizzaHistorico(apontamentosDoPeriodo);
        renderizarGraficoProdutividade(apontamentosDoPeriodo);
      } else {
        if (graficoAtividades) graficoAtividades.destroy();
        if (graficoProdutividade) graficoProdutividade.destroy();
      }
  }, (error) => console.error("Erro ao buscar dados históricos:", error));
};

// ==================================================
// ===== FUNÇÕES DOS GRÁFICOS (MANTIDO) =====
// ==================================================
const atualizarGraficoPizzaHistorico = (apontamentos) => {
    if (!graficoAtividadesCanvas) return;
    if (animacaoIntervalo) clearInterval(animacaoIntervalo);
    if (graficoAtividades) graficoAtividades.destroy();
    const contagem = {};
    apontamentos.forEach(a => {
        const atividadePadronizada = a.atividade;
        const duracaoSegundos = converterDuracaoParaSegundos(a.duracaoFormatada);
        if (atividadePadronizada) {
            contagem[atividadePadronizada] = (contagem[atividadePadronizada] || 0) + duracaoSegundos;
        }
    });
    const labels = Object.keys(contagem);
    const data = labels.map(label => contagem[label]);
    const backgroundColors = labels.map(label => CORES_ATIVIDADES[label] || '#607D8B');
    if (labels.length === 0) return;
    graficoAtividades = new Chart(graficoAtividadesCanvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: backgroundColors, borderColor: '#ffffff', borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: (context) => `${context.label || ''}: ${formatarTempo(context.parsed)}` } },
                datalabels: {
                    formatter: (value, ctx) => {
                        const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        return sum > 0 ? `${(value * 100 / sum).toFixed(2)}%` : "0.00%";
                    },
                    color: '#080808ff', font: { weight: 'bold' }
                }
            }
        },
    });
    let indiceMaiorFatia = data.indexOf(Math.max(...data));
    corOriginalMaiorFatia = graficoAtividades.data.datasets[0].backgroundColor[indiceMaiorFatia];
    const corBrilhante = '#FFFF99';
    let estaBrilhando = false;
    animacaoIntervalo = setInterval(() => {
        const coresAtuais = graficoAtividades.data.datasets[0].backgroundColor;
        coresAtuais[indiceMaiorFatia] = estaBrilhando ? corOriginalMaiorFatia : corBrilhante;
        estaBrilhando = !estaBrilhando;
        graficoAtividades.update();
    }, 700);
};

const renderizarGraficoProdutividade = (apontamentos) => {
  if (!graficoProdutividadeCanvas) return;
  if (graficoProdutividade) graficoProdutividade.destroy();
  const porColaborador = {};
  apontamentos.forEach(a => {
    const col = a.colaboradorNome || "—";
    const ativ = (a.atividade || "—");
    const seg = converterDuracaoParaSegundos(a.duracaoFormatada);
    if (!porColaborador[col]) {
      porColaborador[col] = {};
      ATIVIDADES.forEach(act => porColaborador[col][act] = 0);
    }
    porColaborador[col][ativ] += seg;
  });
  const colaboradores = Object.keys(porColaborador).sort();
  if (colaboradores.length === 0) {
      if (graficoProdutividade) graficoProdutividade.destroy();
      return;
  }
  graficoProdutividade = new Chart(graficoProdutividadeCanvas, {
    type: "bar",
    data: {
        labels: colaboradores,
        datasets: ATIVIDADES.map(atividade => ({
            label: atividade,
            data: colaboradores.map(c => porColaborador[c][atividade] || 0),
            backgroundColor: CORES_ATIVIDADES[atividade]
        }))
    },
    options: {
      responsive: true,
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => formatarTempo(v) } } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatarTempo(ctx.parsed.y)}` } } }
    }
  });
};

// ==================================================
// ===== FUNÇÕES AUXILIARES E DE EXPORTAÇÃO (MANTIDO) =====
// ==================================================
const zerarRegistrosDoBanco = () => {
  if (confirm("ATENÇÃO: Você tem certeza que deseja apagar TODOS os registros de 'apontamentos_realtime' e 'apontamentos'? Esta ação é irreversível.")) {
    db.collection("apontamentos_realtime").get().then(s => { const b = db.batch(); s.docs.forEach(d => b.delete(d.ref)); return b.commit(); });
    db.collection("apontamentos").get().then(s => { const b = db.batch(); s.docs.forEach(d => b.delete(d.ref)); return b.commit(); });
    alert("Todos os registros foram excluídos com sucesso!");
    limparPainelVisualmente();
    carregarDadosDoPainel();
  }
};
const limparPainelVisualmente = () => {
    if (cardComApontamento) cardComApontamento.textContent = 0;
    if (cardSemApontamento) cardSemApontamento.textContent = TOTAL_COLABORADORES;
    if (cardParados) cardParados.textContent = 0;
    if (apontamentosTabela) apontamentosTabela.innerHTML = "<tr><td colspan='5'>Carregando dados...</td></tr>";
    if (cardParadosContainer) cardParadosContainer.classList.remove("alerta-parado");
};
const exportarProdutividadeExcel = () => {
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar.");
    const porColaborador = {};
    const ATIVIDADES_EXPORT = [...ATIVIDADES, "Tempo Total"];
    dadosDoRelatorio.forEach(a => {
        const col = a.colaboradorNome || "—";
        const ativ = a.atividade || "—";
        const seg = converterDuracaoParaSegundos(a.duracaoFormatada);
        if (!porColaborador[col]) {
            porColaborador[col] = {};
            ATIVIDADES_EXPORT.forEach(act => porColaborador[col][act] = 0);
        }
        porColaborador[col][ativ] += seg;
        porColaborador[col]["Tempo Total"] += seg;
    });
    const exportData = Object.entries(porColaborador).map(([colaborador, tempos]) => {
        const row = { "Colaborador": colaborador };
        ATIVIDADES_EXPORT.forEach(atividade => row[atividade] = formatarTempo(tempos[atividade]));
        return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produtividade");
    XLSX.writeFile(workbook, "produtividade_colaboradores.xlsx");
};
const exportarDetalhadoExcel = () => {
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar.");
    const exportData = dadosDoRelatorio.map(a => ({
        "Cliente": a.clientName || "N/A", "Colaborador": a.colaboradorNome || "N/A", "Atividade": a.atividade || "N/A",
        "Duração": a.duracaoFormatada || "00:00:00", "Data e Hora": parseDate(a.dataRegistro)?.toLocaleString('pt-BR') || "Data inválida",
        "Motivo": a.motivo || "N/A", "Localização": a.localizacao
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Apontamentos Detalhados");
    XLSX.writeFile(workbook, "apontamentos_detalhados.xlsx");
};
const exportarHistoricoPdf = () => {
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) return alert("Nenhum dado para exportar.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Relatório de Histórico de Apontamentos", 14, 22);
    const headers = [["Cliente", "Colaborador", "Atividade", "Duração", "Data e Hora", "Motivo"]];
    const body = dadosDoRelatorio.map(a => [
        a.clientName || "N/A", a.colaboradorNome || "N/A", a.atividade || "N/A", a.duracaoFormatada || "00:00:00",
        parseDate(a.dataRegistro)?.toLocaleString('pt-BR') || "Data inválida", a.motivo || "N/A"
    ]);
    doc.autoTable({ head: headers, body: body, startY: 30, theme: 'striped', headStyles: { fillColor: [22, 160, 133] } });
    doc.save("historico_filtrado.pdf");
};

// ==================================================
// ===== EVENT LISTENERS (MANTIDO) =====
// ==================================================
if (btnFiltrar) btnFiltrar.addEventListener("click", carregarDadosDoPainel);
if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
        if(filtroDataInicio) filtroDataInicio.value = "";
        if(filtroDataFim) filtroDataFim.value = "";
        carregarDadosDoPainel();
    });
}
if (btnLimparPainel) btnLimparPainel.addEventListener("click", zerarRegistrosDoBanco);
if (btnExportarExcel) btnExportarExcel.addEventListener("click", exportarProdutividadeExcel);
if (btnExportarExcelDetalhado) btnExportarExcelDetalhado.addEventListener("click", exportarDetalhadoExcel);
if (btnExportarPdf) btnExportarPdf.addEventListener("click", exportarHistoricoPdf);

document.addEventListener('DOMContentLoaded', carregarDadosDoPainel);
