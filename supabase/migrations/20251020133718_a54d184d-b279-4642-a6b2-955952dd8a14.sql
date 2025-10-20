-- Create a function to execute arbitrary SQL (USE WITH CAUTION - SECURITY RISK)
-- This function should only be callable by service role
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_json jsonb;
BEGIN
  -- Execute the SQL and try to return results as JSON
  EXECUTE sql;
  
  -- Return success status
  RETURN jsonb_build_object(
    'success', true,
    'message', 'SQL executed successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;