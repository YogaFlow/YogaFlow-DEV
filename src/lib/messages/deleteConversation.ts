import { supabase } from '../supabase';
import { Conversation } from './conversations';
import { hideConversation } from './hiddenConversations';

export async function deleteConversation(
  userId: string,
  conversation: Conversation
): Promise<{ error: Error | null }> {
  if (!userId || conversation.messages.length === 0) {
    return { error: null };
  }

  const messageIds = conversation.messages.map((m) => m.id);

  const { error } = await supabase.from('messages').delete().in('id', messageIds);

  if (error) {
    return { error: new Error(error.message) };
  }

  hideConversation(userId, conversation.key);

  return { error: null };
}
