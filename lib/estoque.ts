import "server-only";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Debita o estoque de cada item do pedido.
 * Deve ser chamado somente quando o pagamento é confirmado.
 */
export async function debitarEstoque(orderId: string) {
    const { data: orderItems } = await supabase
        .from('order_items')
        .select('item_id, quantity')
        .eq('order_id', orderId);

    if (!orderItems?.length) return;

    for (const oi of orderItems) {
        const { data: item } = await supabase
            .from('items')
            .select('stock_quantity')
            .eq('id', oi.item_id)
            .single();

        if (item) {
            await supabase
                .from('items')
                .update({ stock_quantity: Math.max(0, item.stock_quantity - oi.quantity) })
                .eq('id', oi.item_id);
        }
    }
}

/**
 * Devolve o estoque de cada item do pedido.
 * Deve ser chamado quando um pedido é cancelado.
 */
export async function devolverEstoque(orderId: string) {
    const { data: orderItems } = await supabase
        .from('order_items')
        .select('item_id, quantity')
        .eq('order_id', orderId);

    if (!orderItems?.length) return;

    for (const oi of orderItems) {
        const { data: item } = await supabase
            .from('items')
            .select('stock_quantity')
            .eq('id', oi.item_id)
            .single();

        if (item) {
            await supabase
                .from('items')
                .update({ stock_quantity: item.stock_quantity + oi.quantity })
                .eq('id', oi.item_id);
        }
    }
}
