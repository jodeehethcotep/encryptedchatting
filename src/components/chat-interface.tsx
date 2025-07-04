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
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, deleteDoc, Timestamp, runTransaction, updateDoc, writeBatch, setDoc } from 'firebase/firestore';

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

type SessionData = {
    selfDestructSeconds: number;
    participants: string[];
    participantCount: number;
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

    const handleLeaveChat = useCallback(async () => {
        if (!userId) return;

        const sessionDocRef = doc(db, 'sessions', sessionId);
        try {
            await runTransaction(db, async (transaction) => {
                const sessionDoc = await transaction.get(sessionDocRef);
                if (!sessionDoc.exists()) return;

                const currentParticipants = sessionDoc.data().participants || [];
                const newParticipants = currentParticipants.filter((p: string) => p !== userId);

                transaction.update(sessionDocRef, {
                    participants: newParticipants,
                    participantCount: newParticipants.length
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
        
        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            const fetchedMessages: Message[] = [];
            const currentMessageIds = new Set<string>();
            const batch = writeBatch(db);
            let updatesMade = false;

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                currentMessageIds.add(doc.id);

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

                if (otherParticipantId && message.senderId === otherParticipantId && !message.seenAt) {
                    batch.update(doc.ref, { seenAt: serverTimestamp() });
                    updatesMade = true;
                }

                if (sessionData.selfDestructSeconds > 0 && message.sender !== 'System' && message.seenAt) {
                    if (destructionTimers.current.has(doc.id)) {
                        return;
                    }
                    const seenTime = message.seenAt.toDate();
                    const destructionTime = seenTime.getTime() + sessionData.selfDestructSeconds * 1000;
                    const now = Date.now();

                    if (destructionTime < now) {
                        deleteDoc(doc.ref).catch(err => console.error("Error deleting old message:", err));
                    } else {
                        const timeoutId = setTimeout(() => {
                            deleteDoc(doc.ref).catch(err => console.error("Error deleting message:", err));
                            destructionTimers.current.delete(doc.id);
                        }, destructionTime - now);
                        destructionTimers.current.set(doc.id, timeoutId);
                    }
                }
            });
            
            if (updatesMade) {
                await batch.commit();
            }

            destructionTimers.current.forEach((timeoutId, messageId) => {
                if (!currentMessageIds.has(messageId)) {
                    clearTimeout(timeoutId);
                    destructionTimers.current.delete(messageId);
                }
            });

            setMessages(fetchedMessages);
        });

        return () => {
            unsubscribe();
            destructionTimers.current.forEach(timeoutId => clearTimeout(timeoutId));
            destructionTimers.current.clear();
        };
    }, [sessionId, userId, sessionData, otherParticipantId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSendMessage = async () => {
        if (newMessage.trim() && userId) {
            await addDoc(collection(db, 'sessions', sessionId, 'messages'), {
                text: newMessage,
                senderId: userId,
                type: 'text',
                createdAt: serverTimestamp(),
                seenAt: null,
            });
            setNewMessage('');
        }
    };

    const handleSendImage = async () => {
        if (userId) {
            await addDoc(collection(db, 'sessions', sessionId, 'messages'), {
                imageUrl: `https://placehold.co/400x300.png`,
                senderId: userId,
                type: 'image',
                createdAt: serverTimestamp(),
                seenAt: null,
            });
        }
    };

    return (
        <TooltipProvider>
            <div className="flex flex-col h-screen bg-background">
                <header className="flex items-center justify-between p-4 border-b shrink-0">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={handleLeaveChat}>
                            <ArrowLeft />
                        </Button>
                        <h1 className="text-xl font-bold text-primary truncate">Room: {sessionId}</h1>
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
                            placeholder={otherParticipantId ? "Type an ephemeral message..." : "Waiting for another person to join..."}
                            className="pr-24"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            disabled={!otherParticipantId}
                        />
                        <div className="absolute top-1/2 right-2 transform -translate-y-1/2 flex gap-1">
                            <Tooltip>
                                <TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleSendImage} disabled={!otherParticipantId}><Paperclip className="w-5 h-5" /></Button></TooltipTrigger>
                                <TooltipContent><p>Send an image</p></TooltipContent>
                            </Tooltip>
                            <Button size="icon" onClick={handleSendMessage} disabled={!newMessage.trim() || !otherParticipantId}><Send className="w-5 h-5" /></Button>
                        </div>
                    </div>
                     {sessionData?.selfDestructSeconds > 0 && (
                        <p className="text-xs text-center text-muted-foreground mt-2">
                           Messages self-destruct {sessionData.selfDestructSeconds} seconds after being seen.
                        </p>
                    )}
                </footer>
            </div>
        </TooltipProvider>
    );
}
