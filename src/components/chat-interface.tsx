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

type Message = {
    id: number;
    sender: 'You' | 'Other';
    text?: string;
    imageUrl?: string;
    type: 'text' | 'image';
};

type SessionSettings = {
    selfDestructSeconds: number;
};

export function ChatInterface({ sessionId }: { sessionId: string }) {
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [settings, setSettings] = useState<SessionSettings>({ selfDestructSeconds: 15 });
    const [imageToView, setImageToView] = useState<{ id: number, url: string } | null>(null);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);

    useEffect(() => {
        try {
            const data = localStorage.getItem(`secretchat-session-${sessionId}`);
            if (data) {
                const parsedData = JSON.parse(data);
                setSettings({ selfDestructSeconds: parsedData.selfDestructSeconds });
            } else {
                router.push('/');
            }
        } catch (e) {
            router.push('/');
        }
    }, [sessionId, router]);

    const setupDestructionTimer = useCallback((messageId: number) => {
        setTimeout(() => {
            setMessages(prev => prev.filter(m => m.id !== messageId));
        }, settings.selfDestructSeconds * 1000);
    }, [settings.selfDestructSeconds]);

    // Simulate another user sending messages
    useEffect(() => {
        const interval = setInterval(() => {
            const botMessage: Message = { id: Date.now(), sender: 'Other', text: 'This is a secret reply!', type: 'text' };
            setMessages(prev => [...prev, botMessage]);
            setupDestructionTimer(botMessage.id);
        }, 20000);
        return () => clearInterval(interval);
    }, [setupDestructionTimer]);
    
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);
    
    const handleSendMessage = () => {
        if (newMessage.trim()) {
            const msg: Message = { id: Date.now(), sender: 'You', text: newMessage, type: 'text' };
            setMessages(prev => [...prev, msg]);
            setupDestructionTimer(msg.id);
            setNewMessage('');
        }
    };
    
    const handleSendImage = () => {
        const msg: Message = { id: Date.now(), sender: 'You', imageUrl: `https://placehold.co/400x300.png`, type: 'image' };
        setMessages(prev => [...prev, msg]);
    };
    
    const handleViewImage = (msg: Message) => {
        if (msg.imageUrl) {
            setImageToView({ id: msg.id, url: msg.imageUrl });
        }
    };

    const handleCloseImageView = () => {
        if (imageToView) {
            setMessages(prev => prev.filter(m => m.id !== imageToView.id));
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
                
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex items-end gap-2 animate-in fade-in-20 slide-in-from-bottom-4 duration-300 ${msg.sender === 'You' ? 'justify-end' : ''}`}>
                            {msg.sender !== 'You' && <Avatar className="h-8 w-8"><AvatarFallback>O</AvatarFallback></Avatar>}
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
                    <p className="text-xs text-center text-muted-foreground mt-2">
                        Messages will self-destruct {settings.selfDestructSeconds} seconds after being sent.
                    </p>
                </footer>
            </div>
            
            <Dialog open={!!imageToView} onOpenChange={handleCloseImageView}>
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
