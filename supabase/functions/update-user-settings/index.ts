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

    // Cria um cliente Supabase COM A AUTENTICAÇÃO DO USUÁRIO
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Verifica se o usuário está autenticado
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      throw new Error('Usuário não autenticado');
    }

    console.log('Atualizando configurações para o usuário:', user.id);

    // 1. Atualiza as configurações não-sensíveis (se houver)
    if (settings) {
      const { error: updateError } = await supabaseClient
        .from('user_profiles')
        .update(settings)
        .eq('id', user.id);

      if (updateError) {
        console.error('Erro ao atualizar configurações:', updateError);
        throw updateError;
      }
      
      console.log('Configurações não-sensíveis atualizadas com sucesso');
    }

    // 2. Chama a função SEGURA do banco de dados para criptografar e salvar a chave
    if (apiKey) {
      console.log('Criptografando API key de forma segura...');
      
      const { error: rpcError } = await supabaseClient.rpc('securely_update_user_api_key', {
        api_key_plaintext: apiKey,
      });

      if (rpcError) {
        console.error('Erro ao criptografar API key:', rpcError);
        throw rpcError;
      }
      
      console.log('API key criptografada e salva com sucesso');
    }

    return new Response(
      JSON.stringify({ message: 'Configurações salvas com segurança!' }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro geral:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
