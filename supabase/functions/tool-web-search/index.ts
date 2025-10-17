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
    const { query } = await req.json();

    if (!query) {
      throw new Error("query is required");
    }

    console.log("Performing web search for query:", query);

    // Get the Lovable API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Call Lovable AI Gateway with Google Search grounding
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that searches the web for current information. Provide accurate, well-sourced answers based on search results."
          },
          {
            role: "user",
            content: query
          }
        ],
        temperature: 0.3,
        tools: [
          {
            type: "google_search_retrieval"
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI Gateway error:", response.status, errorText);
      throw new Error("Failed to perform web search");
    }

    const data = await response.json();
    const searchResult = data.choices[0].message.content;

    console.log("Web search completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        result: searchResult,
        query: query,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in tool-web-search:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to perform web search",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
