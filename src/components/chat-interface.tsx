'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Paperclip, Eye, X, ShieldAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';

type Message = {
    id: string;
    sender: 'You' | 'Other';
    senderId: string;
    text?: string;
    imageUrl?: string;
    type: 'text' | 'image';
    createdAt: Timestamp | null;
};

type SessionSettings = {
    selfDestructSeconds: number;
};

export function ChatInterface({ sessionId }: { sessionId: string }) {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [settings, setSettings] = useState<SessionSettings>({ selfDestructSeconds: 0 });
    const [imageToView, setImageToView] = useState<{ id: string, url: string } | null>(null);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const [userId, setUserId] = useState('');
    const destructionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

    useEffect(() => {
        let currentUserId = sessionStorage.getItem(`secretchat-userId-${sessionId}`);
        if (!currentUserId) {
            currentUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            sessionStorage.setItem(`secretchat-userId-${sessionId}`, currentUserId);
        }
        setUserId(currentUserId);

        const fetchSessionData = async () => {
            try {
                const sessionDocRef = doc(db, 'sessions', sessionId);
                const sessionDoc = await getDoc(sessionDocRef);
                if (sessionDoc.exists()) {
                    setSettings({ selfDestructSeconds: sessionDoc.data().selfDestructSeconds });
                } else {
                    router.push('/');
                }
            } catch (e) {
                console.error("Error fetching session data:", e);
                router.push('/');
            }
        };

        fetchSessionData();
    }, [sessionId, router]);

    useEffect(() => {
        if (!sessionId || !userId || settings.selfDestructSeconds <= 0) return;

        const q = query(collection(db, 'sessions', sessionId, 'messages'), orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedMessages: Message[] = [];
            const currentMessageIds = new Set<string>();

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                currentMessageIds.add(doc.id);

                const message: Message = {
                    id: doc.id,
                    sender: data.senderId === userId ? 'You' : 'Other',
                    senderId: data.senderId,
                    text: data.text,
                    imageUrl: data.imageUrl,
                    type: data.type,
                    createdAt: data.createdAt
                };
                fetchedMessages.push(message);

                if (data.createdAt && settings.selfDestructSeconds > 0 && message.type === 'text') {
                    if (destructionTimers.current.has(doc.id)) {
                        return; // Timer already set, do nothing.
                    }

                    const messageTime = data.createdAt.toDate();
                    const destructionTime = messageTime.getTime() + settings.selfDestructSeconds * 1000;
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

            // Clean up timers for messages that were deleted by other means
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
            // Clear all pending timers when the component unmounts or dependencies change
            destructionTimers.current.forEach(timeoutId => clearTimeout(timeoutId));
            destructionTimers.current.clear();
        };
    }, [sessionId, userId, settings.selfDestructSeconds]);
    
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
                createdAt: serverTimestamp()
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
                createdAt: serverTimestamp()
            });
        }
    };
    
    const handleViewImage = (msg: Message) => {
        if (msg.imageUrl) {
            setImageToView({ id: msg.id, url: msg.imageUrl });
        }
    };

    const handleCloseImageView = () => {
        if (imageToView) {
            const msgRef = doc(db, 'sessions', sessionId, 'messages', imageToView.id);
            deleteDoc(msgRef);
        }
        setImageToView(null);
    };

    return (
        <TooltipProvider>
            <div className="flex flex-col h-screen bg-background">
                <header className="flex items-center justify-between p-4 border-b shrink-0">
                    <h1 className="text-xl font-bold text-primary">Secret Room: {sessionId}</h1>
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
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex items-end gap-2 animate-in fade-in-20 slide-in-from-bottom-4 duration-300 ${msg.sender === 'You' ? 'justify-end' : ''}`}>
                                {msg.sender !== 'You' && <Avatar className="h-8 w-8"><AvatarFallback>{msg.senderId.substring(0, 1).toUpperCase()}</AvatarFallback></Avatar>}
                                <div className={`max-w-xs md:max-w-md p-3 rounded-lg shadow-sm ${msg.sender === 'You' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                                    {msg.type === 'text' && <p className="text-sm break-words">{msg.text}</p>}
                                    {msg.type === 'image' && (
                                        <Button variant={msg.sender === 'You' ? 'secondary' : 'default' } onClick={() => handleViewImage(msg)} className="w-full">
                                            <Eye className="mr-2 h-4 w-4" /> View Once Image
                                        </Button>
                                    )}
                                </div>
                                {msg.sender === 'You' && <Avatar className="h-8 w-8"><AvatarFallback>Y</AvatarFallback></Avatar>}
                            </div>
                        ))}
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
                                <TooltipContent><p>Send view-once image</p></TooltipContent>
                            </Tooltip>
                            <Button size="icon" onClick={handleSendMessage} disabled={!newMessage.trim()}><Send className="w-5 h-5" /></Button>
                        </div>
                    </div>
                     {settings.selfDestructSeconds > 0 && (
                        <p className="text-xs text-center text-muted-foreground mt-2">
                            Text messages will self-destruct {settings.selfDestructSeconds} seconds after being sent.
                        </p>
                    )}
                </footer>
            </div>
            
            <Dialog open={!!imageToView} onOpenChange={(isOpen) => !isOpen && handleCloseImageView()}>
                <DialogContent className="max-w-lg p-0" onEscapeKeyDown={handleCloseImageView} onPointerDownOutside={handleCloseImageView}>
                    <DialogHeader className="p-4 flex flex-row items-center justify-between">
                        <DialogTitle>View Once Image</DialogTitle>
                        <Button variant="ghost" size="icon" onClick={handleCloseImageView}><X className="h-4 w-4"/></Button>
                    </DialogHeader>
                    {imageToView && <Image src={imageToView.url} alt="Secret Image" width={400} height={300} className="w-full h-auto" data-ai-hint="abstract texture" />}
                    <p className="p-4 text-sm text-center text-muted-foreground">This image will be destroyed after you close this window.</p>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
