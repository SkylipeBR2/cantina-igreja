-- Fix ambiguous column reference "id" in RETURNS TABLE context.
-- Uses intermediate variables v_id and v_order_number extracted via RETURNING
-- instead of a %rowtype record, which caused the ambiguity with the output columns.
DROP FUNCTION IF EXISTS public.create_pending_order(jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.create_pending_order(
  p_items jsonb,
  p_customer_name text,
  p_payment_method text,
  p_notes text DEFAULT NULL
) RETURNS TABLE (id uuid, order_number bigint, total_amount numeric)
LANGUAGE plpgsql
SET search_path = public
AS `$`$
DECLARE
  v_item record;
  v_total numeric(12,2) := 0;
  v_count integer;
  v_id uuid;
  v_order_number bigint;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'O carrinho deve conter ao menos um item';
  END IF;

  FOR v_item IN
    SELECT i.id, i.price, i.stock_quantity, requested.quantity
    FROM jsonb_to_recordset(p_items) AS requested(item_id uuid, quantity integer)
    JOIN public.items i ON i.id = requested.item_id
    ORDER BY i.id
    FOR UPDATE OF i
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity < 1 THEN
      RAISE EXCEPTION 'Quantidade invalida';
    END IF;
    IF v_item.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente';
    END IF;
    v_total := v_total + (v_item.price * v_item.quantity);
  END LOOP;

  SELECT count(*) INTO v_count
  FROM jsonb_to_recordset(p_items) AS requested(item_id uuid, quantity integer);

  INSERT INTO public.orders (
    customer_name, status, status_pagamento, status_preparo,
    payment_status, payment_method, total_amount, notes
  )
  VALUES (
    nullif(trim(p_customer_name), ''), 'pending_payment', 'aguardando', NULL,
    'pending', p_payment_method, v_total, nullif(trim(p_notes), '')
  )
  RETURNING public.orders.id, public.orders.order_number
  INTO v_id, v_order_number;

  FOR v_item IN
    SELECT i.id, i.price, requested.quantity
    FROM jsonb_to_recordset(p_items) AS requested(item_id uuid, quantity integer)
    JOIN public.items i ON i.id = requested.item_id
  LOOP
    INSERT INTO public.order_items (order_id, item_id, quantity, price_at_time)
      VALUES (v_id, v_item.id, v_item.quantity, v_item.price);
    INSERT INTO public.inventory_reservations (order_id, item_id, quantity)
      VALUES (v_id, v_item.id, v_item.quantity);
    UPDATE public.items SET stock_quantity = stock_quantity - v_item.quantity WHERE id = v_item.id;
  END LOOP;

  RETURN QUERY SELECT v_id, v_order_number, v_total::numeric;
END;
`$`$;

REVOKE ALL ON FUNCTION public.create_pending_order(jsonb, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_pending_order(jsonb, text, text, text) TO service_role;
