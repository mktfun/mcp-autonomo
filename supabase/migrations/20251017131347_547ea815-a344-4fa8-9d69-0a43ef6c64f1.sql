-- Função para retornar o schema do banco de dados de forma estruturada
CREATE OR REPLACE FUNCTION public.get_schema_info()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  schema_data json;
BEGIN
  SELECT json_agg(
    json_build_object(
      'table_name', c.table_name,
      'columns', (
        SELECT json_agg(
          json_build_object(
            'column_name', c2.column_name,
            'data_type', c2.data_type,
            'is_nullable', c2.is_nullable,
            'column_default', c2.column_default
          )
        )
        FROM information_schema.columns AS c2
        WHERE c2.table_name = c.table_name 
          AND c2.table_schema = 'public'
      )
    )
  )
  INTO schema_data
  FROM (
    SELECT DISTINCT table_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
  ) AS c;

  RETURN schema_data;
END;
$$;

-- Conceder permissão de execução
GRANT EXECUTE ON FUNCTION public.get_schema_info() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_schema_info() TO authenticated;