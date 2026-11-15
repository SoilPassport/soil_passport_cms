// Restrict to your admin origin via ALLOWED_ORIGIN (e.g. https://cms.soilpassport.com).
export const corsHeaders = (origin: string | null) => {
  const allowed = Deno.env.get('ALLOWED_ORIGIN') ?? '';
  return {
    'Access-Control-Allow-Origin': origin && origin === allowed ? origin : allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};
