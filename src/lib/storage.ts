'use client';

const CHAT_SESSIONS_KEY = 'secretchat_sessions';

export function getChatSessions(): string[] {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        const sessions = localStorage.getItem(CHAT_SESSIONS_KEY);
        return sessions ? JSON.parse(sessions) : [];
    } catch (error) {
        console.error("Failed to parse chat sessions from localStorage", error);
        return [];
    }
}

export function addChatSession(sessionId: string): void {
     if (typeof window === 'undefined') {
        return;
    }
    const sessions = getChatSessions();
    if (!sessions.includes(sessionId)) {
        const newSessions = [...sessions, sessionId];
        localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(newSessions));
    }
}

export function removeChatSession(sessionId: string): void {
    if (typeof window === 'undefined') {
        return;
    }
    const sessions = getChatSessions();
    const newSessions = sessions.filter(id => id !== sessionId);
    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(newSessions));
}
