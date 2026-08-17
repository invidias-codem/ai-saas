import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface Message {
    id?: string;
    role: 'user' | 'bot';
    text: string;
    timestamp: Date;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useSupabaseChat(conversationId: string, initialData?: Message[]) {
    const [messages, setMessages] = useState<Message[]>(() => initialData || []);

    useEffect(() => {
        if (!conversationId || !UUID_REGEX.test(conversationId)) return;

        // 1. Initial Fetch (only if no initialData)
        if (!initialData) { // If explicitly passed (even as empty array), we skip initial fetch
            const fetchMessages = async () => {
                const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('conversation_id', conversationId)
                    .order('created_at', { ascending: true });

                if (error) {
                    console.error("Error fetching messages:", error);
                } else if (data) {
                    setMessages(data.map((msg: any) => ({
                        role: msg.role as 'user' | 'bot',
                        text: msg.content,
                        timestamp: new Date(msg.created_at)
                    })));
                }
            };
            fetchMessages();
        }

        // 2. Realtime Subscription
        const channel = supabase
            .channel('realtime_messages')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload: any) => {
                    const newMsg = payload.new;
                    setMessages((prev) => [
                        ...prev,
                        {
                            role: newMsg.role as 'user' | 'bot',
                            text: newMsg.content,
                            timestamp: new Date(newMsg.created_at)
                        }
                    ]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversationId, initialData]);

    return { messages };
}
