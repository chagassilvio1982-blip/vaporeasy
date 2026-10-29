// Exemplo: copiar para config.js apenas no ambiente Preview isolado.
// Nunca usar service_role ou chaves secretas no navegador.
// A chave publishable é pública, mas deve pertencer SOMENTE ao Supabase Next.
globalThis.VAPORIZE_NEXT_CONFIG = {
  supabaseUrl: 'https://cfpvexgkjsqpwhebsoos.supabase.co',
  supabaseAnonKey: 'SUBSTITUIR_PELA_PUBLISHABLE_KEY_DA_NEXT'
};
