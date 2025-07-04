'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Terminal } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { db } from '@/lib/firebase';
import { doc, getDoc, runTransaction, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { addChatSession } from '@/lib/storage';

type SessionData = {
    selfDestructSeconds: number;
    kickOnWrongAnswer: boolean;
    participants: string[];
    participantCount: number;
    questions: {
        question: string;
        options: { text: string }[];
        correctAnswerIndex: string;
    }[];
};

export function JoinChallenge({ sessionId }: { sessionId: string }) {
    const router = useRouter();
    const [session, setSession] = useState<SessionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showKickDialog, setShowKickDialog] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [userId, setUserId] = useState('');

    useEffect(() => {
        let currentUserId = sessionStorage.getItem(`secretchat-userId-${sessionId}`);
        if (!currentUserId) {
            currentUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            sessionStorage.setItem(`secretchat-userId-${sessionId}`, currentUserId);
        }
        setUserId(currentUserId);

        const fetchSession = async () => {
            try {
                const sessionDocRef = doc(db, 'sessions', sessionId);
                const sessionDoc = await getDoc(sessionDocRef);

                if (sessionDoc.exists()) {
                    const data = sessionDoc.data() as SessionData;
                    if (data.participants && data.participants.includes(currentUserId)) {
                        addChatSession(sessionId);
                        router.push(`/chat/${sessionId}`);
                        return;
                    }
                     if (data.participantCount >= 2) {
                        setError('This room is full and can no longer be joined.');
                        setLoading(false);
                        return;
                    }
                    if (!data.questions || data.questions.length === 0) {
                        await handleJoin();
                    } else {
                        setSession(data);
                    }
                } else {
                    setError('Session not found or has expired.');
                }
            } catch (e: any) {
                console.error("Failed to load session:", e);
                setError(e.message || 'Failed to load session data. Please check the ID and try again.');
            } finally {
                setLoading(false);
            }
        }
        fetchSession();
    }, [sessionId, router, userId]);
    
    const form = useForm();
    
    const handleJoin = async () => {
        setIsSubmitting(true);
        try {
            const sessionDocRef = doc(db, 'sessions', sessionId);
            await runTransaction(db, async (transaction) => {
                const sessionDoc = await transaction.get(sessionDocRef);
                if (!sessionDoc.exists()) throw new Error("Session disappeared.");
                
                const data = sessionDoc.data();
                const participants = data.participants || [];

                if (participants.length >= 2) throw new Error("This room is full.");
                if (participants.includes(userId)) return;

                const newParticipants = [...participants, userId];
                transaction.update(sessionDocRef, { 
                    participants: newParticipants,
                    participantCount: newParticipants.length 
                });
                
                const messagesColRef = collection(db, 'sessions', sessionId, 'messages');
                await addDoc(messagesColRef, {
                    text: `${userId.substring(0, 12)} has joined the chat.`,
                    senderId: 'system',
                    type: 'system',
                    createdAt: serverTimestamp(),
                    seenAt: null
                });
            });

            addChatSession(sessionId);
            router.push(`/chat/${sessionId}`);
        } catch (e: any) {
            setError(e.message);
            setIsSubmitting(false);
        }
    }
    
    const onSubmit = (data: any) => {
        if (!session) return;
        
        let allCorrect = true;
        for (let i = 0; i < session.questions.length; i++) {
            const question = session.questions[i];
            const userAnswer = data[`question_${i}`];
            if (userAnswer !== question.correctAnswerIndex) {
                allCorrect = false;
                break;
            }
        }
        
        if (allCorrect) {
            handleJoin();
        } else {
            if (session.kickOnWrongAnswer) {
                setShowKickDialog(true);
            } else {
                alert("One or more answers were incorrect. Please try again.");
                form.reset();
            }
        }
    };
    
    if (loading) {
        return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (error) {
        return (
            <Alert variant="destructive" className="max-w-md">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }
    
    if (!session) return null;

    return (
        <>
            <Card className="w-full max-w-xl">
                <CardHeader>
                    <CardTitle>Entry Challenge</CardTitle>
                    <CardDescription>Answer the following questions to join the room.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            {session.questions.map((q, index) => (
                                <FormField
                                    key={index}
                                    control={form.control}
                                    name={`question_${index}`}
                                    rules={{ required: "You must select an answer."}}
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormLabel className="font-semibold">{q.question}</FormLabel>
                                            <FormControl>
                                                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                                                    {q.options.map((opt, optIndex) => (
                                                        <FormItem key={optIndex} className="flex items-center space-x-3 space-y-0">
                                                            <FormControl>
                                                                <RadioGroupItem value={optIndex.toString()} />
                                                            </FormControl>
                                                            <FormLabel className="font-normal">{opt.text}</FormLabel>
                                                        </FormItem>
                                                    ))}
                                                </RadioGroup>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            ))}
                            <CardFooter className="p-0 pt-4">
                                <Button type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Submit Answers
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </CardContent>
            </Card>
            <AlertDialog open={showKickDialog} onOpenChange={setShowKickDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Incorrect Answer</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have been removed from the session for providing an incorrect answer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => router.push('/')}>Return to Home</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
