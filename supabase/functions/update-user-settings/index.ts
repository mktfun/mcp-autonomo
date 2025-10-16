import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { apiKey, settings } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // 1. Atualiza as configurações não-sensíveis na tabela de perfis
    if (settings) {
      const { error: profileError } = await supabaseClient
        .from('user_profiles')
        .update(settings)
        .eq('id', user.id);

      if (profileError) throw profileError;
    }

    // 2. Se uma nova API key foi enviada, chama a função do Vault para salvá-la de forma segura
    if (apiKey) {
      const { error: rpcError } = await supabaseClient.rpc('update_user_api_key_in_vault', {
        api_key_plaintext: apiKey,
      });
      if (rpcError) throw rpcError;
    }

    return new Response(JSON.stringify({ message: 'Configurações salvas com segurança!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
