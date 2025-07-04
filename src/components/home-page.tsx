'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Users, MessageSquare, ArrowRight, Trash2, Home } from 'lucide-react';
import { getChatSessions, removeChatSession } from '@/lib/storage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function HomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<string[]>([]);
  const [joinSessionId, setJoinSessionId] = useState('');

  useEffect(() => {
    setSessions(getChatSessions());
  }, []);

  const handleCreateSession = () => {
    router.push('/create');
  };

  const handleJoinSession = () => {
    if (joinSessionId.trim()) {
      router.push(`/join/${joinSessionId.trim()}`);
    }
  };

  const handleRemoveSession = (sessionId: string) => {
    removeChatSession(sessionId);
    setSessions(getChatSessions());
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-background p-4 md:p-8">
      <div className="w-full max-w-2xl">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
                 <MessageSquare className="w-8 h-8 text-primary"/>
                 <h1 className="text-3xl font-bold">Secret Rooms</h1>
            </div>
            <div className="flex gap-2">
                <Button onClick={handleCreateSession}><Sparkles className="mr-2"/> Create Room</Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                         <Button variant="secondary"><Users className="mr-2"/> Join Room</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Join an Existing Room</AlertDialogTitle>
                        <AlertDialogDescription>
                            Enter the 5-digit session ID you received to join a room.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Input
                            value={joinSessionId}
                            onChange={(e) => setJoinSessionId(e.target.value)}
                            placeholder="Enter 5-digit ID"
                            maxLength={5}
                            onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
                        />
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleJoinSession}>Join</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </header>

        <main className="space-y-4">
            {sessions.length > 0 ? (
                sessions.map((sessionId) => (
                    <Card key={sessionId} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-muted rounded-full">
                                    <MessageSquare className="w-6 h-6 text-muted-foreground"/>
                                </div>
                                <div>
                                    <p className="font-semibold">Room ID:</p>
                                    <p className="font-mono text-primary tracking-wider">{sessionId}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveSession(sessionId)}>
                                    <Trash2 className="w-5 h-5 text-destructive"/>
                                    <span className="sr-only">Leave room</span>
                                </Button>
                                <Button onClick={() => router.push(`/chat/${sessionId}`)}>
                                    Enter <ArrowRight className="ml-2"/>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <Card className="text-center py-12">
                     <CardHeader>
                        <CardTitle>No active rooms</CardTitle>
                        <CardDescription>Create or join a room to start chatting.</CardDescription>
                    </CardHeader>
                </Card>
            )}
        </main>
      </div>
    </div>
  );
}
