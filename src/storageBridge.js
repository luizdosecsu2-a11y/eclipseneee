import { supabase } from "./supabase";

export function installStorageBridge(user) {
  window.storage = {
    async get(key) {
      if (key === "casino-tracker-ui") {
        const value = localStorage.getItem(key);
        return value ? { value } : null;
      }

      if (key !== "casino-tracker-data") return null;

      const { data, error } = await supabase
        .from("casino_tracker_data")
        .select("data, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Falha ao carregar do Supabase:", error);
        throw error;
      }

      return data?.data ? { value: JSON.stringify(data.data) } : null;
    },

    async set(key, value) {
      if (key === "casino-tracker-ui") {
        localStorage.setItem(key, value);
        return { ok: true };
      }

      if (key !== "casino-tracker-data") return { ok: true };

      const parsed = JSON.parse(value);
      const { error } = await supabase
        .from("casino_tracker_data")
        .upsert(
          {
            user_id: user.id,
            data: parsed,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id" }
        );

      if (error) {
        console.error("Falha ao salvar no Supabase:", error);
        throw error;
      }

      return { ok: true };
    }
  };
}
