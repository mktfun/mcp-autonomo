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

    // CLIENTE ADMIN (SERVICE_ROLE) - NECESSÁRIO PARA ACESSAR O VAULT
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Autentica o usuário a partir do token que o frontend enviou
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error('User not authenticated');

    // 1. Atualiza as configurações não-sensíveis na tabela de perfis
    if (settings) {
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .update(settings)
        .eq('id', user.id);

      if (profileError) throw profileError;
    }

    // 2. Se uma nova API key foi enviada, chama a função do Vault para salvá-la de forma segura
    if (apiKey) {
      const { error: rpcError } = await supabaseAdmin.rpc('update_user_api_key_in_vault', {
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
