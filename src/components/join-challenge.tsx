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
import { doc, getDoc } from 'firebase/firestore';
import { addChatSession } from '@/lib/storage';

type SessionData = {
    selfDestructSeconds: number;
    kickOnWrongAnswer: boolean;
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

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const sessionDocRef = doc(db, 'sessions', sessionId);
                const sessionDoc = await getDoc(sessionDocRef);

                if (sessionDoc.exists()) {
                    const parsedData = sessionDoc.data() as SessionData;
                    if (!parsedData.questions || parsedData.questions.length === 0) {
                        addChatSession(sessionId);
                        router.push(`/chat/${sessionId}`);
                    } else {
                        setSession(parsedData);
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
    }, [sessionId, router]);
    
    const form = useForm();
    
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
            addChatSession(sessionId);
            router.push(`/chat/${sessionId}`);
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
                                <Button type="submit" className="w-full">Submit Answers</Button>
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
