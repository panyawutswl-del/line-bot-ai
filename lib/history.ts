const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity resets history
const MAX_TURNS = 10; // keep last 5 exchanges (user + model pairs)

interface Turn {
  role: 'user' | 'model';
  text: string;
}

interface Session {
  turns: Turn[];
  updatedAt: number;
}

const sessions = new Map<string, Session>();

export function getHistory(userId: string): Turn[] {
  const session = sessions.get(userId);
  if (!session || Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return [];
  }
  return session.turns;
}

export function addTurn(userId: string, userText: string, botText: string): void {
  const session = sessions.get(userId);
  const turns = session ? [...session.turns] : [];
  turns.push({ role: 'user', text: userText });
  turns.push({ role: 'model', text: botText });
  sessions.set(userId, { turns: turns.slice(-MAX_TURNS), updatedAt: Date.now() });
}
