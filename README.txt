ECL GESTOR — PRONTO PARA VITE + SUPABASE

1. Copie seu .env para a RAIZ desta pasta.
   Ele deve ter:
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...

2. No CMD, entre nesta pasta e rode:
   npm install
   npm run dev

3. No Supabase SQL Editor, execute supabase-schema.sql se ainda não executou.

4. Para Vercel, cadastre as mesmas duas variáveis em:
   Project Settings > Environment Variables
   e faça Redeploy.

IMPORTANTE:
- src/CasinoTracker.jsx é exatamente o arquivo mais atualizado enviado.
- O erro antigo acontecia porque ele usava window.storage. Agora storageBridge.js conecta esse mesmo código ao Supabase.
- A navegação da interface fica local; os dados do gestor ficam no Supabase por usuário.
