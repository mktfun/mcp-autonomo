import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, message } = await req.json();

    if (!projectId || !message) {
      throw new Error("projectId and message are required");
    }

    // Initialize Supabase client with service role for Vault access
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    console.log("User authenticated:", user.id);

    // Fetch user's AI configuration
    const { data: userProfile, error: profileError } = await supabaseClient
      .from("user_profiles")
      .select("ai_model, system_instruction, temperature")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error("Failed to fetch user profile: " + profileError.message);
    }

    console.log("User profile fetched:", userProfile.ai_model);

    // Fetch API key from Vault
    const secretName = `gemini_api_key_${user.id}`;
    const { data: vaultSecrets, error: vaultError } = await supabaseClient
      .from("vault.decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", secretName)
      .maybeSingle();

    if (vaultError) {
      console.error("Vault error:", vaultError);
      throw new Error("Failed to fetch API key from Vault");
    }

    if (!vaultSecrets?.decrypted_secret) {
      throw new Error("API key not configured. Please add your Gemini API key in Settings.");
    }

    const apiKey = vaultSecrets.decrypted_secret;
    console.log("API key fetched from Vault successfully");

    // Prepare the prompt
    let fullPrompt = "";
    if (userProfile.system_instruction) {
      fullPrompt += `${userProfile.system_instruction}\n\n`;
    }
    fullPrompt += `User: ${message}\nAssistant:`;

    console.log("Calling Gemini API with model:", userProfile.ai_model);

    // Call Gemini API with streaming
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${userProfile.ai_model}:streamGenerateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: fullPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: userProfile.temperature || 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${errorText}`);
    }

    console.log("Gemini API response received, starting stream");

    // Create a readable stream from the Gemini response
    const reader = geminiResponse.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                
                if (json.candidates && json.candidates[0]?.content?.parts) {
                  const text = json.candidates[0].content.parts[0]?.text || "";
                  
                  if (text) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                  }
                }
              } catch (e) {
                console.log("Skipping invalid JSON:", line);
              }
            }
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Error in generate-chat-response:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
