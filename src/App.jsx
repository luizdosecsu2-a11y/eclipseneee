import React, { useEffect, useState } from "react";
import CasinoTracker from "./CasinoTracker";
import { supabase } from "./supabase";
import { installStorageBridge } from "./storageBridge";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cadastro, setCadastro] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <TelaCarregando />;
  }

  if (session?.user) {
    installStorageBridge(session.user);
    return (
      <>
        <CasinoTracker />
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          title={session.user.email || "Sair"}
          style={logoutStyle}
        >
          SAIR
        </button>
      </>
    );
  }

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const result = cadastro
        ? await supabase.auth.signUp({ email, password: senha })
        : await supabase.auth.signInWithPassword({ email, password: senha });

      if (result.error) throw result.error;

      if (cadastro && !result.data.session) {
        setErro("Conta criada. Faça login para entrar.");
      }
    } catch (err) {
      setErro(err?.message || "Não foi possível entrar.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={pageStyle}>
      <form onSubmit={enviar} style={cardStyle}>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2 }}>
          ECL<span style={{ color: "#F0616D" }}>.</span>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 4, color: "#7C8089", marginBottom: 10 }}>
          GESTOR
        </div>
        <input style={inputStyle} type="email" placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input style={inputStyle} type="password" placeholder="Senha" value={senha}
          onChange={(e) => setSenha(e.target.value)} minLength={6} required />
        {erro && <div style={{ color: "#F0616D", fontSize: 12, lineHeight: 1.4 }}>{erro}</div>}
        <button style={primaryStyle} disabled={carregando}>
          {carregando ? "AGUARDE..." : cadastro ? "CRIAR CONTA" : "ENTRAR"}
        </button>
        <button type="button" style={linkStyle} onClick={() => { setCadastro(!cadastro); setErro(""); }}>
          {cadastro ? "Já tenho conta" : "Criar uma conta"}
        </button>
      </form>
    </div>
  );
}

function TelaCarregando() {
  return <div style={loadingStyle}>CARREGANDO</div>;
}

const pageStyle = {
  minHeight: "100vh", display: "grid", placeItems: "center",
  background: "#08090C", color: "#ECEDEF", fontFamily: "Arial,sans-serif"
};
const cardStyle = {
  width: "min(360px, calc(100vw - 36px))", display: "flex", flexDirection: "column",
  gap: 12, padding: 28, border: "1px solid rgba(255,255,255,.07)", background: "#0E1014"
};
const inputStyle = {
  padding: "13px 12px", background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.10)", color: "#ECEDEF", outline: "none"
};
const primaryStyle = {
  padding: 13, background: "#ECEDEF", color: "#08090C", border: 0,
  fontWeight: 800, cursor: "pointer"
};
const linkStyle = {
  padding: 8, background: "transparent", border: 0, color: "#7C8089", cursor: "pointer"
};
const loadingStyle = {
  minHeight: "100vh", display: "grid", placeItems: "center",
  background: "#08090C", color: "#7C8089", fontFamily: "monospace", letterSpacing: 3
};
// Fica no canto inferior para não empurrar, estreitar ou sobrepor a barra superior do JSX original.
const logoutStyle = {
  position: "fixed", right: 12, bottom: 12, zIndex: 9999,
  background: "rgba(14,16,20,.88)", border: "1px solid rgba(255,255,255,.10)",
  color: "#7C8089", borderRadius: 8, padding: "7px 10px",
  fontSize: 10, fontWeight: 700, letterSpacing: 1.2, cursor: "pointer"
};
