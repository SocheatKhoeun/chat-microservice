import { createHash } from 'node:crypto';

export function directConversationKey(
  userIdA: string,
  userIdB: string,
): string {
  const [a, b] = [userIdA, userIdB].sort();
  return createHash('sha256').update(`${a}:${b}`).digest('hex');
}
