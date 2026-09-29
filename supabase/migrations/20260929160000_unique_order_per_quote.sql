-- Prevent two concurrent operators from converting the same quote twice.
-- Multiple orders without a linked quote remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS orders_source_quote_number_unique
  ON public.orders (source_quote_number)
  WHERE source_quote_number IS NOT NULL AND btrim(source_quote_number) <> '';
