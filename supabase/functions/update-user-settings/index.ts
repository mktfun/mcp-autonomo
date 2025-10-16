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

    // Pega o token do usuário do header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // CLIENTE ADMIN (SERVICE_ROLE) + PROPAGA O CONTEXTO DO USUÁRIO VIA HEADER
    // Isso garante que auth.uid() dentro de funções SECURITY DEFINER (como a RPC no Vault)
    // enxergue o usuário correto.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Valida o usuário
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // 1) Atualiza configurações não sensíveis no perfil
    if (settings && Object.keys(settings).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .update(settings)
        .eq('id', user.id);

      if (profileError) {
        console.error('update-user-settings: profile update failed:', profileError);
        return new Response(
          JSON.stringify({ error: `Profile update failed: ${profileError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // 2) Se veio uma nova API key, salva com segurança no Vault via RPC
    if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0) {
      const { error: rpcError } = await supabaseAdmin.rpc('update_user_api_key_in_vault', {
        api_key_plaintext: apiKey,
      });
      if (rpcError) {
        console.error('update-user-settings: vault update failed:', rpcError);
        return new Response(
          JSON.stringify({ error: `Vault update failed: ${rpcError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    return new Response(
      JSON.stringify({ message: 'Configurações salvas com segurança!' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('update-user-settings: unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error?.message ?? 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
