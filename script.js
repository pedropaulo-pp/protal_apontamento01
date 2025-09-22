// =================================================================
// SCRIPT.JS - VERSÃO FINALMENTE CORRIGIDA E EM TEMPO REAL
// =================================================================

// ===== Firebase =====
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

// ===== Utils =====
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

// ===== DOM Elements =====
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

// ===== Chart Instances =====
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
// ===== FUNÇÃO DE CONVERSÃO DE DATA ÚNICA E ROBUSTA =====
// ==================================================
const parseDate = (dado) => {
    if (!dado) return null;

    // 1. Tenta converter se for um Timestamp do Firebase (o formato ideal)
    if (dado.toDate && typeof dado.toDate === 'function') {
        return dado.toDate();
    }

    // 2. Tenta converter se for uma string
    if (typeof dado === 'string') {
        let d;

        // Tenta formato "AAAA-MM-DD HH:MM:SS" ou "AAAA-MM-DDTHH:MM:SS"
        if (dado.includes('T') || (dado.includes('-') && dado.indexOf('-') === 4)) {
             d = new Date(dado);
             if (!isNaN(d.getTime())) return d;
        }

        // Tenta formato "DD-MM-AAAA HH:MM:SS"
        const partes = dado.split(' ');
        if (partes.length === 2) {
            const dataPartes = partes[0].split('-');
            if (dataPartes.length === 3) {
                const parte1 = parseInt(dataPartes[0], 10);
                const parte2 = parseInt(dataPartes[1], 10);
                const parte3 = parseInt(dataPartes[2], 10);
                const horaPartes = partes[1].split(':');

                if (horaPartes.length === 3) {
                    const hora = parseInt(horaPartes[0], 10);
                    const minuto = parseInt(horaPartes[1], 10);
                    const segundo = parseInt(horaPartes[2], 10);

                    // Verifica se é DD-MM-AAAA
                    if (parte3 > 2000 && parte2 >= 1 && parte2 <= 12) {
                        d = new Date(parte3, parte2 - 1, parte1, hora, minuto, segundo);
                        if (!isNaN(d.getTime())) return d;
                    }
                }
            }
        }

        // Última tentativa com o construtor Date padrão
        d = new Date(dado);
        if (!isNaN(d.getTime())) return d;
    }

    // 3. Se nada funcionar, retorna nulo para evitar erros
    return null;
};

// ==================================================
// ===== FUNÇÃO PARA RENDERIZAR O PAINEL PRINCIPAL =====
// ==================================================
const renderizarStatusAtual = (ultimosApontamentos) => {
  if (!apontamentosTabela) return;
  apontamentosTabela.innerHTML = "";

  let totalComApontamentoHoje = 0;
  let totalParados = 0;

  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);

  ultimosApontamentos.sort((a, b) => {
      const timeA = parseDate(a.dataHoraClique)?.getTime() || 0;
      const timeB = parseDate(b.dataHoraClique)?.getTime() || 0;
      return timeB - timeA;
  });

  ultimosApontamentos.forEach(a => {
    let dataApontamento = parseDate(a.dataHoraClique);
    let dataFormatada = dataApontamento && !isNaN(dataApontamento.getTime()) ? dataApontamento.toLocaleString('pt-BR') : "Data inválida";

    const ehDeHoje = dataApontamento && dataApontamento >= hojeInicio;

    if (ehDeHoje) {
        totalComApontamentoHoje++;
        if ((a.atividadeClicada || "").toLowerCase() === "parado") {
            totalParados++;
        }
    }

    const tr = document.createElement("tr");

    if ((a.atividadeClicada || "").toLowerCase() === "parado") {
      tr.classList.add("parado-row");
    } else if ((a.atividadeClicada || "").toLowerCase() === "aguardando cliente") {
      tr.classList.add("aguardando-cliente-row");
    }

    if (!ehDeHoje) {
        tr.classList.add("apontamento-antigo");
    }

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
// ===== FUNÇÕES DOS GRÁFICOS =====
// ==================================================
const atualizarGraficoPizzaHistorico = (apontamentos) => {
    if (!graficoAtividadesCanvas) return;

    if (animacaoIntervalo) {
        clearInterval(animacaoIntervalo);
    }
    if (graficoAtividades) {
        graficoAtividades.destroy();
    }

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

    if (labels.length === 0) {
        return;
    }

    graficoAtividades = new Chart(graficoAtividadesCanvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: '#ffffff',
                borderWidth: 2
            }]
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

    let indiceMaiorFatia = 0;
    for (let i = 1; i < data.length; i++) {
        if (data[i] > data[indiceMaiorFatia]) {
            indiceMaiorFatia = i;
        }
    }

    corOriginalMaiorFatia = graficoAtividades.data.datasets[0].backgroundColor[indiceMaiorFatia];
    const corBrilhante = '#FFFF99';

    let estaBrilhando = false;
    animacaoIntervalo = setInterval(() => {
        const coresAtuais = graficoAtividades.data.datasets[0].backgroundColor;

        if (estaBrilhando) {
            coresAtuais[indiceMaiorFatia] = corOriginalMaiorFatia;
        } else {
            coresAtuais[indiceMaiorFatia] = corBrilhante;
        }

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
// ===== FUNÇÃO DE CARREGAMENTO DE DADOS EM TEMPO REAL (CORRIGIDA) =====
// ==================================================
const carregarDadosDoPainel = () => {
  limparPainelVisualmente();
  
  // 1. Listener para a tabela de status (em tempo real)
  db.collection("apontamentos_realtime")
    .orderBy("dataHoraClique", "desc")
    .onSnapshot((snap) => {
      const ultimosApontamentosMap = new Map();
      snap.forEach(doc => {
        const apontamento = doc.data();
        if (apontamento.colaboradorNome && !ultimosApontamentosMap.has(apontamento.colaboradorNome)) {
          ultimosApontamentosMap.set(apontamento.colaboradorNome, apontamento);
        }
      });
      renderizarStatusAtual(Array.from(ultimosApontamentosMap.values()));
    }, (error) => {
      console.error("Erro ao buscar status em tempo real:", error);
    });
  
  // Cancela o listener anterior se já existir (importante para evitar múltiplos listeners)
  if (unsubscribeHistorico) {
    unsubscribeHistorico();
  }

  // 2. Listener para os dados históricos (GRÁFICOS) - AGORA TAMBÉM EM TEMPO REAL
  unsubscribeHistorico = db.collection("apontamentos")
    .onSnapshot((snapshot) => {
      console.log("Novos dados históricos recebidos, atualizando gráficos...");
      
      // Define o período de filtro com base nos inputs da tela
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
      snapshot.forEach(doc => {
        todosApontamentos.push(doc.data());
      });

      // Filtra os apontamentos com base no período selecionado DENTRO do listener
      const apontamentosDoPeriodo = todosApontamentos.filter(dado => {
          const dataDoc = parseDate(dado.dataRegistro);
          return dataDoc && dataDoc >= inicio && dataDoc <= fim;
      });

      dadosDoRelatorio = apontamentosDoPeriodo;
      
      if (apontamentosDoPeriodo.length > 0) {
        atualizarGraficoPizzaHistorico(apontamentosDoPeriodo);
        renderizarGraficoProdutividade(apontamentosDoPeriodo);
      } else {
        console.log("Nenhum dado histórico para os gráficos no período.");
        if (graficoAtividades) graficoAtividades.destroy();
        if (graficoProdutividade) graficoProdutividade.destroy();
      }
  }, (error) => {
    console.error("Erro ao buscar dados históricos em tempo real:", error);
  });
};

// ==================================================
// ===== FUNÇÕES AUXILIARES E DE EXPORTAÇÃO =====
// ==================================================
const zerarRegistrosDoBanco = () => {
  if (confirm("ATENÇÃO: Você tem certeza que deseja apagar TODOS os registros de 'apontamentos_realtime' e 'apontamentos'? Esta ação é irreversível.")) {
    const apontamentosRealtimeRef = db.collection("apontamentos_realtime");
    const apontamentosRef = db.collection("apontamentos");

    apontamentosRealtimeRef.get().then(snapshot => {
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      return batch.commit();
    }).then(() => {
      return apontamentosRef.get().then(snapshot => {
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        return batch.commit();
      });
    }).then(() => {
      alert("Todos os registros foram excluídos com sucesso!");
      limparPainelVisualmente();
      carregarDadosDoPainel();
    }).catch(error => {
      console.error("Erro ao apagar registros:", error);
      alert("Ocorreu um erro ao apagar os registros.");
    });
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
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }
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
        ATIVIDADES_EXPORT.forEach(atividade => {
            row[atividade] = formatarTempo(tempos[atividade]);
        });
        return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produtividade por Colaborador");
    XLSX.writeFile(workbook, "produtividade_colaboradores.xlsx");
};

const exportarDetalhadoExcel = () => {
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) {
        alert("Nenhum dado para exportar.");
        return;
    }
    const exportData = dadosDoRelatorio.map(a => ({
        "Cliente": a.clientName || "N/A",
        "Colaborador": a.colaboradorNome || "N/A",
        "Atividade": a.atividade || "N/A",
        "Duração": a.duracaoFormatada || "00:00:00",
        "Data e Hora": parseDate(a.dataRegistro)?.toLocaleString('pt-BR') || "Data inválida",
        "Motivo": a.motivo || "N/A",
        "Localização": a.localizacao
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Apontamentos Detalhados");
    XLSX.writeFile(workbook, "apontamentos_detalhados.xlsx");
};

const exportarHistoricoPdf = () => {
    if (!dadosDoRelatorio || dadosDoRelatorio.length === 0) {
        alert("Nenhum dado histórico encontrado no período selecionado para exportar.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Relatório de Histórico de Apontamentos", 14, 22);

    const headers = [["Cliente", "Colaborador", "Atividade", "Duração", "Data e Hora", "Motivo"]];

    const body = dadosDoRelatorio.map(a => [
        a.clientName || "N/A",
        a.colaboradorNome || "N/A",
        a.atividade || "N/A",
        a.duracaoFormatada || "00:00:00",
        parseDate(a.dataRegistro)?.toLocaleString('pt-BR') || "Data inválida",
        a.motivo || "N/A"
    ]);

    doc.autoTable({
        head: headers,
        body: body,
        startY: 30,
        theme: 'striped',
        headStyles: { fillColor: [22, 160, 133] },
    });

    doc.save("historico_filtrado.pdf");
};

// ==================================================
// ===== EVENT LISTENERS =====
// ==================================================
if (btnFiltrar) {
    btnFiltrar.addEventListener("click", () => {
        const dataInicio = filtroDataInicio.value;
        const dataFim = filtroDataFim.value;
        if (!dataInicio || !dataFim) {
            return alert("Por favor, selecione a data de início e a data de fim para filtrar.");
        }
        // Apenas força a reavaliação dos listeners que já estão ativos
        carregarDadosDoPainel();
    });
}

if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
        if(filtroDataInicio) filtroDataInicio.value = "";
        if(filtroDataFim) filtroDataFim.value = "";
        // Força a reavaliação dos listeners com o filtro limpo
        carregarDadosDoPainel();
    });
}

if (btnLimparPainel) {
    btnLimparPainel.addEventListener("click", zerarRegistrosDoBanco);
}
if (btnExportarExcel) {
    btnExportarExcel.addEventListener("click", exportarProdutividadeExcel);
}
if (btnExportarExcelDetalhado) {
    btnExportarExcelDetalhado.addEventListener("click", exportarDetalhadoExcel);
}
if (btnExportarPdf) {
    btnExportarPdf.addEventListener("click", exportarHistoricoPdf);
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicia os listeners quando a página carrega
    carregarDadosDoPainel();
});
