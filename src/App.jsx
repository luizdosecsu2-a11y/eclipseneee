import React, { useEffect, useState } from "react";
import CasinoTracker from "./CasinoTracker";
import { supabase } from "./supabase";
import { installStorageBridge } from "./storageBridge";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={loading}>CARREGANDO</div>;
  }

  if (session?.user) {
    installStorageBridge(session.user);

    return (
      <>
        <CasinoTracker />
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          style={logout}
          title={session.user.email || "Sair"}
        >
          SAIR
        </button>
      </>
    );
  }

  async function login(e) {
    e.preventDefault();
    setErro("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) setErro(error.message);
  }

  return (
    <div style={page}>
      <form onSubmit={login} style={card}>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 2 }}>
          ECL<span style={{ color: "#27F59A" }}>.</span>
        </div>

        <input
          style={input}
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          style={input}
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />

        {erro && <small style={{ color: "#FF5364" }}>{erro}</small>}

        <button style={button}>ENTRAR</button>
      </form>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#030806",
  color: "#F3FFF8",
  fontFamily: "Arial, sans-serif",
};

const card = {
  width: "min(360px, calc(100vw - 36px))",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 28,
  background: "#07100C",
  border: "1px solid rgba(39,245,154,.14)",
  borderRadius: 16,
};

const input = {
  padding: 13,
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(39,245,154,.12)",
  color: "#fff",
  outline: "none",
  borderRadius: 10,
};

const button = {
  padding: 13,
  border: 0,
  borderRadius: 10,
  background: "#27F59A",
  color: "#021008",
  fontWeight: 800,
  cursor: "pointer",
};

const loading = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#030806",
  color: "#789086",
  fontFamily: "monospace",
  letterSpacing: 3,
};

const logout = {
  position: "fixed",
  right: 12,
  bottom: 12,
  zIndex: 9999,
  background: "#07100C",
  border: "1px solid rgba(39,245,154,.16)",
  color: "#789086",
  padding: "7px 10px",
  borderRadius: 8,
  cursor: "pointer",
};
