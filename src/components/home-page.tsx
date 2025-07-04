'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Users } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function HomePage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');

  const handleCreateSession = () => {
    router.push('/create');
  };

  const handleJoinSession = () => {
    if (sessionId.trim()) {
      router.push(`/join/${sessionId.trim()}`);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-4 space-y-8">
        <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-primary">SecretChat</h1>
            <p className="mt-2 text-muted-foreground">Your private, ephemeral conversation space.</p>
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="text-primary"/> Create a New Room</CardTitle>
            <CardDescription>Start a new encrypted chat room and invite others with a unique ID.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCreateSession} className="w-full">
              Create Room
            </Button>
          </CardContent>
        </Card>
        
        <div className="relative">
            <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Join an Existing Room</CardTitle>
            <CardDescription>Enter the 5-digit session ID to join a room.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Enter 5-digit ID"
                maxLength={5}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinSession()}
              />
              <Button onClick={handleJoinSession} variant="secondary">Join</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
