import { useState, useEffect } from "react";

const HORARIOS = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
];
const LIMITE = 6;
const BLOCOS = ["A", "B", "C"];
const DB_URL = "https://academia-manaca-default-rtdb.firebaseio.com";

function getDiaFormatado(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDiaSemana(dateStr) {
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const d = new Date(dateStr + "T12:00:00");
  return dias[d.getDay()];
}

function getMesNome(dateStr) {
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const d = new Date(dateStr + "T12:00:00");
  return meses[d.getMonth()];
}

async function dbGet(path) {
  try {
    const res = await fetch(`${DB_URL}/${path}.json`);
    return await res.json();
  } catch { return null; }
}

async function dbPush(path, data) {
  try {
    const res = await fetch(`${DB_URL}/${path}.json`, {
      method: "POST",
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch { return null; }
}

async function dbDelete(path) {
  try {
    await fetch(`${DB_URL}/${path}.json`, { method: "DELETE" });
  } catch (e) { console.error(e); }
}

export default function App() {
  const hoje = getDiaFormatado(new Date());
  const [aba, setAba] = useState("agendar"); // agendar | cancelar
  const [agendamentos, setAgendamentos] = useState({});
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);
  const [horarioSelecionado, setHorarioSelecionado] = useState(null);
  const [form, setForm] = useState({ nome: "", apartamento: "", bloco: "A" });
  const [etapa, setEtapa] = useState("lista");
  const [minhaReserva, setMinhaReserva] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Cancelar - busca
  const [buscaNome, setBuscaNome] = useState("");
  const [buscaApartamento, setBuscaApartamento] = useState("");
  const [buscaBloco, setBuscaBloco] = useState("A");
  const [reservasEncontradas, setReservasEncontradas] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [buscaFeita, setBuscaFeita] = useState(false);

  async function carregarDia(dia) {
    const dados = await dbGet(`agendamentos/${dia}`);
    setAgendamentos(prev => ({ ...prev, [dia]: dados || {} }));
  }

  useEffect(() => {
    carregarDia(diaSelecionado);
    const interval = setInterval(() => carregarDia(diaSelecionado), 10000);
    return () => clearInterval(interval);
  }, [diaSelecionado]);

  function getReservasDia(dia, horario) {
    const slot = agendamentos[dia]?.[horario.replace(":", "_")];
    if (!slot) return [];
    return Object.entries(slot).map(([id, val]) => ({ ...val, id }));
  }

  function getVagasLivres(dia, horario) {
    return LIMITE - getReservasDia(dia, horario).length;
  }

  function selecionarHorario(h) {
    if (getVagasLivres(diaSelecionado, h) === 0) return;
    setHorarioSelecionado(h);
    setForm({ nome: "", apartamento: "", bloco: "A" });
    setErro("");
    setEtapa("form");
  }

  async function confirmarReserva() {
    if (!form.nome.trim()) { setErro("Digite seu nome."); return; }
    if (!form.apartamento.trim()) { setErro("Digite o número do apartamento."); return; }

    setCarregando(true);
    await carregarDia(diaSelecionado);

    const reservas = getReservasDia(diaSelecionado, horarioSelecionado);
    if (reservas.length >= LIMITE) {
      setErro("Horário lotado! Tente outro horário.");
      setCarregando(false);
      return;
    }

    const jaExiste = reservas.find(
      r => r.apartamento === form.apartamento.trim() && r.bloco === form.bloco && r.nome.toLowerCase() === form.nome.trim().toLowerCase()
    );
    if (jaExiste) {
      setErro("Esta pessoa já tem reserva neste horário.");
      setCarregando(false);
      return;
    }

    const horarioKey = horarioSelecionado.replace(":", "_");
    const nova = { nome: form.nome.trim(), apartamento: form.apartamento.trim(), bloco: form.bloco };
    const result = await dbPush(`agendamentos/${diaSelecionado}/${horarioKey}`, nova);

    if (result?.name) {
      setMinhaReserva({ ...nova, id: result.name, dia: diaSelecionado, horario: horarioSelecionado });
      await carregarDia(diaSelecionado);
      setEtapa("confirmado");
    } else {
      setErro("Erro ao salvar. Tente novamente.");
    }
    setCarregando(false);
  }

  async function cancelarReserva(dia, horario, id) {
    const horarioKey = horario.replace(":", "_");
    await dbDelete(`agendamentos/${dia}/${horarioKey}/${id}`);
    await carregarDia(dia);
    setEtapa("lista");
    setMinhaReserva(null);
  }

  async function buscarReservas() {
    if (!buscaNome.trim() || !buscaApartamento.trim()) return;
    setBuscando(true);
    setBuscaFeita(false);
    setReservasEncontradas([]);

    // Buscar nos próximos 7 dias
    const dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return getDiaFormatado(d);
    });

    const encontradas = [];
    for (const dia of dias) {
      const dados = await dbGet(`agendamentos/${dia}`);
      if (!dados) continue;
      for (const horarioKey of Object.keys(dados)) {
        const slot = dados[horarioKey];
        if (!slot) continue;
        for (const [id, reserva] of Object.entries(slot)) {
          if (
            reserva.nome?.toLowerCase() === buscaNome.trim().toLowerCase() &&
            reserva.apartamento === buscaApartamento.trim() &&
            reserva.bloco === buscaBloco
          ) {
            encontradas.push({
              ...reserva,
              id,
              dia,
              horario: horarioKey.replace("_", ":")
            });
          }
        }
      }
    }

    setReservasEncontradas(encontradas);
    setBuscando(false);
    setBuscaFeita(true);
  }

  async function cancelarEncontrada(reserva) {
    await cancelarReserva(reserva.dia, reserva.horario, reserva.id);
    setReservasEncontradas(prev => prev.filter(r => r.id !== reserva.id));
  }

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return getDiaFormatado(d);
  });

  const diaObj = new Date(diaSelecionado + "T12:00:00");

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "#fff",
      paddingBottom: 80
    }}>
      {/* Header */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        padding: "20px 24px 16px",
        textAlign: "center"
      }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>🏋️</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Academia do Prédio</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          Máximo {LIMITE} pessoas por horário
        </p>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", margin: "16px 16px 0", background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: 4 }}>
        <button onClick={() => { setAba("agendar"); setEtapa("lista"); }} style={{
          flex: 1, padding: "10px", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14,
          background: aba === "agendar" ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "transparent",
          color: "#fff", boxShadow: aba === "agendar" ? "0 2px 10px rgba(124,58,237,0.4)" : "none"
        }}>📅 Agendar</button>
        <button onClick={() => { setAba("cancelar"); setBuscaFeita(false); setReservasEncontradas([]); }} style={{
          flex: 1, padding: "10px", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14,
          background: aba === "cancelar" ? "linear-gradient(135deg, #f87171, #dc2626)" : "transparent",
          color: "#fff", boxShadow: aba === "cancelar" ? "0 2px 10px rgba(220,38,38,0.4)" : "none"
        }}>❌ Cancelar</button>
      </div>

      {/* ABA AGENDAR */}
      {aba === "agendar" && etapa === "lista" && (
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 20 }}>
            {dias.map(dia => {
              const d = new Date(dia + "T12:00:00");
              const ativo = dia === diaSelecionado;
              return (
                <button key={dia} onClick={() => setDiaSelecionado(dia)} style={{
                  flexShrink: 0,
                  background: ativo ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "rgba(255,255,255,0.08)",
                  border: "none", borderRadius: 14, padding: "10px 16px",
                  color: "#fff", cursor: "pointer", textAlign: "center", minWidth: 64,
                  boxShadow: ativo ? "0 4px 20px rgba(124,58,237,0.4)" : "none"
                }}>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{getDiaSemana(dia).slice(0, 3)}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{getMesNome(dia)}</div>
                </button>
              );
            })}
          </div>

          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            {getDiaSemana(diaSelecionado)}, {diaObj.getDate()} de {getMesNome(diaSelecionado)}
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {HORARIOS.map(h => {
              const reservas = getReservasDia(diaSelecionado, h);
              const vagas = LIMITE - reservas.length;
              const lotado = vagas === 0;
              const quaseLotado = vagas <= 2 && vagas > 0;
              return (
                <button key={h} onClick={() => selecionarHorario(h)} disabled={lotado} style={{
                  background: lotado ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
                  border: `1px solid ${lotado ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 16, padding: "14px 18px",
                  color: lotado ? "rgba(255,255,255,0.35)" : "#fff",
                  cursor: lotado ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  opacity: lotado ? 0.6 : 1
                }}>
                  <span style={{ fontSize: 20, fontWeight: 800 }}>{h}</span>
                  <div style={{ textAlign: "right" }}>
                    {lotado ? (
                      <span style={{ background: "rgba(239,68,68,0.2)", color: "#f87171", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>Lotado</span>
                    ) : (
                      <span style={{ background: quaseLotado ? "rgba(251,191,36,0.15)" : "rgba(74,222,128,0.15)", color: quaseLotado ? "#fbbf24" : "#4ade80", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>{vagas} vaga{vagas !== 1 ? "s" : ""}</span>
                    )}
                    <div style={{ fontSize: 11, marginTop: 4, color: "rgba(255,255,255,0.4)" }}>{reservas.length}/{LIMITE} pessoas</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {aba === "agendar" && etapa === "form" && (
        <div style={{ padding: "24px 16px 0" }}>
          <button onClick={() => setEtapa("lista")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14, marginBottom: 20, padding: 0 }}>← Voltar</button>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: 24, border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ background: "linear-gradient(135deg, #a78bfa, #7c3aed)", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{getDiaSemana(diaSelecionado)}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{horarioSelecionado}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Vagas restantes</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{getVagasLivres(diaSelecionado, horarioSelecionado)}</div>
              </div>
            </div>
            <h3 style={{ margin: "0 0 20px", fontSize: 17 }}>Seus dados</h3>
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Nome completo</div>
              <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Maria Silva" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Número do apartamento</div>
              <input value={form.apartamento} onChange={e => setForm({ ...form, apartamento: e.target.value })} placeholder="Ex: 204" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
            </label>
            <label style={{ display: "block", marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Bloco</div>
              <div style={{ display: "flex", gap: 8 }}>
                {BLOCOS.map(b => (
                  <button key={b} onClick={() => setForm({ ...form, bloco: b })} style={{ background: form.bloco === b ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "10px 24px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>{b}</button>
                ))}
              </div>
            </label>
            {erro && <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#f87171" }}>{erro}</div>}
            <button onClick={confirmarReserva} disabled={carregando} style={{ width: "100%", background: "linear-gradient(135deg, #a78bfa, #7c3aed)", border: "none", borderRadius: 14, padding: "16px", color: "#fff", fontSize: 16, fontWeight: 700, cursor: carregando ? "not-allowed" : "pointer", opacity: carregando ? 0.7 : 1, boxShadow: "0 4px 20px rgba(124,58,237,0.4)" }}>
              {carregando ? "Salvando..." : "Confirmar Reserva"}
            </button>
          </div>
        </div>
      )}

      {aba === "agendar" && etapa === "confirmado" && minhaReserva && (
        <div style={{ padding: "24px 16px 0", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>Reserva Confirmada!</h2>
          <p style={{ margin: "0 0 24px", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Sua vaga está garantida</p>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: 24, textAlign: "left", border: "1px solid rgba(255,255,255,0.12)", marginBottom: 20 }}>
            {[
              ["🏠 Nome", minhaReserva.nome],
              ["🏢 Apartamento", `${minhaReserva.apartamento} - Bloco ${minhaReserva.bloco}`],
              ["📅 Data", `${getDiaSemana(minhaReserva.dia)}, ${new Date(minhaReserva.dia + "T12:00:00").getDate()} de ${getMesNome(minhaReserva.dia)}`],
              ["⏰ Horário", minhaReserva.horario],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>
          <button onClick={() => cancelarReserva(minhaReserva.dia, minhaReserva.horario, minhaReserva.id)} style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "12px 24px", color: "#f87171", cursor: "pointer", fontSize: 14, marginBottom: 12, width: "100%" }}>Cancelar Reserva</button>
          <button onClick={() => { setEtapa("lista"); setMinhaReserva(null); }} style={{ background: "linear-gradient(135deg, #a78bfa, #7c3aed)", border: "none", borderRadius: 12, padding: "12px 24px", color: "#fff", cursor: "pointer", fontSize: 14, width: "100%", fontWeight: 600 }}>Fazer Nova Reserva</button>
        </div>
      )}

      {/* ABA CANCELAR */}
      {aba === "cancelar" && (
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: 24, border: "1px solid rgba(255,255,255,0.12)", marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 17 }}>🔍 Buscar minha reserva</h3>
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Nome completo</div>
              <input value={buscaNome} onChange={e => setBuscaNome(e.target.value)} placeholder="Ex: Maria Silva" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Número do apartamento</div>
              <input value={buscaApartamento} onChange={e => setBuscaApartamento(e.target.value)} placeholder="Ex: 204" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none" }} />
            </label>
            <label style={{ display: "block", marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>Bloco</div>
              <div style={{ display: "flex", gap: 8 }}>
                {BLOCOS.map(b => (
                  <button key={b} onClick={() => setBuscaBloco(b)} style={{ background: buscaBloco === b ? "linear-gradient(135deg, #f87171, #dc2626)" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "10px 24px", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>{b}</button>
                ))}
              </div>
            </label>
            <button onClick={buscarReservas} disabled={buscando || !buscaNome.trim() || !buscaApartamento.trim()} style={{ width: "100%", background: "linear-gradient(135deg, #f87171, #dc2626)", border: "none", borderRadius: 14, padding: "16px", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: buscando ? 0.7 : 1 }}>
              {buscando ? "Buscando..." : "Buscar Reservas"}
            </button>
          </div>

          {buscaFeita && reservasEncontradas.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px", color: "rgba(255,255,255,0.5)", fontSize: 15 }}>
              Nenhuma reserva encontrada para os próximos 7 dias.
            </div>
          )}

          {reservasEncontradas.length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Reservas encontradas:</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reservasEncontradas.map(r => (
                  <div key={r.id} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.12)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{r.horario}</div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{getDiaSemana(r.dia)}, {new Date(r.dia + "T12:00:00").getDate()} de {getMesNome(r.dia)}</div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                        <div>Apto {r.apartamento}</div>
                        <div>Bloco {r.bloco}</div>
                      </div>
                    </div>
                    <button onClick={() => cancelarEncontrada(r)} style={{ width: "100%", background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "10px", color: "#f87171", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                      Cancelar esta reserva
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
