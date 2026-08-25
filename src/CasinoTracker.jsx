import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, FileText, Trash2, Moon, Sun, LayoutDashboard, X, KeyRound,
  Eye, EyeOff, Copy, Check, Pencil, RefreshCw, ChevronDown, ChevronRight, Calculator
} from "lucide-react";


/* detecta se está num celular (tela estreita) e reage ao girar o aparelho */
function useMobile() {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 820px)").matches
      : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 820px)");
    const onChange = (e) => setMobile(e.matches);
    setMobile(mq.matches);
    if (mq.addEventListener) { mq.addEventListener("change", onChange); return () => mq.removeEventListener("change", onChange); }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);
  return mobile;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPctBR = (n) => `${(Number(n) || 0).toFixed(2).replace(".", ",")}%`;

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const fmtMes = (k) => {
  if (!k) return "—";
  const [ano, mes] = k.split("-");
  return `${MESES[Number(mes) - 1] || "?"}/${ano}`;
};
const fmtDia = (k) => {
  if (!k) return "—";
  const [ano, mes, dia] = k.split("-");
  return `${dia}/${mes}/${ano}`;
};

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to legacy method */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch (e) { /* clipboard fully unavailable */ }
  return false;
}

const COLUMNS = [
  { key: "conta", label: "Conta", type: "text", width: 160 },
  { key: "depositado", label: "Depósito", type: "number", width: 120 },
  { key: "sacado1", label: "Saque 1", type: "number", width: 110 },
  { key: "sacado2", label: "Saque 2", type: "number", width: 110 },
  { key: "pago", label: "Pago ao cliente", type: "number", width: 130 },
  { key: "obs", label: "Observações", type: "text", width: 170 },
];

/* Aceita "1250", "1.250", "1250,50", "1.250,50", "R$ 1.250,50" e devolve número */
const parseNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return 0;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // o último separador é o decimal; o outro é milhar
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const casas = s.length - lastComma - 1;
    s = casas > 0 && casas <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    const casas = s.length - lastDot - 1;
    if (!(casas > 0 && casas <= 2)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
};

/* Mostra 1250 como "1.250,00" */
const fmtNum = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getSacado = (r) => parseNum(r.sacado1) + parseNum(r.sacado2);

/* Lula incide sobre a sua parte (o que sobra depois do corte do programador) */
const LULA_PADRAO = 7;

const DEFAULT_DATA = {
  theme: "dark",
  folders: [],
  sheets: [],
  rows: {},
  contas: [],
};

export default function CasinoTracker() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [activeOp, setActiveOp] = useState(null);
  const [view, setView] = useState("dashboard");
  const [newOpMode, setNewOpMode] = useState(false);
  const [renamingOp, setRenamingOp] = useState(null);
  const [confirmDeleteOp, setConfirmDeleteOp] = useState(null);

  const mobile = useMobile();
  const [calcAberta, setCalcAberta] = useState(false);
  const theme = data.theme || "dark";
  const t = T(theme);

  useEffect(() => {
    document.body.style.background = t.ink;
    document.documentElement.style.background = t.ink;
  }, [t.ink]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("casino-tracker-data");
        if (res && res.value) setData(JSON.parse(res.value));
      } catch (e) {
        /* no saved data yet */
      }
      try {
        const ui = await window.storage.get("casino-tracker-ui");
        if (ui && ui.value) {
          const u = JSON.parse(ui.value);
          if (u.view) setView(u.view);
          if (u.activeSheet) setActiveOp(u.activeSheet);
        }
      } catch (e) {
        /* no saved navigation yet */
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set("casino-tracker-ui", JSON.stringify({ view, activeSheet: activeOp }));
      } catch (e) {
        /* navigation is not critical to save */
      }
    })();
  }, [loaded, view, activeOp]);

  const persist = useCallback(async (next) => {
    const carimbado = { ...next, atualizado: new Date().toISOString() };
    setData(carimbado);
    try {
      await window.storage.set("casino-tracker-data", JSON.stringify(carimbado));
    } catch (e) {
      console.error("Falha ao salvar", e);
    }
  }, []);

  /* busca a versão salva na conta e adota se for mais nova que a daqui */
  const [buscando, setBuscando] = useState(false);
  const recarregar = useCallback(async (manual) => {
    if (manual) setBuscando(true);
    let resultado = "igual";
    try {
      const res = await window.storage.get("casino-tracker-data");
      if (!res || !res.value) {
        resultado = "vazio";
      } else {
        const remoto = JSON.parse(res.value);
        setData((atual) => {
          const a = atual.atualizado || "";
          const b = remoto.atualizado || "";
          if (b && b > a) { resultado = "novo"; return remoto; }
          return atual;
        });
      }
    } catch (e) {
      resultado = "erro";
    }
    if (manual) setTimeout(() => setBuscando(false), 400);
    return resultado;
  }, []);

  /* ao voltar para o app (trocar de aba, destravar o celular) confere se mudou */
  useEffect(() => {
    if (!loaded) return;
    const conferir = () => { if (document.visibilityState === "visible") recarregar(false); };
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, [loaded, recarregar]);

  const toggleTheme = () => persist({ ...data, theme: theme === "dark" ? "light" : "dark" });

  const operacoes = data.sheets || [];

  const allRows = useMemo(() => {
    const out = [];
    Object.entries(data.rows || {}).forEach(([opId, rows]) => {
      const op = (data.sheets || []).find((s) => s.id === opId);
      if (!op) return;
      rows.forEach((r) => out.push({ ...r, __op: op.name }));
    });
    return out;
  }, [data.rows, data.sheets]);

  const kpis = useMemo(() => {
    let lucro = 0, prejuizo = 0, dep = 0, saq = 0;
    const byDay = {}, byMonth = {};
    allRows.forEach((r) => {
      const depositado = parseNum(r.depositado);
      const sacado = getSacado(r);
      const net = sacado - depositado;
      if (net >= 0) lucro += net; else prejuizo += -net;
      dep += depositado;
      saq += sacado;
      const iso = typeof r.data === "string" && r.data.length >= 10 ? r.data.slice(0, 10) : null;
      if (iso) {
        byDay[iso] = (byDay[iso] || 0) + net;
        byMonth[iso.slice(0, 7)] = (byMonth[iso.slice(0, 7)] || 0) + net;
      }
    });
    const liquido = lucro - prejuizo;
    const roi = dep > 0 ? (liquido / dep) * 100 : 0;
    const pick = (obj, cmp) => Object.entries(obj).reduce((a, b) => (a === null || cmp(b[1], a[1]) ? b : a), null);
    const bestDay = pick(byDay, (x, y) => x > y);
    const worstDay = pick(byDay, (x, y) => x < y);
    const bestMonth = pick(byMonth, (x, y) => x > y);
    const worstMonth = pick(byMonth, (x, y) => x < y);
    const mesAtual = todayISO().slice(0, 7);
    const lucroMes = byMonth[mesAtual] || 0;
    return {
      liquido, dep, saq, saldo: dep - saq + liquido,
      roi, ops: allRows.length,
      bestDay, worstDay, bestMonth, worstMonth, mesAtual, lucroMes,
    };
  }, [allRows]);

  const totaisReais = useMemo(() => {
    let liquido = 0, prog = 0, lula = 0, pago = 0;
    (data.sheets || []).forEach((o) => {
      const c = calcOperacao(o, data.rows[o.id] || []);
      liquido += c.lucroLiquido;
      prog += c.corteProgramador;
      lula += c.corteLula;
      pago += c.totalPago;
    });
    return { liquido, prog, lula, pago };
  }, [data.sheets, data.rows]);

  const porMes = useMemo(() => liquidoPorPeriodo(data.sheets, data.rows, (iso) => iso.slice(0, 7)), [data.sheets, data.rows]);
  const porDia = useMemo(() => liquidoPorPeriodo(data.sheets, data.rows, (iso) => iso), [data.sheets, data.rows]);

  const porOperacao = useMemo(() => {
    const m = {};
    (data.sheets || []).forEach((o) => {
      m[o.name] = calcOperacao(o, data.rows[o.id] || []).lucroLiquido;
    });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [allRows]);

  const openOp = (id) => { setActiveOp(id); setView("op"); };

  const addOperacao = (name) => {
    if (!name.trim()) return;
    const id = uid();
    let folders = data.folders || [];
    let folderId = folders[0]?.id;
    if (!folderId) {
      folderId = uid();
      folders = [...folders, { id: folderId, name: "Geral", parent: null }];
    }
    persist({
      ...data,
      folders,
      sheets: [...(data.sheets || []), { id, name: name.trim(), folderId, comissao: 50 }],
      rows: { ...data.rows, [id]: [] },
    });
    setActiveOp(id);
    setView("op");
    setNewOpMode(false);
  };

  const renameOp = (id, name) => {
    if (!name.trim()) { setRenamingOp(null); return; }
    persist({ ...data, sheets: operacoes.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) });
    setRenamingOp(null);
  };

  const deleteOp = (id) => {
    const sheets = operacoes.filter((s) => s.id !== id);
    const rows = { ...data.rows };
    delete rows[id];
    persist({ ...data, sheets, rows });
    if (activeOp === id) { setActiveOp(null); setView("dashboard"); }
  };

  const updateOpComissao = (id, pct) => {
    const val = Math.max(0, Math.min(100, parseNum(pct)));
    persist({ ...data, sheets: operacoes.map((s) => (s.id === id ? { ...s, comissao: val } : s)) });
  };
  const updateOpLula = (id, pct) => {
    const val = Math.max(0, Math.min(100, parseNum(pct)));
    persist({ ...data, sheets: operacoes.map((s) => (s.id === id ? { ...s, lulaPct: val } : s)) });
  };
  const updateOpPerdaFixa = (id, v) => {
    const val = Math.max(0, parseNum(v));
    persist({ ...data, sheets: operacoes.map((s) => (s.id === id ? { ...s, perdaFixa: val } : s)) });
  };
  const updateOpFornecedorNome = (id, v) => {
    persist({ ...data, sheets: operacoes.map((s) => (s.id === id ? { ...s, fornecedorNome: v } : s)) });
  };
  const updateOpFornecedorPct = (id, v) => {
    const val = Math.max(0, Math.min(100, parseNum(v)));
    persist({ ...data, sheets: operacoes.map((s) => (s.id === id ? { ...s, fornecedorPct: val } : s)) });
  };
  /* --- fornecedores: cada um com contas e percentuais próprios --- */
  const mexerForn = (opId, fn) => {
    persist({ ...data, sheets: operacoes.map((o) => (o.id === opId ? { ...o, fornecedores: fn(o.fornecedores || []) } : o)) });
  };
  const addFornecedor = (opId) => mexerForn(opId, (fs) => [...fs, {
    id: uid(), nome: "", pct: 0, comissao: 50, lulaPct: LULA_PADRAO, perdaAtiva: false, perdaFixa: 0, rows: [],
  }]);
  const updateFornecedor = (opId, fId, campo, valor) =>
    mexerForn(opId, (fs) => fs.map((f) => (f.id === fId ? { ...f, [campo]: valor } : f)));
  const deleteFornecedor = (opId, fId) => mexerForn(opId, (fs) => fs.filter((f) => f.id !== fId));
  const addFornRow = (opId, fId) => mexerForn(opId, (fs) => fs.map((f) => (f.id === fId
    ? { ...f, rows: [...(f.rows || []), { id: uid(), data: todayISO(), conta: "", depositado: 0, sacado1: 0, sacado2: 0, pago: 0, obs: "" }] }
    : f)));
  const updateFornCell = (opId, fId, rowId, key, value) => mexerForn(opId, (fs) => fs.map((f) => (f.id === fId
    ? { ...f, rows: (f.rows || []).map((r) => (r.id === rowId ? { ...r, [key]: value } : r)) }
    : f)));
  const deleteFornRow = (opId, fId, rowId) => mexerForn(opId, (fs) => fs.map((f) => (f.id === fId
    ? { ...f, rows: (f.rows || []).filter((r) => r.id !== rowId) }
    : f)));
  const duplicarFornRow = (opId, fId, rowId) => mexerForn(opId, (fs) => fs.map((f) => {
    if (f.id !== fId) return f;
    const rs = f.rows || [];
    const i = rs.findIndex((r) => r.id === rowId);
    if (i < 0) return f;
    return { ...f, rows: [...rs.slice(0, i + 1), { ...rs[i], id: uid() }, ...rs.slice(i + 1)] };
  }));

  const updateOpPerdaAtiva = (id, ativa) => {
    persist({ ...data, sheets: operacoes.map((s) => (s.id === id ? { ...s, perdaAtiva: !!ativa } : s)) });
  };

  const currentRows = data.rows[activeOp] || [];
  const currentOp = operacoes.find((s) => s.id === activeOp);

  const updateCell = (rowId, key, value) => {
    const rows = currentRows.map((r) => (r.id === rowId ? { ...r, [key]: value } : r));
    persist({ ...data, rows: { ...data.rows, [activeOp]: rows } });
  };
  const addRow = () => {
    const row = { id: uid(), data: todayISO(), conta: "", depositado: 0, sacado1: 0, sacado2: 0, pago: 0, obs: "" };
    persist({ ...data, rows: { ...data.rows, [activeOp]: [...currentRows, row] } });
  };
  const deleteRow = (rowId) => {
    persist({ ...data, rows: { ...data.rows, [activeOp]: currentRows.filter((r) => r.id !== rowId) } });
  };
  const duplicateRow = (rowId) => {
    const row = currentRows.find((r) => r.id === rowId);
    if (!row) return;
    const idx = currentRows.findIndex((r) => r.id === rowId);
    const rows = [...currentRows.slice(0, idx + 1), { ...row, id: uid() }, ...currentRows.slice(idx + 1)];
    persist({ ...data, rows: { ...data.rows, [activeOp]: rows } });
  };

  const contas = data.contas || [];
  const addConta = () => persist({ ...data, contas: [...contas, { id: uid(), nome: "", email: "", cpf: "", senha: "" }] });
  const updateConta = (id, key, value) =>
    persist({ ...data, contas: contas.map((c) => (c.id === id ? { ...c, [key]: value } : c)) });
  const deleteConta = (id) => persist({ ...data, contas: contas.filter((c) => c.id !== id) });

  if (!loaded) {
    return (
      <div style={{ background: t.ink, color: t.muted, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: t.mono, fontSize: 11, letterSpacing: 3 }}>
        CARREGANDO
      </div>
    );
  }

  const cssVars = {
    "--ink": t.ink, "--panel": t.panel, "--line": t.line, "--red": t.red,
    "--edge": t.edge, "--sheen": t.sheen, "--green": t.green,
    "--text": t.text, "--muted": t.muted, "--hover": t.hover, "--focus": t.focus,
    "--display": t.display, "--ui": t.ui, "--mono": t.mono,
  };

  const tabs = [
    { id: "dashboard", kind: "view", label: "Dashboard", icon: <LayoutDashboard size={13} /> },
    { id: "contas", kind: "view", label: "Contas", icon: <KeyRound size={13} /> },
    ...operacoes.map((o) => ({ id: o.id, kind: "op", label: o.name, icon: <FileText size={13} /> })),
  ];

  return (
    <div style={{ ...cssVars, background: t.ink, color: t.text, minHeight: "100vh", display: "flex", fontFamily: t.ui, position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

        /* painel: canto suave, borda quase invisível e um fio de luz na aresta de cima */
        .ct-panel{
          background:var(--panel);
          border:1px solid var(--line);
          border-radius:14px;
          box-shadow:inset 0 1px 0 var(--sheen), 0 1px 2px rgba(0,0,0,.5);
        }
        .ct-label{font-size:9px;font-weight:600;letter-spacing:2.6px;text-transform:uppercase;color:var(--muted);display:block}
        .ct-rule{height:1px;background:var(--line)}

        .ct-scroll::-webkit-scrollbar{height:7px;width:7px}
        .ct-scroll::-webkit-scrollbar-track{background:transparent}
        .ct-scroll::-webkit-scrollbar-thumb{background:var(--line);border-radius:99px}
        .ct-scroll::-webkit-scrollbar-thumb:hover{background:var(--muted)}

        .ct-row{transition:background .14s ease}
        .ct-row:hover{background:var(--hover)}
        .ct-cell input{width:100%;background:transparent;border:1px solid transparent;color:var(--text);
          font-family:var(--mono);font-size:12.5px;outline:none;padding:9px 9px;border-radius:8px;transition:all .14s ease}
        .ct-cell input::placeholder{color:var(--muted);opacity:.5}
        .ct-cell input:hover{background:var(--hover)}
        .ct-cell input:focus{background:var(--focus);border-color:var(--edge)}

        .ct-item{transition:background .14s ease,color .14s ease;border-radius:10px}
        .ct-item:hover{background:var(--hover)}

        .ct-btn{font-size:10.5px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;border-radius:10px;
          display:inline-flex;align-items:center;gap:8px;padding:10px 16px;transition:all .16s ease;white-space:nowrap}
        .ct-btn-solid{background:var(--text);border:1px solid var(--text);color:var(--ink)}
        .ct-btn-solid:hover{opacity:.86;transform:translateY(-1px)}
        .ct-btn-line{background:transparent;border:1px solid var(--line);color:var(--muted)}
        .ct-btn-line:hover{border-color:var(--edge);color:var(--text);background:var(--hover)}
        .ct-btn-red{background:transparent;border:1px solid var(--line);color:var(--red)}
        .ct-btn-red:hover{border-color:var(--red);background:rgba(240,97,109,.08)}
        .ct-btn:active{transform:translateY(0)}

        @keyframes ct-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        button{cursor:pointer;font-family:inherit}
        input,select,textarea{font-family:inherit;border-radius:10px}
        :focus-visible{outline:1px solid var(--edge);outline-offset:3px}
        ::selection{background:var(--green);color:var(--ink)}

        @media (max-width: 820px){
          /* fonte 16px evita o zoom automatico do Android/iOS ao focar um campo */
          .ct-cell input, .ct-panel input, .ct-panel textarea{font-size:16px}
          .ct-btn{padding:12px 15px}
          h1{font-size:30px !important}
          .ct-panel{border-radius:12px}
        }
      `}</style>

      <Grain t={t} dark={theme === "dark"} />
      {calcAberta && <Calculadora t={t} onFechar={() => setCalcAberta(false)} />}

      {!mobile && (
      <aside style={{ width: 230, borderRight: `1px solid ${t.line}`, padding: "22px 12px 16px", display: "flex", flexDirection: "column", gap: 18, flexShrink: 0, position: "relative", zIndex: 1, background: t.ink }}>
        <div style={{ padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Skull size={22} color={t.text} />
            <span style={{ fontFamily: t.display, fontSize: 26, letterSpacing: 1, color: t.text, lineHeight: 1 }}>ECL</span>
            <span style={{ width: 6, height: 6, background: t.red, display: "block", alignSelf: "flex-end", marginBottom: 4 }} />
          </div>
          <div style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.3, color: t.muted, marginTop: 8 }}>
            {operacoes.length} {operacoes.length === 1 ? "OPERAÇÃO" : "OPERAÇÕES"}
          </div>
        </div>

        <div className="ct-rule" />

        <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <NavBtn t={t} active={view === "dashboard"} icon={<LayoutDashboard size={14} />} label="Dashboard" onClick={() => setView("dashboard")} />
          <NavBtn t={t} active={view === "contas"} icon={<KeyRound size={14} />} label="Contas" onClick={() => setView("contas")} />
        </nav>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
          <span className="ct-label">Operações</span>
          <button onClick={() => setNewOpMode(true)} style={t.iconBtn} title="Nova operação"><Plus size={13} /></button>
        </div>

        <div className="ct-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          {operacoes.map((o) => {
            const on = activeOp === o.id && view === "op";
            if (renamingOp === o.id) {
              return (
                <InlineInput key={o.id} t={t} placeholder="Nome da operação" initialValue={o.name}
                  onSubmit={(v) => renameOp(o.id, v)} onCancel={() => setRenamingOp(null)} />
              );
            }
            if (confirmDeleteOp === o.id) {
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 7px", border: `1px solid ${t.red}` }}>
                  <span style={{ fontSize: 11, color: t.red, flex: 1 }}>Excluir?</span>
                  <button onClick={() => { deleteOp(o.id); setConfirmDeleteOp(null); }} style={t.iconBtn} title="Confirmar"><Check size={12} color={t.red} /></button>
                  <button onClick={() => setConfirmDeleteOp(null)} style={t.iconBtn} title="Cancelar"><X size={12} /></button>
                </div>
              );
            }
            return (
              <div key={o.id} className="ct-item" onClick={() => openOp(o.id)} title={`Abrir ${o.name}`}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 8px", cursor: "pointer",
                  background: on ? t.hover : "transparent",
                  boxShadow: on ? `inset 2px 0 0 ${t.red}` : "none" }}>
                <FileText size={12} color={on ? t.red : t.muted} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: on ? 600 : 400, color: on ? t.text : t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                <button onClick={(e) => { e.stopPropagation(); setRenamingOp(o.id); }} style={t.iconBtn} title="Renomear"><Pencil size={10} /></button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteOp(o.id); }} style={t.iconBtn} title="Excluir"><Trash2 size={10} /></button>
              </div>
            );
          })}

          {newOpMode && (
            <InlineInput t={t} placeholder="Nome da operação" onSubmit={addOperacao} onCancel={() => setNewOpMode(false)} />
          )}

          {operacoes.length === 0 && !newOpMode && (
            <button onClick={() => setNewOpMode(true)} className="ct-btn ct-btn-line" style={{ justifyContent: "center", marginTop: 4 }}>
              <Plus size={13} /> Nova operação
            </button>
          )}
        </div>

        <div className="ct-rule" />

        <button onClick={() => setCalcAberta(true)} className="ct-btn ct-btn-line" style={{ justifyContent: "center" }}>
          <Calculator size={13} /> Calculadora
        </button>
        <button onClick={toggleTheme} className="ct-btn ct-btn-line" style={{ justifyContent: "center" }}>
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          {theme === "dark" ? "Claro" : "Escuro"}
        </button>
      </aside>
      )}

      <main className="ct-scroll" style={{ flex: 1, padding: mobile ? "0 13px 60px" : "0 28px 44px", overflowX: "hidden", position: "relative", zIndex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TabBar t={t} tabs={tabs} mobile={mobile}
          activeId={view === "op" ? activeOp : view}
          onPick={(tab) => (tab.kind === "op" ? openOp(tab.id) : setView(tab.id))}
          extras={mobile ? [
            { id: "__nova", icon: <Plus size={14} />, title: "Nova operação", onClick: () => setNewOpMode(true) },
            { id: "__tema", icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />, title: "Tema", onClick: toggleTheme },
            { id: "__calc", icon: <Calculator size={14} />, title: "Calculadora", onClick: () => setCalcAberta(true) },
          ] : null} />
        {mobile && newOpMode && (
          <div style={{ marginBottom: 18 }}>
            <InlineInput t={t} placeholder="Nome da operação" onSubmit={addOperacao} onCancel={() => setNewOpMode(false)} />
          </div>
        )}

        {view === "dashboard" ? (
          <Dashboard t={t} kpis={kpis} porOperacao={porOperacao} totais={totaisReais} recarregar={recarregar} buscando={buscando} atualizado={data.atualizado} porMes={porMes} porDia={porDia} opsCount={operacoes.length} contasCount={contas.length} data={data} persist={persist} />
        ) : view === "contas" ? (
          <ContasView t={t} contas={contas} addConta={addConta} updateConta={updateConta} deleteConta={deleteConta} />
        ) : (
          <OperacaoView
            t={t} op={currentOp} rows={currentRows}
            updateCell={updateCell} addRow={addRow} deleteRow={deleteRow} duplicateRow={duplicateRow}
            deleteOp={deleteOp} updateOpComissao={updateOpComissao} updateOpLula={updateOpLula} updateOpPerdaFixa={updateOpPerdaFixa} updateOpPerdaAtiva={updateOpPerdaAtiva}
            addFornecedor={addFornecedor} updateFornecedor={updateFornecedor} deleteFornecedor={deleteFornecedor}
            addFornRow={addFornRow} updateFornCell={updateFornCell} deleteFornRow={deleteFornRow} duplicarFornRow={duplicarFornRow}
            onNew={() => setNewOpMode(true)}
          />
        )}
      </main>
    </div>
  );
}

/* ---------- Pieces ---------- */

function Grain({ t, dark }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: t.ink }} />
      {/* clarão frio no alto, dá profundidade sem sujar o fundo */}
      <div style={{ position: "absolute", inset: 0, background: dark
        ? "radial-gradient(120% 70% at 50% -18%, rgba(52,211,153,.07) 0%, rgba(52,211,153,0) 55%)"
        : "radial-gradient(120% 70% at 50% -18%, rgba(14,159,110,.06) 0%, rgba(14,159,110,0) 55%)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(70vh, 70vw)", opacity: dark ? 0.014 : 0.03, display: "flex" }}>
        <Skull size="100%" color={dark ? "#FFFFFF" : "#0A0A0A"} style={{ width: "100%", height: "auto" }} />
      </div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: dark ? 0.05 : 0.025 }}>
        <filter id="ct-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ct-grain)" />
      </svg>
    </div>
  );
}

function TabBar({ t, tabs, activeId, onPick, extras, mobile }) {
  return (
    <div className="ct-scroll" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: `1px solid ${t.line}`,
      paddingBottom: 10, marginBottom: mobile ? 20 : 28, flexShrink: 0,
      position: mobile ? "sticky" : "static", top: 0, zIndex: 5, background: t.ink,
      margin: mobile ? "0 -13px 18px" : undefined, padding: mobile ? "0 8px" : undefined }}>
      {tabs.map((tab) => {
        const on = tab.id === activeId;
        return (
          <button key={tab.id} onClick={() => onPick(tab)} title={tab.label}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 15px",
              border: `1px solid ${on ? t.line : "transparent"}`, borderRadius: 10,
              background: on ? t.panel : "transparent",
              boxShadow: on ? `inset 0 1px 0 ${t.sheen}` : "none",
              color: on ? t.text : t.muted,
              fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
              textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
              transition: "all .16s ease",
            }}>
            {tab.icon}{tab.label}
          </button>
        );
      })}
      {(extras || []).map((e) => (
        <button key={e.id} onClick={e.onClick} title={e.title}
          style={{ display: "flex", alignItems: "center", padding: "13px 15px", border: "none",
            background: "transparent", borderBottom: "2px solid transparent", color: t.muted, flexShrink: 0 }}>
          {e.icon}
        </button>
      ))}
    </div>
  );
}



/* mede a largura real do espaço disponível, para o gráfico desenhar 1:1
   em vez de esticar junto com a tela */
function useLargura(minimo = 300) {
  const ref = useRef(null);
  const [larg, setLarg] = useState(minimo);
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo) return;
    const medir = () => setLarg(Math.max(minimo, Math.round(alvo.clientWidth)));
    medir();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(medir);
      ro.observe(alvo);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [minimo]);
  return [ref, larg];
}


/* linha do lucro por dia — SVG puro */
function LinhaDia({ t, serie }) {
  if (serie.length < 1) {
    return <div style={{ fontFamily: t.mono, fontSize: 11, color: t.muted, letterSpacing: 1, padding: "26px 0", textAlign: "center" }}>SEM MOVIMENTO REGISTRADO</div>;
  }
  const [caixa, W] = useLargura(320);
  const compacto = W < 560;
  const H = compacto ? 190 : 250;
  /* espaço à esquerda calculado pela largura do rótulo, senão o "R$" fica cortado */
  const padL = compacto ? 62 : 82, padR = 16, padT = 20, padB = 30;
  const vals = serie.map((d) => d[1]);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const span = (max - min) || 1;
  const aw = W - padL - padR, ah = H - padT - padB;
  const px = (i) => serie.length === 1 ? padL + aw / 2 : padL + (i * aw) / (serie.length - 1);
  const py = (v) => padT + ah - ((v - min) / span) * ah;
  const pts = serie.map((d, i) => `${px(i)},${py(d[1])}`).join(" ");
  const area = `${padL},${py(min)} ${pts} ${px(serie.length - 1)},${py(min)}`;
  const ticks = [max, max - span / 3, max - (2 * span) / 3, min];
  return (
    <div ref={caixa} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }}>
        <defs>
          <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.green} stopOpacity="0.34" />
            <stop offset="100%" stopColor={t.green} stopOpacity="0" />
          </linearGradient>
          <filter id="brilho" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <text x={padL - 12} y={padT - 7} textAnchor="end" fontFamily="'JetBrains Mono', monospace"
          fontSize={compacto ? 9 : 10} fill={t.muted} opacity="0.75">R$</text>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={py(v)} x2={W - padR} y2={py(v)} stroke={t.line} strokeDasharray="3 5" />
            <text x={padL - 12} y={py(v) + 4} textAnchor="end" fontFamily="'JetBrains Mono', monospace" fontSize={compacto ? 10 : 11} fill={t.muted}>
              {Math.abs(v) >= 100000 ? `${(v / 1000).toFixed(0)} mil`
                : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} mil`
                : v.toFixed(0)}
            </text>
          </g>
        ))}
        <polygon points={area} fill="url(#gd)" />
        <polyline points={pts} fill="none" stroke={t.green} strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" filter="url(#brilho)" />
        {serie.map((d, i) => (
          <circle key={d[0]} cx={px(i)} cy={py(d[1])} r={compacto ? 3 : 3.6} fill={t.green} filter="url(#brilho)"><title>{`${fmtDia(d[0])} — ${fmtBRL(d[1])}`}</title></circle>
        ))}
        <text x={padL} y={H - 9} fontFamily="'JetBrains Mono', monospace" fontSize={compacto ? 10 : 11} fill={t.muted}>{serie[0][0].slice(8, 10)}/{serie[0][0].slice(5, 7)}</text>
        <text x={W - padR} y={H - 9} textAnchor="end" fontFamily="'JetBrains Mono', monospace" fontSize={compacto ? 10 : 11} fill={t.muted}>
          {serie[serie.length - 1][0].slice(8, 10)}/{serie[serie.length - 1][0].slice(5, 7)}
        </text>
      </svg>
    </div>
  );
}

/* barras do lucro por operação, com o valor em cima */
function BarrasOperacao({ t, dados }) {
  if (!dados.length) {
    return <div style={{ fontFamily: t.mono, fontSize: 11, color: t.muted, letterSpacing: 1, padding: "26px 0", textAlign: "center" }}>SEM MOVIMENTO REGISTRADO</div>;
  }
  const [caixa, W] = useLargura(320);
  const compacto = W < 560;
  const H = compacto ? 210 : 260;
  const padT = 30, padB = 46, padL = 14, padR = 14;
  const vals = dados.map((d) => d.value);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const span = (max - min) || 1;
  const aw = W - padL - padR, ah = H - padT - padB;
  const passo = aw / dados.length;
  const larg = Math.min(compacto ? 34 : 56, passo * 0.52);
  const y0 = padT + ah - ((0 - min) / span) * ah;
  const rotulo = (v) => Math.abs(v) >= 100000 ? `R$ ${(v / 1000).toFixed(0)} mil`
    : Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace(".", ",")} mil`
    : fmtBRL(v);
  return (
    <div ref={caixa} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }}>
        <defs>
          <filter id="brilhoBarra" x="-60%" y="-40%" width="220%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="barraVerde" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.green} stopOpacity="1" />
            <stop offset="100%" stopColor={t.green} stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="barraVermelha" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.red} stopOpacity="1" />
            <stop offset="100%" stopColor={t.red} stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke={t.line} />
        {dados.map((d, i) => {
          const yv = padT + ah - ((d.value - min) / span) * ah;
          const alt = Math.max(2, Math.abs(y0 - yv));
          const x = padL + i * passo + (passo - larg) / 2;
          const y = d.value >= 0 ? yv : y0;
          const cor = d.value < 0 ? t.red : t.green;
          return (
            <g key={d.name}>
              <title>{`${d.name} — ${fmtBRL(d.value)}`}</title>
              <rect x={x} y={y} width={larg} height={alt}
                fill={d.value < 0 ? "url(#barraVermelha)" : "url(#barraVerde)"} filter="url(#brilhoBarra)" />
              <text x={x + larg / 2} y={d.value >= 0 ? y - 8 : y + alt + 14} textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace" fontSize={compacto ? 9 : 10.5} fill={cor}>{rotulo(d.value)}</text>
              <text x={x + larg / 2} y={H - 12} textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace" fontSize={compacto ? 9 : 10.5} fill={t.muted}>
                {d.name.length > (compacto ? 7 : 12) ? d.name.slice(0, compacto ? 6 : 11) + "…" : d.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}


/* calculadora simples, abre por cima da tela */
function Calculadora({ t, onFechar }) {
  const [visor, setVisor] = useState("0");
  const [anterior, setAnterior] = useState(null);
  const [op, setOp] = useState(null);
  const [novo, setNovo] = useState(true);

  const mostra = (n) => {
    if (!isFinite(n)) return "erro";
    const r = Math.round(n * 1e10) / 1e10;
    return String(r).replace(".", ",");
  };
  const valor = () => parseNum(visor);

  const digito = (d) => {
    if (novo) { setVisor(d === "," ? "0," : d); setNovo(false); return; }
    if (d === "," && visor.includes(",")) return;
    setVisor(visor === "0" && d !== "," ? d : visor + d);
  };
  const resolve = (a, b, o) => o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : o === "÷" ? (b === 0 ? NaN : a / b) : b;
  const operar = (o) => {
    const v = valor();
    if (anterior !== null && op && !novo) {
      const r = resolve(anterior, v, op);
      setVisor(mostra(r)); setAnterior(r);
    } else setAnterior(v);
    setOp(o); setNovo(true);
  };
  const igual = () => {
    if (anterior === null || !op) return;
    const r = resolve(anterior, valor(), op);
    setVisor(mostra(r)); setAnterior(null); setOp(null); setNovo(true);
  };
  const limpar = () => { setVisor("0"); setAnterior(null); setOp(null); setNovo(true); };
  const apagar = () => {
    if (novo) return;
    const v = visor.slice(0, -1);
    setVisor(v === "" || v === "-" ? "0" : v);
  };
  const pct = () => { setVisor(mostra(valor() / 100)); setNovo(true); };
  const inverter = () => setVisor(mostra(valor() * -1));

  const tecla = (rot, aoTocar, destaque) => (
    <button key={rot} onClick={aoTocar}
      style={{ padding: "15px 0", border: `1px solid ${t.line}`, background: destaque === "op" ? t.focus : "transparent",
        color: destaque === "ac" ? t.red : destaque === "eq" ? t.ink : t.text,
        backgroundColor: destaque === "eq" ? t.green : destaque === "op" ? t.focus : "transparent",
        fontFamily: t.mono, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
      {rot}
    </button>
  );

  return (
    <div onClick={onFechar}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.72)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 320, background: t.panel, border: `1px solid ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${t.line}` }}>
          <span className="ct-label">Calculadora</span>
          <button onClick={onFechar} style={t.iconBtn} title="Fechar"><X size={14} /></button>
        </div>
        <div style={{ padding: "18px 16px", textAlign: "right", borderBottom: `1px solid ${t.line}`, minHeight: 74 }}>
          {op && anterior !== null && (
            <div style={{ fontFamily: t.mono, fontSize: 11, color: t.muted }}>{mostra(anterior)} {op}</div>
          )}
          <div style={{ fontFamily: t.mono, fontSize: 30, fontWeight: 700, color: t.text, wordBreak: "break-all", lineHeight: 1.2 }}>{visor}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: t.line, padding: 1 }}>
          {tecla("AC", limpar, "ac")}
          {tecla("±", inverter, "op")}
          {tecla("%", pct, "op")}
          {tecla("÷", () => operar("÷"), "op")}
          {["7","8","9"].map((d) => tecla(d, () => digito(d)))}
          {tecla("×", () => operar("×"), "op")}
          {["4","5","6"].map((d) => tecla(d, () => digito(d)))}
          {tecla("−", () => operar("−"), "op")}
          {["1","2","3"].map((d) => tecla(d, () => digito(d)))}
          {tecla("+", () => operar("+"), "op")}
          {tecla("0", () => digito("0"))}
          {tecla(",", () => digito(","))}
          {tecla("⌫", apagar)}
          {tecla("=", igual, "eq")}
        </div>
      </div>
    </div>
  );
}


/* uma linha da conta do Total: rótulo à esquerda, valor à direita */
function Linha({ t, rot, valor, forte, total }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14,
      padding: total ? "16px 0 4px" : "11px 0",
      borderTop: total ? `1px solid ${t.edge}` : "none",
      marginTop: total ? 10 : 0,
    }}>
      <span style={{ fontSize: total ? 12 : 12.5, color: total || forte ? t.text : t.muted,
        fontWeight: total ? 700 : 400, letterSpacing: total ? 1.4 : 0,
        textTransform: total ? "uppercase" : "none" }}>{rot}</span>
      <Money t={t} value={valor} tone={total ? "vivo" : "auto"} size={total ? 20 : 14} sign={!forte || total} />
    </div>
  );
}


function NavBtn({ t, active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className="ct-item" style={{
      display: "flex", alignItems: "center", gap: 9, padding: "9px 8px", border: "none",
      background: active ? t.hover : "transparent",
      boxShadow: active ? `inset 2px 0 0 ${t.red}` : "none",
      color: active ? t.text : t.muted,
      fontSize: 12, fontWeight: 600, letterSpacing: .6, textAlign: "left",
    }}>
      {icon}{label}
    </button>
  );
}

function InlineInput({ t, placeholder, initialValue, onSubmit, onCancel }) {
  const [v, setV] = useState(initialValue || "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 7px", border: `1px solid ${t.red}`, background: t.focus }}>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(v); if (e.key === "Escape") onCancel(); }}
        style={{ flex: 1, background: "transparent", border: "none", color: t.text, fontSize: 12.5, outline: "none", minWidth: 0 }} />
      <button onClick={() => onSubmit(v)} style={t.iconBtn} title="Salvar"><Check size={12} color={t.text} /></button>
      <button onClick={onCancel} style={t.iconBtn} title="Cancelar"><X size={12} /></button>
    </div>
  );
}

function Panel({ t, label, right, children, pad = "18px 22px 22px" }) {
  return (
    <section className="ct-panel">
      {(label || right) && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "16px 22px" }}>
            <span className="ct-label">{label}</span>
            {right}
          </div>
          <div className="ct-rule" />
        </>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </section>
  );
}

/* Money: small muted R$, big digits, faded cents, + on gains */
function Money({ t, value, tone, size = 24, sign = false }) {
  const n = Number(value) || 0;
  const color = tone === "loss" || (tone === "auto" && n < 0) ? t.red
    : (tone === "gain" || (tone === "vivo" && n > 0)) ? t.green : t.text;
  const digits = fmtBRL(Math.abs(n)).replace(/[^\d.,]/g, "");
  const [inteiro, centavos] = digits.split(",");
  const prefix = n < 0 ? "−" : sign && n > 0 ? "+" : "";
  return (
    <span style={{ fontFamily: t.mono, display: "inline-flex", alignItems: "baseline", gap: 4, lineHeight: 1 }}>
      <span style={{ fontSize: Math.round(size * 0.4), fontWeight: 500, color: t.muted }}>R$</span>
      <span style={{ fontSize: size, fontWeight: 700, color, letterSpacing: -0.5,
        textShadow: color === t.green ? `0 0 18px ${t.green}66` : color === t.red ? `0 0 16px ${t.red}44` : "none" }}>{prefix}{inteiro}</span>
      <span style={{ fontSize: Math.round(size * 0.48), fontWeight: 500, color, opacity: 0.4 }}>,{centavos || "00"}</span>
    </span>
  );
}

function Readout({ t, label, value, tone, size = 22, sign = false, raw }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
      <span className="ct-label">{label}</span>
      {raw !== undefined
        ? <span style={{ fontFamily: t.mono, fontSize: size, fontWeight: 700, color: tone === "loss" ? t.red : tone === "gain" ? t.green : t.text, letterSpacing: -0.3 }}>{raw}</span>
        : <Money t={t} value={value} tone={tone} size={size} sign={sign} />}
    </div>
  );
}


function PageHead({ t, eyebrow, title, sub, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 2.2, color: t.muted }}>{eyebrow}</span>
        <h1 style={{ fontFamily: t.display, fontSize: 40, letterSpacing: 0.5, textTransform: "uppercase", color: t.text, margin: "10px 0 0", lineHeight: .95, wordBreak: "break-word", display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <span>{title}<span style={{ color: t.red }}>.</span></span>
          <Skull size={26} color={t.line} style={{ marginBottom: 4 }} />
        </h1>
        {sub && <p style={{ fontFamily: t.mono, fontSize: 10.5, letterSpacing: 1.2, color: t.muted, margin: "12px 0 0" }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

/* ---------- Dashboard: soma de todas as operações ---------- */

function Dashboard({ t, kpis, porOperacao, totais, opsCount, contasCount, data, persist, recarregar, buscando, atualizado, porMes, porDia }) {
  const [modo, setModo] = useState(null);
  const [txt, setTxt] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState(null);

  const abrirBackup = async () => {
    const json = JSON.stringify(data, null, 2);
    setTxt(json); setModo("export"); setAviso(null);
    const ok = await copyText(json);
    if (ok) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
  };

  const aplicar = () => {
    try {
      const j = JSON.parse(txt);
      const lista = Array.isArray(j.sheets) ? j.sheets : Array.isArray(j.ops) ? j.ops : null;
      if (!lista) throw new Error("formato");
      persist({
        theme: j.theme === "light" ? "light" : "dark",
        folders: Array.isArray(j.folders) ? j.folders : [],
        sheets: lista,
        rows: j.rows && typeof j.rows === "object" ? j.rows : {},
        contas: Array.isArray(j.contas) ? j.contas : [],
      });
      setModo(null); setTxt("");
    } catch (e) {
      setAviso("Não consegui ler esse texto. Cole o backup inteiro, do { até o }.");
    }
  };

  const serie = Object.entries(porDia).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);

  const rank = porOperacao.filter((h) => h.value !== 0);
  const lucroTotal = rank.filter((h) => h.value > 0).reduce((a, h) => a + h.value, 0);
  const prejuizoTotal = rank.filter((h) => h.value < 0).reduce((a, h) => a - h.value, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHead t={t} eyebrow="SOMA DE TODAS AS OPERAÇÕES" title="Dashboard"
        sub={`${opsCount} OPERAÇÕES · ${kpis.ops} REGISTROS · ${contasCount} CONTAS` +
          (atualizado ? ` · SALVO ${atualizado.slice(0, 16).replace("T", " ")}` : "")}
        actions={
          <>
            <button onClick={async () => {
                const r = await recarregar(true);
                setAviso(
                  r === "novo" ? "Pronto — trouxe os dados mais recentes do outro aparelho."
                  : r === "igual" ? `Tudo em dia. Nada mudou desde ${atualizado ? atualizado.slice(0, 16).replace("T", " ") : "o último salvamento"}.`
                  : r === "vazio" ? "Ainda não há nada salvo na sua conta. Lance algo primeiro."
                  : "Não consegui ler o armazenamento. Recarregue a página e tente de novo."
                );
                setModo(null);
                setTimeout(() => setAviso(null), 5000);
              }} className="ct-btn ct-btn-line">
              <RefreshCw size={13} style={buscando ? { animation: "ct-spin .7s linear infinite" } : undefined} />
              {buscando ? "Buscando" : "Sincronizar"}
            </button>
            <button onClick={abrirBackup} className="ct-btn ct-btn-line">
              {copiado ? <Check size={13} /> : <Copy size={13} />}{copiado ? "Copiado" : "Backup"}
            </button>
            <button onClick={() => { setModo("import"); setTxt(""); setAviso(null); }} className="ct-btn ct-btn-line">
              Restaurar
            </button>
          </>
        } />

      {aviso && !modo && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${t.line}`,
          borderLeft: `2px solid ${t.red}`, background: t.panel, padding: "11px 14px", fontSize: 12.5, color: t.muted }}>
          {aviso}
        </div>
      )}

      {(modo === "export" || modo === "import") && (
        <Panel t={t} label={modo === "export" ? "Backup — copie este texto" : "Restaurar — cole o backup aqui"}>
          <p style={{ fontSize: 12.5, color: t.muted, margin: "0 0 10px" }}>
            {modo === "export"
              ? (copiado ? "Já copiei para a área de transferência. Agora mande este texto para o celular e cole no app, em COLAR BACKUP." : "Selecione tudo (Ctrl+A) e copie (Ctrl+C).")
              : "Cole o texto do backup e clique em Aplicar. Isso substitui os dados atuais."}
          </p>
          <textarea
            readOnly={modo === "export"}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            onFocus={(e) => { if (modo === "export") e.target.select(); }}
            placeholder={modo === "import" ? '{ "theme": "dark", ... }' : ""}
            style={{ width: "100%", minHeight: 170, background: t.focus, border: `1px solid ${t.line}`, color: t.text, fontFamily: t.mono, fontSize: 11.5, padding: 10, outline: "none", resize: "vertical", borderRadius: 10 }} />
          {aviso && <p style={{ fontSize: 12, color: t.red, margin: "10px 0 0" }}>{aviso}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {modo === "import" && <button onClick={aplicar} className="ct-btn ct-btn-solid"><Check size={13} /> Aplicar</button>}
            <button onClick={() => { setModo(null); setAviso(null); }} className="ct-btn ct-btn-line">Fechar</button>
          </div>
        </Panel>
      )}

      <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <Panel t={t} label="Lucro total" pad="14px 18px 16px"><Money t={t} value={lucroTotal} tone="gain" size={22} /></Panel>
        <Panel t={t} label="Prejuízo total" pad="14px 18px 16px"><Money t={t} value={prejuizoTotal} tone="loss" size={22} /></Panel>
        <Panel t={t} label="Resultado líquido" pad="14px 18px 16px"><Money t={t} value={totais.liquido} tone="vivo" size={22} sign /></Panel>
        <Panel t={t} label={`Lucro do mês · ${fmtMes(kpis.mesAtual)}`} pad="14px 18px 16px"><Money t={t} value={porMes[kpis.mesAtual] || 0} tone="vivo" size={22} sign /></Panel>
        <Panel t={t} label="Planilhas (operações)" pad="14px 18px 16px">
          <span style={{ fontFamily: t.mono, fontSize: 22, fontWeight: 700, color: t.text }}>{opsCount}</span>
        </Panel>
      </div>

      <Panel t={t} label="Lucro por dia"
        right={<span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.3, color: t.muted }}>
          {serie.length ? `ÚLTIMOS ${serie.length} DIAS` : "SEM MOVIMENTO"}
        </span>}>
        <LinhaDia t={t} serie={serie} />
      </Panel>

      <Panel t={t} label="Lucro por planilha"
        right={<span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.3, color: t.muted }}>{rank.length} ATIVAS</span>}>
        <BarrasOperacao t={t} dados={rank} />
      </Panel>

    </div>
  );
}

/* ---------- Operação ---------- */

function calcOperacao(op, rows) {
  const totalDep = rows.reduce((a, r) => a + parseNum(r.depositado), 0);
  const totalSaq = rows.reduce((a, r) => a + getSacado(r), 0);
  const lucroBruto = totalSaq - totalDep;
  const comissaoPct = op.comissao ?? 50;
  /* aproveita a taxa salva nas versões antigas (campo corteLula) */
  const lulaPct = op.lulaPct ?? op.corteLula ?? LULA_PADRAO;

  const perdaAtiva = !!op.perdaAtiva;
  const perdaFixa = parseNum(op.perdaFixa);
  const qtdContas = rows.length;
  const totalPago = rows.reduce((a, r) => a + parseNum(r.pago), 0);

  /* resultado separado por saque */
  const totalSaq1 = rows.reduce((a, r) => a + parseNum(r.sacado1), 0);
  const totalSaq2 = rows.reduce((a, r) => a + parseNum(r.sacado2), 0);
  const lucroSaque1 = totalSaq1 - totalDep;   /* 1º saque: recupera o depósito */
  const lucroSaque2 = totalSaq2;              /* 2º saque: rendimento puro */

  const coberturaPerda = perdaAtiva ? perdaFixa * qtdContas : 0;

  let corteProgramador, suaParte, baseLula, baseAcerto, minhaParteCalc;
  if (perdaAtiva) {
    /* a perda fixa sai SÓ do 2º saque. O 1º saque é 100% seu e fica de fora
       da divisão; o reembolso volta inteiro pra você por fora. */
    baseAcerto = lucroSaque2 - coberturaPerda;
    /* prejuízo não se divide: ninguém leva percentual de resultado negativo */
    corteProgramador = baseAcerto > 0 ? baseAcerto * (comissaoPct / 100) : 0;
    /* base negativa = o programador está cobrindo. Nada entra na divisão,
       e o reembolso da perda garantida chega inteiro em você. */
    minhaParteCalc = baseAcerto > 0 ? baseAcerto - corteProgramador : 0;
    baseLula = minhaParteCalc;
    suaParte = minhaParteCalc + lucroSaque1 + coberturaPerda;
  } else {
    /* sem perda fixa: divide o resultado inteiro */
    baseAcerto = lucroBruto;
    corteProgramador = baseAcerto > 0 ? baseAcerto * (comissaoPct / 100) : 0;
    suaParte = baseAcerto - corteProgramador;
    baseLula = suaParte;
    minhaParteCalc = suaParte;
  }
  const corteLula = baseLula > 0 ? baseLula * (lulaPct / 100) : 0;
  /* o fornecedor tira a parte dele SÓ do SEU lucro — depois de tudo,
     inclusive do 1º saque e do reembolso da perda garantida */
  const fornecedorNome = op.fornecedorNome || "";
  const fornecedorPct = parseNum(op.fornecedorPct);
  const seuLucroAntesFornecedor = suaParte - corteLula;
  const baseFornecedor = seuLucroAntesFornecedor;
  const corteFornecedor = seuLucroAntesFornecedor > 0 ? seuLucroAntesFornecedor * (fornecedorPct / 100) : 0;
  /* o que sobra pela conta do programador */
  const liquidoPeloCalculo = minhaParteCalc - corteLula - corteFornecedor;
  /* o que você recebe de fato */
  const lucroLiquido = suaParte - corteLula - corteFornecedor - totalPago;

  return { totalDep, totalSaq, totalSaq1, totalSaq2, lucroBruto, lucroSaque1, lucroSaque2,
    comissaoPct, lulaPct, perdaAtiva, perdaFixa, qtdContas, coberturaPerda,
    baseAcerto, corteProgramador, minhaParteCalc, baseLula, corteLula,
    fornecedorNome, fornecedorPct, corteFornecedor, baseFornecedor,
    liquidoPeloCalculo, totalPago, lucroLiquido };
}

/* lucro líquido real agrupado por período (mês ou dia).
   Aplica o acerto completo sobre as linhas daquele período, em cada operação. */
function liquidoPorPeriodo(sheets, rowsMap, recorte) {
  const mapa = {};
  (sheets || []).forEach((op) => {
    const grupos = {};
    (rowsMap[op.id] || []).forEach((r) => {
      const iso = typeof r.data === "string" && r.data.length >= 10 ? r.data.slice(0, 10) : null;
      if (!iso) return;
      const k = recorte(iso);
      (grupos[k] = grupos[k] || []).push(r);
    });
    Object.keys(grupos).forEach((k) => {
      mapa[k] = (mapa[k] || 0) + calcOperacao(op, grupos[k]).lucroLiquido;
    });
  });
  return mapa;
}


/* tabela de contas — usada pela operação e por cada fornecedor */
function TabelaContas({ t, rows, onCell, onDel, onDup, onAdd, rotulo = "Contas" }) {
  const totDep = rows.reduce((a, r) => a + parseNum(r.depositado), 0);
  const totS1 = rows.reduce((a, r) => a + parseNum(r.sacado1), 0);
  const totS2 = rows.reduce((a, r) => a + parseNum(r.sacado2), 0);
  const totPago = rows.reduce((a, r) => a + parseNum(r.pago), 0);
  return (
    <div className="ct-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px" }}>
        <span className="ct-label">{rotulo}</span>
        <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.3, color: t.muted }}>{rows.length} LINHAS</span>
      </div>
      <div className="ct-scroll" style={{ overflow: "auto", borderTop: `1px solid ${t.line}` }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, tableLayout: "fixed" }}>
          <thead>
            <tr>
              {COLUMNS.map((c) => <th key={c.key} style={{ ...t.th, width: c.width, minWidth: c.width }}>{c.label}</th>)}
              <th style={{ ...t.th, width: 112 }}>Lucro</th>
              <th style={{ ...t.th, width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lucro = getSacado(r) - parseNum(r.depositado);
              return (
                <tr key={r.id} className="ct-row" style={{ borderTop: `1px solid ${t.line}` }}>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="ct-cell" style={t.td}>
                      {col.type === "number" ? (
                        <NumInput t={t} value={r[col.key]} onChange={(v) => onCell(r.id, col.key, v)} />
                      ) : (
                        <input type="text" value={r[col.key] ?? ""} onChange={(e) => onCell(r.id, col.key, e.target.value)} />
                      )}
                    </td>
                  ))}
                  <td style={{ ...t.td, padding: "6px 8px" }}>
                    <Money t={t} value={lucro} tone="auto" size={13} sign />
                  </td>
                  <td style={t.td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => onDup(r.id)} title="Duplicar" style={t.iconBtn}><Copy size={12} /></button>
                      <button onClick={() => onDel(r.id)} title="Excluir" style={t.iconBtn}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 2} style={{ padding: "26px 18px", textAlign: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <Skull size={26} color={t.line} />
                  <span style={{ fontFamily: t.mono, fontSize: 11, color: t.muted, letterSpacing: 1.1 }}>NENHUMA CONTA AINDA</span>
                </div>
              </td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `2px solid ${t.red}` }}>
                <td style={{ ...t.td, padding: "10px 8px", fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4, color: t.muted }}>SOMA</td>
                <td style={{ ...t.td, padding: "10px 8px", textAlign: "right", fontFamily: t.mono, fontSize: 12.5, fontWeight: 700, color: t.text }}>{fmtNum(totDep)}</td>
                <td style={{ ...t.td, padding: "10px 8px", textAlign: "right", fontFamily: t.mono, fontSize: 12.5, fontWeight: 700, color: t.text }}>{fmtNum(totS1)}</td>
                <td style={{ ...t.td, padding: "10px 8px", textAlign: "right", fontFamily: t.mono, fontSize: 12.5, fontWeight: 700, color: t.red }}>{fmtNum(totS2)}</td>
                <td style={{ ...t.td, padding: "10px 8px", textAlign: "right", fontFamily: t.mono, fontSize: 12.5, fontWeight: 700, color: t.text }}>{fmtNum(totPago)}</td>
                <td style={t.td} /><td style={t.td} /><td style={t.td} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ borderTop: `1px solid ${t.line}`, padding: "10px 14px" }}>
        <button onClick={onAdd} className="ct-btn ct-btn-line"><Plus size={13} /> Adicionar conta</button>
      </div>
    </div>
  );
}

/* um fornecedor: percentuais, perda garantida, contas e resultado próprios */
function FornecedorBloco({ t, opId, f, updateFornecedor, deleteFornecedor, addFornRow, updateFornCell, deleteFornRow, duplicarFornRow }) {
  const [aberto, setAberto] = useState(true);
  const [confirmar, setConfirmar] = useState(false);
  const up = (campo, v) => updateFornecedor(opId, f.id, campo, v);

  const rows = f.rows || [];
  const c = calcOperacao({
    comissao: f.comissao ?? 50,
    lulaPct: f.lulaPct ?? LULA_PADRAO,
    perdaAtiva: !!f.perdaAtiva,
    perdaFixa: f.perdaFixa,
    fornecedorNome: f.nome,
    fornecedorPct: f.pct,
  }, rows);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel t={t} label={null}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => setAberto((v) => !v)} style={t.iconBtn} title={aberto ? "Recolher" : "Expandir"}>
            {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <TextoInput t={t} label="" value={f.nome} placeholder="Nome do fornecedor"
            onChange={(v) => up("nome", v)} width={200} />
          <PctInput t={t} label="% FORNECEDOR" value={f.pct} onChange={(v) => up("pct", v)} />
          <PctInput t={t} label="% PROGRAMADOR" value={f.comissao ?? 50} onChange={(v) => up("comissao", v)} />
          <PctInput t={t} label="% LULA" value={f.lulaPct ?? LULA_PADRAO} onChange={(v) => up("lulaPct", v)} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Toggle t={t} label="PERDA GARANTIDA" on={!!f.perdaAtiva} onChange={(v) => up("perdaAtiva", v)} />
            {f.perdaAtiva && <ValorInput t={t} label="" value={f.perdaFixa} onChange={(v) => up("perdaFixa", v)} />}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {confirmar ? (
              <>
                <button onClick={() => deleteFornecedor(opId, f.id)} className="ct-btn ct-btn-red"><Check size={13} /> Excluir</button>
                <button onClick={() => setConfirmar(false)} className="ct-btn ct-btn-line">Cancelar</button>
              </>
            ) : (
              <button onClick={() => setConfirmar(true)} style={t.iconBtn} title="Excluir fornecedor"><Trash2 size={13} /></button>
            )}
          </div>
        </div>

        {aberto && (
          <>
            <div className="ct-rule" style={{ margin: "18px 0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 18 }}>
              <Readout t={t} label="Investido" value={c.totalDep} size={20} />
              <Readout t={t} label="Retornado" value={c.totalSaq} size={20} />
              <Readout t={t} label="Lucro bruto" value={c.lucroBruto} tone="auto" size={20} sign />
              <Readout t={t} label={`Corte fornecedor (${fmtPctBR(parseNum(f.pct))})`} value={c.corteFornecedor} size={20} />
              <Readout t={t} label={`Corte programador (${fmtPctBR(f.comissao ?? 50)})`} value={c.corteProgramador} size={20} />
              <Readout t={t} label={`Lula (${fmtPctBR(f.lulaPct ?? LULA_PADRAO)})`} value={c.corteLula} size={20} />
              <Readout t={t} label="Pra você" value={c.lucroLiquido} tone="auto" size={26} sign />
            </div>
          </>
        )}
      </Panel>

      {aberto && (
        <TabelaContas t={t} rows={rows} rotulo={f.nome ? `Contas de ${f.nome}` : "Contas do fornecedor"}
          onCell={(rowId, key, v) => updateFornCell(opId, f.id, rowId, key, v)}
          onDel={(rowId) => deleteFornRow(opId, f.id, rowId)}
          onDup={(rowId) => duplicarFornRow(opId, f.id, rowId)}
          onAdd={() => addFornRow(opId, f.id)} />
      )}
    </div>
  );
}


function OperacaoView({ t, op, rows, updateCell, addRow, deleteRow, duplicateRow, deleteOp, updateOpComissao, updateOpLula, updateOpPerdaFixa, updateOpPerdaAtiva,
  addFornecedor, updateFornecedor, deleteFornecedor, addFornRow, updateFornCell, deleteFornRow, duplicarFornRow, onNew }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [verConta, setVerConta] = useState(false);
  const [sub, setSub] = useState("contas");
  /* cada fornecedor calculado com os percentuais dele */
  const fornCalc = (op && op.fornecedores ? op.fornecedores : []).map((f) => ({
    f,
    c: calcOperacao({
      comissao: f.comissao ?? 50, lulaPct: f.lulaPct ?? LULA_PADRAO,
      perdaAtiva: !!f.perdaAtiva, perdaFixa: f.perdaFixa,
      fornecedorNome: f.nome, fornecedorPct: f.pct,
    }, f.rows || []),
  }));
  const somaF = (sel) => fornCalc.reduce((a, x) => a + sel(x.c), 0);
  const somaFornecedores = somaF((x) => x.lucroLiquido);

  if (!op) {
    return (
      <Panel t={t} label="Nenhuma operação aberta">
        <p style={{ fontSize: 12.5, color: t.muted, margin: "0 0 14px" }}>
          Escolha uma operação na lateral ou nas abas acima.
        </p>
        <button onClick={onNew} className="ct-btn ct-btn-solid"><Plus size={13} /> Nova operação</button>
      </Panel>
    );
  }

  const c = calcOperacao(op, rows);
  const { totalDep, totalSaq, lucroSaque1, lucroSaque2, comissaoPct, lulaPct,
    perdaAtiva, perdaFixa, qtdContas, coberturaPerda, baseAcerto, corteProgramador,
    minhaParteCalc, corteLula, liquidoPeloCalculo, totalPago, lucroLiquido,
    fornecedorNome, fornecedorPct, corteFornecedor, lucroBruto, baseLula } = c;

  const temForn = fornCalc.length > 0;
  /* G = geral: suas contas + todos os fornecedores */
  const G = {
    dep: c.totalDep + somaF((x) => x.totalDep),
    saq: c.totalSaq + somaF((x) => x.totalSaq),
    bruto: c.lucroBruto + somaF((x) => x.lucroBruto),
    prog: c.corteProgramador + somaF((x) => x.corteProgramador),
    lula: c.corteLula + somaF((x) => x.corteLula),
    forn: c.corteFornecedor + somaF((x) => x.corteFornecedor),
    pago: c.totalPago + somaF((x) => x.totalPago),
    liquido: c.lucroLiquido + somaFornecedores,
    liqCalc: c.liquidoPeloCalculo + somaF((x) => x.liquidoPeloCalculo),
    qtd: c.qtdContas + fornCalc.reduce((a, x) => a + x.c.qtdContas, 0),
  };
  /* quanto do reembolso da perda garantida realmente entrou — assim a conta fecha certinho */
  G.reembolso = G.liquido + G.lula + G.forn + G.pago + G.prog - G.bruto;


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      <PageHead t={t} eyebrow="OPERAÇÃO" title={op.name}
        sub={`${rows.length} ${rows.length === 1 ? "CONTA REGISTRADA" : "CONTAS REGISTRADAS"}`}
        actions={
          <>
            <button onClick={addRow} className="ct-btn ct-btn-solid"><Plus size={13} /> Nova conta</button>
            {confirmDelete ? (
              <>
                <button onClick={() => deleteOp(op.id)} className="ct-btn ct-btn-red"><Check size={13} /> Confirmar</button>
                <button onClick={() => setConfirmDelete(false)} className="ct-btn ct-btn-line">Cancelar</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="ct-btn ct-btn-red"><Trash2 size={13} /> Excluir</button>
            )}
          </>
        } />

      {/* abas internas da operação */}
      <div className="ct-scroll" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: `1px solid ${t.line}`, paddingBottom: 10 }}>
        {[["contas", "Contas"], ["fornecedor", "Fornecedor"], ["total", "Total"]].map(([id, rot]) => (
          <button key={id} onClick={() => setSub(id)}
            style={{ padding: "9px 15px", borderRadius: 10,
              border: `1px solid ${sub === id ? t.line : "transparent"}`,
              background: sub === id ? t.panel : "transparent",
              boxShadow: sub === id ? `inset 0 1px 0 ${t.sheen}` : "none",
              color: sub === id ? t.text : t.muted, transition: "all .16s ease",
              fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {rot}
          </button>
        ))}
      </div>

      {sub === "contas" && (
        <Panel t={t} label="Divisão do resultado">
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <PctInput t={t} label="PROGRAMADOR" value={comissaoPct} onChange={(v) => updateOpComissao(op.id, v)} />
            <PctInput t={t} label="LULA" value={lulaPct} onChange={(v) => updateOpLula(op.id, v)} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Toggle t={t} label="PERDA FIXA" on={perdaAtiva} onChange={(v) => updateOpPerdaAtiva(op.id, v)} />
              {perdaAtiva && <ValorInput t={t} label="" value={perdaFixa} onChange={(v) => updateOpPerdaFixa(op.id, v)} />}
            </div>
          </div>
          <div className="ct-rule" style={{ margin: "18px 0" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 18 }}>
            <Readout t={t} label="Total investido" value={totalDep} size={20} />
            <Readout t={t} label="Total retornado" value={totalSaq} size={20} />
            <Readout t={t} label="Lucro bruto" value={lucroBruto} tone="auto" size={20} sign />
            <Readout t={t} label="Corte programador" value={corteProgramador} size={20} />
            <Readout t={t} label="Seu lucro líquido" value={lucroLiquido} tone="auto" size={20} sign />
          </div>
        </Panel>
      )}

      {sub === "fornecedor" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {(op.fornecedores || []).map((f) => (
            <FornecedorBloco key={f.id} t={t} opId={op.id} f={f}
              updateFornecedor={updateFornecedor} deleteFornecedor={deleteFornecedor}
              addFornRow={addFornRow} updateFornCell={updateFornCell}
              deleteFornRow={deleteFornRow} duplicarFornRow={duplicarFornRow} />
          ))}
          {(op.fornecedores || []).length === 0 && (
            <Panel t={t} label="Nenhum fornecedor">
              <p style={{ fontSize: 12.5, color: t.muted, margin: "0 0 14px" }}>
                Cada fornecedor tem as contas dele, com percentuais e perda garantida próprios.
              </p>
            </Panel>
          )}
          <button onClick={() => addFornecedor(op.id)} className="ct-btn ct-btn-solid" style={{ alignSelf: "flex-start" }}>
            <Plus size={13} /> Adicionar fornecedor
          </button>
        </div>
      )}

      {sub === "total" && (
        <Panel t={t} label="Total">
          {/* o número que importa */}
          <Readout t={t} label="Seu lucro líquido real" value={G.liquido} tone="vivo" size={40} sign />
          <p style={{ fontFamily: t.mono, fontSize: 11, color: t.muted, margin: "12px 0 0", letterSpacing: .6 }}>
            {G.qtd} {G.qtd === 1 ? "CONTA" : "CONTAS"} · {fmtBRL(G.dep)} INVESTIDOS · {fmtBRL(G.saq)} RETORNADOS
            {temForn ? ` · ${fornCalc.length} ${fornCalc.length === 1 ? "FORNECEDOR" : "FORNECEDORES"}` : ""}
          </p>

          <div className="ct-rule" style={{ margin: "22px 0 4px" }} />

          {/* a conta, de cima para baixo */}
          <Linha t={t} rot="Lucro bruto" valor={G.bruto} forte />
          <Linha t={t} rot="Programador" valor={-G.prog} />
          <Linha t={t} rot="Lula" valor={-G.lula} />
          {G.forn !== 0 && <Linha t={t} rot="Fornecedores" valor={-G.forn} />}
          {G.pago !== 0 && <Linha t={t} rot="Pago aos clientes" valor={-G.pago} />}
          {Math.abs(G.reembolso) > 0.005 && <Linha t={t} rot="Reembolso da perda garantida" valor={G.reembolso} />}
          <Linha t={t} rot="Seu lucro líquido" valor={G.liquido} total />

          {temForn && (
            <>
              <div className="ct-rule" style={{ margin: "26px 0 16px" }} />
              <span className="ct-label">De onde vem</span>
              <div className="ct-scroll" style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 460 }}>
                  <thead>
                    <tr>
                      <th style={{ ...t.th, width: 180 }}>Origem</th>
                      <th style={{ ...t.th, textAlign: "right" }}>Bruto</th>
                      <th style={{ ...t.th, textAlign: "right" }}>Pra você</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="ct-row" style={{ borderTop: `1px solid ${t.line}` }}>
                      <td style={{ ...t.td, padding: "12px 9px", fontSize: 12.5, fontWeight: 600, color: t.text }}>Suas contas</td>
                      <td style={{ ...t.td, padding: "12px 9px", textAlign: "right" }}><Money t={t} value={lucroBruto} tone="auto" size={13} sign /></td>
                      <td style={{ ...t.td, padding: "12px 9px", textAlign: "right" }}><Money t={t} value={lucroLiquido} tone="vivo" size={13} sign /></td>
                    </tr>
                    {fornCalc.map(({ f, c: cf }) => (
                      <tr key={f.id} className="ct-row" style={{ borderTop: `1px solid ${t.line}` }}>
                        <td style={{ ...t.td, padding: "12px 9px", fontSize: 12.5, color: t.muted }}>{f.nome || "Fornecedor sem nome"}</td>
                        <td style={{ ...t.td, padding: "12px 9px", textAlign: "right" }}><Money t={t} value={cf.lucroBruto} tone="auto" size={13} sign /></td>
                        <td style={{ ...t.td, padding: "12px 9px", textAlign: "right" }}><Money t={t} value={cf.lucroLiquido} tone="vivo" size={13} sign /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="ct-rule" style={{ margin: "20px 0 14px" }} />
          <button onClick={() => setVerConta((v) => !v)} className="ct-btn ct-btn-line">
            {verConta ? "Esconder a conta" : "Ver a conta passo a passo"}
          </button>
          {verConta && (
            <div style={{ fontFamily: t.mono, fontSize: 11.5, color: t.muted, lineHeight: 2, marginTop: 14 }}>
              <div>contas lançadas .................. {qtdContas}</div>
              <div>total depositado ................. {fmtBRL(totalDep)}</div>
              <div>total saque 1 .................... {fmtBRL(c.totalSaq1)}</div>
              <div>total saque 2 .................... {fmtBRL(c.totalSaq2)}</div>
              <div style={{ color: t.text }}>1º saque (saque1 − depósito) ..... {fmtBRL(lucroSaque1)}</div>
              <div style={{ color: t.text }}>2º saque (rendimento) ............ {fmtBRL(lucroSaque2)}</div>
              {perdaAtiva && <div>perda fixa ({qtdContas} × {fmtBRL(perdaFixa)}) ......... −{fmtBRL(coberturaPerda)}</div>}
              <div style={{ color: t.text }}>base do acerto ................... {fmtBRL(baseAcerto)}</div>
              <div>programador {fmtPctBR(comissaoPct)} ................ {fmtBRL(corteProgramador)}</div>
              <div>sua parte {fmtPctBR(100 - comissaoPct)} .................. {fmtBRL(minhaParteCalc)}</div>
              <div>lula {fmtPctBR(lulaPct)} ......................... {fmtBRL(corteLula)}</div>
              {fornecedorPct > 0 && <div>{(fornecedorNome || "fornecedor")} {fmtPctBR(fornecedorPct)} ............ {fmtBRL(corteFornecedor)}</div>}
              <div style={{ color: t.text }}>líquido pelo cálculo dele ........ {fmtBRL(liquidoPeloCalculo)}</div>
              {perdaAtiva && <div>( + ) 1º saque ................... {fmtBRL(lucroSaque1)}</div>}
              {perdaAtiva && <div>( + ) reembolso .................. {fmtBRL(coberturaPerda)}</div>}
              {totalPago > 0 && <div>( − ) pago aos clientes .......... {fmtBRL(totalPago)}</div>}
              <div style={{ color: t.text, fontWeight: 700 }}>SEU LUCRO LÍQUIDO REAL ........... {fmtBRL(lucroLiquido)}</div>
            </div>
          )}
        </Panel>
      )}

      {sub === "contas" && (
        <TabelaContas t={t} rows={rows} rotulo="Contas"
          onCell={(rowId, key, v) => updateCell(rowId, key, v)}
          onDel={(rowId) => deleteRow(rowId)}
          onDup={(rowId) => duplicateRow(rowId)}
          onAdd={addRow} />
      )}
    </div>
  );
}


/* Campo de porcentagem: digita livre, aceita vírgula, salva ao sair */
/* caveira com volume: luz no alto à esquerda, órbitas fundas e luz refletida embaixo */
let skullSeq = 0;
const SKULL_D = "M32 3 C16.6 3 5 15.2 5 30 C5 37.4 7.9 43.4 12.4 47.4 " +
  "C13.6 48.5 14.2 49.6 14.4 51.2 L15.1 56.6 C15.5 59.2 17.6 61 20.2 61 " +
  "L43.8 61 C46.4 61 48.5 59.2 48.9 56.6 L49.6 51.2 C49.8 49.6 50.4 48.5 51.6 47.4 " +
  "C56.1 43.4 59 37.4 59 30 C59 15.2 47.4 3 32 3 Z";

function Skull({ size = 16, color = "currentColor", style }) {
  const [n] = useState(() => ++skullSeq);
  const vol = `sk-vol-${n}`, orb = `sk-orb-${n}`, cut = `sk-cut-${n}`, sfz = `sk-sfz-${n}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={style} aria-hidden="true">
      <defs>
        {/* volume do crânio */}
        <radialGradient id={vol} cx="34%" cy="22%" r="82%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.50" />
          <stop offset="30%" stopColor="#fff" stopOpacity="0.10" />
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.30" />
        </radialGradient>
        {/* fundo da órbita: escuro no centro, aliviando na borda */}
        <radialGradient id={orb} cx="46%" cy="38%" r="68%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.97" />
          <stop offset="72%" stopColor="#000" stopOpacity="0.86" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <clipPath id={cut}><path d={SKULL_D} /></clipPath>
        <filter id={sfz} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* base */}
      <path d={SKULL_D} fill={color} />

      {/* modelagem, presa ao contorno */}
      <g clipPath={`url(#${cut})`}>
        <rect x="0" y="0" width="64" height="64" fill={`url(#${vol})`} />
        {/* têmporas afundadas */}
        <ellipse cx="10" cy="30" rx="7" ry="12" fill="#000" opacity="0.12" filter={`url(#${sfz})`} />
        <ellipse cx="54" cy="30" rx="7" ry="12" fill="#000" opacity="0.17" filter={`url(#${sfz})`} />
        {/* maçãs do rosto */}
        <ellipse cx="18" cy="43" rx="8" ry="4.5" fill="#000" opacity="0.13" filter={`url(#${sfz})`} />
        <ellipse cx="46" cy="43" rx="8" ry="4.5" fill="#000" opacity="0.15" filter={`url(#${sfz})`} />
        {/* brilho da testa */}
        <ellipse cx="24" cy="14" rx="11" ry="7" fill="#fff" opacity="0.30" filter={`url(#${sfz})`} />
        {/* sombra sob o maxilar */}
        <ellipse cx="32" cy="62" rx="20" ry="7" fill="#000" opacity="0.20" filter={`url(#${sfz})`} />
      </g>

      {/* órbitas */}
      <g>
        <ellipse cx="21.2" cy="26.5" rx="9.6" ry="10.2" fill={`url(#${orb})`} />
        <ellipse cx="42.8" cy="26.5" rx="9.6" ry="10.2" fill={`url(#${orb})`} />
        {/* luz refletida na borda de baixo da órbita */}
        <path d="M13.2 30.5 a9.6 10.2 0 0 0 16 3.6" fill="none" stroke={color} strokeOpacity="0.30" strokeWidth="1.5" />
        <path d="M34.8 30.5 a9.6 10.2 0 0 0 16 3.6" fill="none" stroke={color} strokeOpacity="0.24" strokeWidth="1.5" />
      </g>

      {/* nariz */}
      <path d="M32 38.2 L37.4 49 H26.6 Z" fill="#000" opacity="0.92" />
      <path d="M32 40.5 L35.6 48.2 H28.4 Z" fill="#000" opacity="0.45" />

      {/* maxilar e dentes */}
      <rect x="15.4" y="50.4" width="33.2" height="1.7" fill="#000" opacity="0.85" />
      {[22.5, 27.6, 32.7, 37.8].map((x) => (
        <rect key={x} x={x} y="52.6" width="1.5" height="8.4" fill="#000" opacity="0.7" />
      ))}

      {/* luz de contorno na esquerda */}
      <path d={SKULL_D} fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="0.9"
        strokeDasharray="46 120" strokeDashoffset="6" />
    </svg>
  );
}


function Toggle({ t, label, on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} title={on ? "Desativar" : "Ativar"}
      style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0 }}>
      <span style={{ width: 30, height: 16, background: on ? t.red : t.line, display: "block", position: "relative", transition: "background .12s" }}>
        <span style={{ position: "absolute", top: 3, left: on ? 17 : 3, width: 10, height: 10, background: on ? "#FFFFFF" : t.muted, display: "block", transition: "left .12s" }} />
      </span>
      <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.2, color: on ? t.text : t.muted }}>{label}</span>
    </button>
  );
}


function ValorInput({ t, label, value, onChange }) {
  const [draft, setDraft] = useState(null);
  const editando = draft !== null;
  const n = parseNum(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.2, color: t.muted }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 3, background: t.focus, border: `1px solid ${editando ? t.red : t.line}`, padding: "3px 8px" }}>
        <span style={{ fontFamily: t.mono, fontSize: 11, color: t.muted }}>R$</span>
        <input
          type="text"
          inputMode="decimal"
          value={editando ? draft : (n === 0 ? "0" : String(n).replace(".", ","))}
          onFocus={(e) => { setDraft(n === 0 ? "" : String(n).replace(".", ",")); requestAnimationFrame(() => e.target.select()); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onChange(parseNum(draft)); setDraft(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
          }}
          style={{ width: 62, background: "transparent", border: "none", color: t.text, fontFamily: t.mono, fontSize: 12.5, fontWeight: 700, padding: "3px 0", outline: "none", textAlign: "right" }} />
      </div>
    </div>
  );
}


function TextoInput({ t, label, value, placeholder, onChange, width = 130 }) {
  const [draft, setDraft] = useState(null);
  const editando = draft !== null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {label ? <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.2, color: t.muted }}>{label}</span> : null}
      <input
        type="text"
        value={editando ? draft : (value || "")}
        placeholder={placeholder}
        onFocus={() => setDraft(value || "")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onChange((draft || "").trim()); setDraft(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
        }}
        style={{ width, background: t.focus, border: `1px solid ${editando ? t.red : t.line}`, color: t.text,
          fontFamily: t.mono, fontSize: 12.5, fontWeight: 700, padding: "6px 8px", outline: "none", borderRadius: 10 }} />
    </div>
  );
}


/* Digita livre ("1250", "1.250,50"), mostra formatado ao sair do campo */
function NumInput({ t, value, onChange }) {
  const [draft, setDraft] = useState(null);
  const editando = draft !== null;
  const n = parseNum(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={editando ? draft : (n === 0 ? "" : fmtNum(n))}
      placeholder="0,00"
      onFocus={(e) => {
        setDraft(n === 0 ? "" : String(n).replace(".", ","));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onChange(parseNum(draft)); setDraft(null); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
      }}
      style={{ textAlign: "right", color: n < 0 ? t.red : t.text }}
    />
  );
}

function PctInput({ t, label, value, onChange }) {
  const [draft, setDraft] = useState(null);
  const editando = draft !== null;
  const n = parseNum(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.2, color: t.muted }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", background: t.focus, border: `1px solid ${editando ? t.red : t.line}`, padding: "3px 8px" }}>
        <input
          type="text"
          inputMode="decimal"
          value={editando ? draft : String(n).replace(".", ",")}
          onFocus={(e) => { setDraft(String(n).replace(".", ",")); requestAnimationFrame(() => e.target.select()); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onChange(Math.max(0, Math.min(100, parseNum(draft)))); setDraft(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
          }}
          style={{ width: 48, background: "transparent", border: "none", color: t.text, fontFamily: t.mono, fontSize: 12.5, fontWeight: 700, padding: "3px 0", outline: "none", textAlign: "right" }} />
        <span style={{ fontFamily: t.mono, fontSize: 12, color: t.muted }}>%</span>
      </div>
    </div>
  );
}

function PasswordCell({ t, value, onChange }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyText(value || "");
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1200); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <input type={visible ? "text" : "password"} value={value ?? ""}
        onChange={(e) => onChange(e.target.value)} placeholder="senha" style={{ flex: 1 }} />
      <button onClick={() => setVisible((v) => !v)} style={t.iconBtn} title={visible ? "Ocultar" : "Mostrar"}>
        {visible ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button onClick={copy} style={t.iconBtn} title="Copiar senha">
        {copied ? <Check size={12} color={t.text} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

const CONTA_COLUMNS = [
  { key: "nome", label: "Nome do dono", width: 170 },
  { key: "email", label: "Email", width: 210 },
  { key: "cpf", label: "CPF", width: 140 },
];

function ContasView({ t, contas, addConta, updateConta, deleteConta }) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [fallbackText, setFallbackText] = useState(null);

  const copyAll = async () => {
    const text = contas.map((c, i) => {
      const linhas = [`${i + 1} - ${c.nome || "(sem nome)"}`];
      if ((c.cpf || "").trim()) linhas.push(`CPF: ${c.cpf}`);
      else if ((c.email || "").trim()) linhas.push(`EMAIL: ${c.email}`);
      linhas.push(`Senha: ${c.senha || ""}`);
      return linhas.join("\n");
    }).join("\n\n");

    const ok = await copyText(text);
    if (ok) { setFallbackText(null); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500); }
    else setFallbackText(text);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
      <PageHead t={t} eyebrow="ACESSOS" title="Contas" sub={`${contas.length} CADASTRADAS`}
        actions={
          <>
            <button onClick={copyAll} className="ct-btn ct-btn-line">
              {copiedAll ? <Check size={13} /> : <Copy size={13} />}{copiedAll ? "Copiado" : "Copiar todas"}
            </button>
            <button onClick={addConta} className="ct-btn ct-btn-solid"><Plus size={13} /> Nova conta</button>
          </>
        } />

      {fallbackText && (
        <Panel t={t} label="Cópia manual">
          <p style={{ fontSize: 12.5, color: t.muted, margin: "0 0 10px" }}>
            O navegador bloqueou a cópia automática. Selecione o texto e copie com Ctrl/Cmd+C.
          </p>
          <textarea readOnly value={fallbackText} onFocus={(e) => e.target.select()}
            style={{ width: "100%", minHeight: 150, background: t.focus, border: `1px solid ${t.line}`, color: t.text, fontFamily: t.mono, fontSize: 12, padding: 10, outline: "none", resize: "vertical", borderRadius: 10 }} />
          <button onClick={() => setFallbackText(null)} className="ct-btn ct-btn-line" style={{ marginTop: 10 }}>Fechar</button>
        </Panel>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${t.line}`, borderLeft: `2px solid ${t.red}`, background: t.panel, padding: "11px 14px" }}>
        <KeyRound size={13} color={t.red} />
        <span style={{ fontSize: 12, color: t.muted }}>
          Senhas ficam salvas só neste navegador, sem criptografia. Evite usar em computador compartilhado.
        </span>
      </div>

      <div className="ct-panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px" }}>
          <span className="ct-label">Cadastro</span>
          <span style={{ fontFamily: t.mono, fontSize: 9.5, letterSpacing: 1.3, color: t.muted }}>{contas.length} LINHAS</span>
        </div>
        <div className="ct-scroll" style={{ overflow: "auto", borderTop: `1px solid ${t.line}` }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720, tableLayout: "fixed" }}>
            <thead>
              <tr>
                {CONTA_COLUMNS.map((c) => <th key={c.key} style={{ ...t.th, width: c.width, minWidth: c.width }}>{c.label}</th>)}
                <th style={{ ...t.th, width: 175 }}>Senha</th>
                <th style={{ ...t.th, width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.id} className="ct-row" style={{ borderTop: `1px solid ${t.line}` }}>
                  {CONTA_COLUMNS.map((col) => (
                    <td key={col.key} className="ct-cell" style={t.td}>
                      <input type="text" value={c[col.key] ?? ""} onChange={(e) => updateConta(c.id, col.key, e.target.value)} />
                    </td>
                  ))}
                  <td className="ct-cell" style={t.td}>
                    <PasswordCell t={t} value={c.senha} onChange={(v) => updateConta(c.id, "senha", v)} />
                  </td>
                  <td style={t.td}>
                    <button onClick={() => deleteConta(c.id)} title="Excluir" style={t.iconBtn}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
              {contas.length === 0 && (
                <tr><td colSpan={CONTA_COLUMNS.length + 2} style={{ padding: "30px 18px", textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <Skull size={30} color={t.line} />
                    <span style={{ fontFamily: t.mono, fontSize: 11, color: t.muted, letterSpacing: 1.1 }}>NENHUMA CONTA CADASTRADA</span>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- Theme ---------- */

function T(theme) {
  const dark = theme === "dark";
  /* borda quase invisível: separa sem cortar */
  const line = dark ? "rgba(255,255,255,.07)" : "rgba(10,12,20,.09)";
  const edge = dark ? "rgba(255,255,255,.20)" : "rgba(10,12,20,.26)";
  const muted = dark ? "#7C8089" : "#6B7078";
  const text = dark ? "#ECEDEF" : "#0D0F14";

  return {
    /* nem preto puro nem cinza: um grafite levemente frio, que descansa a vista */
    ink: dark ? "#08090C" : "#F6F7F8",
    panel: dark ? "#0E1014" : "#FFFFFF",
    line, edge, muted, text,
    sheen: dark ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.9)",
    hover: dark ? "rgba(255,255,255,.035)" : "rgba(10,12,20,.035)",
    focus: dark ? "rgba(255,255,255,.06)" : "rgba(10,12,20,.05)",
    red: dark ? "#F0616D" : "#D92B45",
    green: dark ? "#34D399" : "#0E9F6E",

    display: "'Anton', sans-serif",
    ui: "'Archivo', sans-serif",
    mono: "'JetBrains Mono', monospace",

    iconBtn: {
      background: "none", border: "none", color: muted, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 5, borderRadius: 8,
    },
    th: {
      textAlign: "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: 2, color: muted, padding: "13px 9px", position: "sticky", top: 0,
      background: dark ? "#0E1014" : "#FFFFFF", borderBottom: `1px solid ${line}`,
    },
    td: { padding: "3px 5px", verticalAlign: "middle" },
  };
}
