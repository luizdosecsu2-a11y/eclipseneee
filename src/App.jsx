import React, { useEffect, useState } from "react";
import CasinoTracker from "./CasinoTracker";
import { supabase } from "./supabase";
import { installStorageBridge } from "./storageBridge";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [modoCadastro, setModoCadastro] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nova) => {
      setSession(nova ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={loadingStyle}>CARREGANDO</div>;
  }

  if (session?.user) {
    installStorageBridge(session.user);
    return (
      <>
        <div style={topStyle}>
          <span>{session.user.email}</span>
          <button style={logoutStyle} onClick={() => supabase.auth.signOut()}>SAIR</button>
        </div>
        <CasinoTracker />
      </>
    );
  }

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const result = modoCadastro
        ? await supabase.auth.signUp({ email, password: senha })
        : await supabase.auth.signInWithPassword({ email, password: senha });

      if (result.error) throw result.error;

      if (modoCadastro && !result.data.session) {
        setErro("Conta criada. Se a confirmação de e-mail estiver ativada no Supabase, confirme o e-mail; se estiver desativada, faça login.");
      }
    } catch (e) {
      setErro(e.message || "Não foi possível entrar.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={pageStyle}>
      <form onSubmit={enviar} style={cardStyle}>
        <div style={{fontSize:36,fontWeight:900,letterSpacing:2}}>ECL<span style={{color:"#e32b1d"}}>.</span></div>
        <div style={{fontSize:10,letterSpacing:4,color:"#777",marginBottom:22}}>GESTOR</div>
        <input style={inputStyle} type="email" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} required />
        <input style={inputStyle} type="password" placeholder="Senha" value={senha} onChange={e=>setSenha(e.target.value)} minLength={6} required />
        {erro && <div style={{color:"#e32b1d",fontSize:12,lineHeight:1.4}}>{erro}</div>}
        <button style={buttonStyle} disabled={carregando}>{carregando ? "AGUARDE..." : (modoCadastro ? "CRIAR CONTA" : "ENTRAR")}</button>
        <button type="button" style={linkStyle} onClick={()=>{setModoCadastro(!modoCadastro);setErro("");}}>
          {modoCadastro ? "Já tenho conta" : "Criar uma conta"}
        </button>
      </form>
    </div>
  );
}

const pageStyle={minHeight:"100vh",display:"grid",placeItems:"center",background:"#050505",color:"#eee",fontFamily:"Arial,sans-serif"};
const cardStyle={width:"min(360px,calc(100vw - 36px))",display:"flex",flexDirection:"column",gap:12,padding:28,border:"1px solid #222",background:"#090909"};
const inputStyle={padding:"13px 12px",background:"#111",border:"1px solid #292929",color:"#fff",outline:"none"};
const buttonStyle={padding:"13px",background:"#eee",color:"#050505",border:0,fontWeight:800,cursor:"pointer"};
const linkStyle={background:"transparent",border:0,color:"#888",cursor:"pointer",padding:8};
const loadingStyle={minHeight:"100vh",display:"grid",placeItems:"center",background:"#050505",color:"#888",fontFamily:"monospace",letterSpacing:3};
const topStyle={position:"fixed",top:10,right:12,zIndex:9999,display:"flex",gap:10,alignItems:"center",fontFamily:"monospace",fontSize:10,color:"#777"};
const logoutStyle={background:"transparent",border:"1px solid #333",color:"#888",padding:"6px 9px",cursor:"pointer"};
