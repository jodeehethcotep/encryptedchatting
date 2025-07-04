'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Paperclip, ShieldAlert, ArrowLeft, Eye } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, deleteDoc, Timestamp, runTransaction, updateDoc, writeBatch, setDoc, where, getDocs } from 'firebase/firestore';

type Message = {
    id: string;
    sender: 'You' | 'Other' | 'System';
    senderId: string;
    text?: string;
    imageUrl?: string;
    type: 'text' | 'image' | 'system';
    createdAt: Timestamp | null;
    seenAt: Timestamp | null;
};

type Presence = {
    status: 'online' | 'offline';
    last_active: Timestamp;
};

type SessionData = {
    selfDestructSeconds: number;
    selfDestructUnseenSeconds: number;
    participants: string[];
    participantCount: number;
    presence: Record<string, Presence>;
};

export function ChatInterface({ sessionId }: { sessionId: string }) {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sessionData, setSessionData] = useState<SessionData | null>(null);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const [userId, setUserId] = useState('');
    const destructionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

    const otherParticipantId = useMemo(() => {
        if (!sessionData?.participants || !userId) return null;
        return sessionData.participants.find(p => p !== userId) || null;
    }, [sessionData, userId]);

    const isOtherUserOnline = useMemo(() => {
        if (!sessionData?.presence || !otherParticipantId) return false;
        return sessionData.presence[otherParticipantId]?.status === 'online';
    }, [sessionData, otherParticipantId]);

    useEffect(() => {
        let currentUserId = sessionStorage.getItem(`secretchat-userId-${sessionId}`);
        if (!currentUserId) {
            router.push(`/join/${sessionId}`);
            return;
        }
        setUserId(currentUserId);

        const sessionDocRef = doc(db, 'sessions', sessionId);
        const unsubscribe = onSnapshot(sessionDocRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data() as SessionData;
                setSessionData(data);
            } else {
                router.push('/');
            }
        });

        return () => unsubscribe();
    }, [sessionId, router]);
    
    useEffect(() => {
        if (!userId) return;

        const sessionDocRef = doc(db, 'sessions', sessionId);
        updateDoc(sessionDocRef, {
            [`presence.${userId}.status`]: 'online',
            [`presence.${userId}.last_active`]: serverTimestamp()
        }).catch(() => {});

        return () => {
             updateDoc(sessionDocRef, {
                [`presence.${userId}.status`]: 'offline',
                [`presence.${userId}.last_active`]: serverTimestamp()
            }).catch(() => {});
        };

    }, [sessionId, userId]);


    const handleLeaveChat = useCallback(async () => {
        if (!userId) return;

        const sessionDocRef = doc(db, 'sessions', sessionId);
        try {
            await runTransaction(db, async (transaction) => {
                const sessionDoc = await transaction.get(sessionDocRef);
                if (!sessionDoc.exists()) return;
                
                const data = sessionDoc.data();
                const currentParticipants = data.participants || [];
                const newParticipants = currentParticipants.filter((p: string) => p !== userId);
                const newPresence = data.presence || {};
                delete newPresence[userId];

                transaction.update(sessionDocRef, {
                    participants: newParticipants,
                    participantCount: newParticipants.length,
                    presence: newPresence
                });

                if (currentParticipants.includes(userId)) {
                    const messagesColRef = collection(db, 'sessions', sessionId, 'messages');
                    const newSystemMessageRef = doc(messagesColRef);
                    transaction.set(newSystemMessageRef, {
                        text: `${userId.substring(0, 12)} has left the chat.`,
                        senderId: 'system',
                        type: 'system',
                        createdAt: serverTimestamp(),
                        seenAt: null
                    });
                }
            });
        } catch (error) {
            console.error("Error leaving chat:", error);
        } finally {
            router.push('/');
        }
    }, [sessionId, userId, router]);

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === 'PrintScreen') {
                e.preventDefault();
                addDoc(collection(db, 'sessions', sessionId, 'messages'), {
                    text: 'A screenshot may have been taken.',
                    senderId: 'system',
                    type: 'system',
                    createdAt: serverTimestamp(),
                    seenAt: null,
                });
            }
        };

        window.addEventListener('keyup', handleKeyPress);
        return () => {
            window.removeEventListener('keyup', handleKeyPress);
        };
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId || !userId || !sessionData) return;

        const q = query(collection(db, 'sessions', sessionId, 'messages'), orderBy('createdAt', 'asc'));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedMessages: Message[] = [];
            const currentMessageIds = new Set(querySnapshot.docs.map(doc => doc.id));
            
            destructionTimers.current.forEach((timeoutId, messageId) => {
                if (!currentMessageIds.has(messageId)) {
                    clearTimeout(timeoutId);
                    destructionTimers.current.delete(messageId);
                }
            });

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const message: Message = {
                    id: doc.id,
                    sender: data.senderId === 'system' ? 'System' : (data.senderId === userId ? 'You' : 'Other'),
                    senderId: data.senderId,
                    text: data.text,
                    imageUrl: data.imageUrl,
                    type: data.type,
                    createdAt: data.createdAt,
                    seenAt: data.seenAt
                };
                fetchedMessages.push(message);

                if (destructionTimers.current.has(doc.id)) {
                   clearTimeout(destructionTimers.current.get(doc.id)!);
                   destructionTimers.current.delete(doc.id);
                }

                const now = Date.now();
                
                if (sessionData.selfDestructSeconds > 0 && message.seenAt) {
                    const destructionTime = message.seenAt.toDate().getTime() + sessionData.selfDestructSeconds * 1000;
                    if (destructionTime <= now) {
                        deleteDoc(doc.ref).catch(err => console.error("Error deleting old seen message:", err));
                    } else {
                        const timeoutId = setTimeout(() => {
                            deleteDoc(doc.ref).catch(err => console.error("Error deleting seen message:", err));
                            destructionTimers.current.delete(doc.id);
                        }, destructionTime - now);
                        destructionTimers.current.set(doc.id, timeoutId);
                    }
                } else if (sessionData.selfDestructUnseenSeconds > 0 && !message.seenAt && message.createdAt) {
                    const destructionTime = message.createdAt.toDate().getTime() + sessionData.selfDestructUnseenSeconds * 1000;
                    if (destructionTime <= now) {
                        deleteDoc(doc.ref).catch(err => console.error("Error deleting old unseen message:", err));
                    } else {
                        const timeoutId = setTimeout(() => {
                            deleteDoc(doc.ref).catch(err => console.error("Error deleting unseen message:", err));
                            destructionTimers.current.delete(doc.id);
                        }, destructionTime - now);
                        destructionTimers.current.set(doc.id, timeoutId);
                    }
                }
            });
            
            setMessages(fetchedMessages);
        });

        return () => {
            unsubscribe();
            destructionTimers.current.forEach(timeoutId => clearTimeout(timeoutId));
            destructionTimers.current.clear();
        };
    }, [sessionId, userId, sessionData]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const markOtherMessagesAsRead = async () => {
        if (!otherParticipantId) return;

        const messagesColRef = collection(db, 'sessions', sessionId, 'messages');
        const q = query(messagesColRef, where('senderId', '==', otherParticipantId), where('seenAt', '==', null));
        
        try {
            const unreadSnapshot = await getDocs(q);
            if (unreadSnapshot.empty) return null;

            const batch = writeBatch(db);
            unreadSnapshot.forEach(doc => {
                batch.update(doc.ref, { seenAt: serverTimestamp() });
            });
            return batch;
        } catch (e) {
            console.error("Failed to get unread messages to mark as read", e);
            return null;
        }
    };

    const handleSendMessage = async () => {
        if (newMessage.trim() && userId) {
            const batch = await markOtherMessagesAsRead() || writeBatch(db);

            const messagesColRef = collection(db, 'sessions', sessionId, 'messages');
            const newMessageRef = doc(messagesColRef);
            batch.set(newMessageRef, {
                text: newMessage,
                senderId: userId,
                type: 'text',
                createdAt: serverTimestamp(),
                seenAt: null,
            });

            await batch.commit();
            setNewMessage('');
        }
    };

    const handleSendImage = async () => {
        if (userId) {
            const batch = await markOtherMessagesAsRead() || writeBatch(db);

            const messagesColRef = collection(db, 'sessions', sessionId, 'messages');
            const newImageMessageRef = doc(messagesColRef);
            batch.set(newImageMessageRef, {
                imageUrl: `https://placehold.co/400x300.png`,
                senderId: userId,
                type: 'image',
                createdAt: serverTimestamp(),
                seenAt: null,
            });

            await batch.commit();
        }
    };

    return (
        <TooltipProvider>
            <div className="flex flex-col h-screen bg-background">
                <header className="flex items-center justify-between p-4 border-b shrink-0">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={handleLeaveChat}>
                            <ArrowLeft />
                        </Button>
                        <div className="flex items-center gap-3">
                           <h1 className="text-xl font-bold text-primary truncate">Room: {sessionId}</h1>
                           {otherParticipantId && (
                                <div className="flex items-center gap-1.5">
                                    <span className={`h-2.5 w-2.5 rounded-full ${isOtherUserOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <span className="text-xs text-muted-foreground">{isOtherUserOnline ? 'Online' : 'Offline'}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <ShieldAlert className="w-5 h-5" />
                                <span className="text-sm hidden md:inline">Screenshots are monitored</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>For your privacy, we attempt to detect screenshots and alert participants.</p>
                        </TooltipContent>
                    </Tooltip>
                </header>
                
                <main className="flex-1 overflow-y-auto p-4 flex flex-col justify-end">
                    <div className="space-y-4">
                        {messages.map((msg) => {
                            if (msg.type === 'system') {
                                return (
                                    <div key={msg.id} className="flex justify-center items-center gap-2 my-2 animate-in fade-in-20">
                                        <p className="text-xs text-muted-foreground italic">{msg.text}</p>
                                    </div>
                                );
                            }
                            return (
                                <div key={msg.id} className={`flex flex-col gap-1 animate-in fade-in-20 slide-in-from-bottom-4 duration-300 ${msg.sender === 'You' ? 'items-end' : 'items-start'}`}>
                                    <div className={`flex items-end gap-2 ${msg.sender === 'You' ? 'flex-row-reverse' : 'flex-row'}`}>
                                        <Avatar className="h-8 w-8"><AvatarFallback>{msg.senderId.substring(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                                        <div className={`max-w-xs md:max-w-md rounded-lg shadow-sm ${msg.sender === 'You' ? 'bg-primary text-primary-foreground' : 'bg-card'} ${msg.type === 'text' ? 'p-3' : 'p-1'}`}>
                                            {msg.type === 'text' && <p className="text-sm break-words">{msg.text}</p>}
                                            {msg.type === 'image' && msg.imageUrl && (
                                                <Image
                                                    src={msg.imageUrl}
                                                    alt="Ephemeral Image"
                                                    width={250}
                                                    height={250}
                                                    className="rounded-md object-cover"
                                                    data-ai-hint="abstract texture"
                                                />
                                            )}
                                        </div>
                                    </div>
                                    {msg.sender === 'You' && (
                                         <div className="flex items-center gap-1 pr-10 text-xs text-muted-foreground">
                                            {msg.seenAt ? (
                                                <>
                                                    <Eye className="w-3 h-3" />
                                                    <span>Seen</span>
                                                </>
                                            ) : (
                                                <span>Delivered</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                </main>
                
                <footer className="p-4 border-t shrink-0">
                    <div className="relative">
                        <Textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Type an ephemeral message..."
                            className="pr-24"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                        />
                        <div className="absolute top-1/2 right-2 transform -translate-y-1/2 flex gap-1">
                            <Tooltip>
                                <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleSendImage}><Paperclip className="w-5 h-5" /></Button></TooltipTrigger>
                                <TooltipContent><p>Send an image</p></TooltipContent>
                            </Tooltip>
                            <Button size="icon" onClick={handleSendMessage} disabled={!newMessage.trim()}><Send className="w-5 h-5" /></Button>
                        </div>
                    </div>
                     {sessionData && (
                        <p className="text-xs text-center text-muted-foreground mt-2">
                            {sessionData.selfDestructSeconds > 0 && `Seen messages self-destruct after ${sessionData.selfDestructSeconds}s. `}
                            {sessionData.selfDestructUnseenSeconds > 0 && `Unseen messages self-destruct after ${sessionData.selfDestructUnseenSeconds}s.`}
                        </p>
                    )}
                </footer>
            </div>
        </TooltipProvider>
    );
}
