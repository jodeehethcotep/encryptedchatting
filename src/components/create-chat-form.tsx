'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Copy, PlusCircle, Trash2, ArrowRight } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

const optionSchema = z.object({
  text: z.string().min(1, 'Option text cannot be empty.'),
});

const questionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty.'),
  options: z.array(optionSchema).min(2, 'Must have at least two options.'),
  correctAnswerIndex: z.string().nonempty("You must select a correct answer."),
});

const formSchema = z.object({
  selfDestructSeconds: z.array(z.number()),
  kickOnWrongAnswer: z.boolean(),
  questions: z.array(questionSchema),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateChatForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    setSessionId(Math.floor(10000 + Math.random() * 90000).toString());
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      selfDestructSeconds: [15],
      kickOnWrongAnswer: true,
      questions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'questions',
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const sessionData = {
        ...data,
        selfDestructSeconds: data.selfDestructSeconds[0],
        createdAt: new Date().toISOString(),
      };
      
      const sessionDocRef = doc(db, 'sessions', sessionId);
      await setDoc(sessionDocRef, sessionData);
      
      router.push(`/chat/${sessionId}`);
    } catch (error) {
      console.error("Error creating session:", error);
      toast({
        title: 'Error',
        description: 'Could not create session. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sessionId);
    toast({
      title: 'Copied!',
      description: 'Session ID copied to clipboard.',
    });
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Create a New Secret Room</CardTitle>
        <CardDescription>Configure your private room settings. Share the Session ID to invite others.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-3 mb-4 border rounded-lg bg-secondary/50">
          <div className="flex flex-col">
              <Label htmlFor="sessionId">Your Session ID</Label>
              <span id="sessionId" className="text-2xl font-bold tracking-widest text-primary">{sessionId}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={copyToClipboard}>
            <Copy className="w-5 h-5" />
          </Button>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="selfDestructSeconds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Self-Destruct Timer</FormLabel>
                  <div className="flex items-center gap-4">
                    <FormControl>
                        <Slider
                            min={5}
                            max={60}
                            step={1}
                            value={field.value}
                            onValueChange={field.onChange}
                        />
                    </FormControl>
                    <span className="font-mono text-primary">{field.value?.[0]}s</span>
                  </div>
                </FormItem>
              )}
            />
            
            <Separator />

            <div>
              <h3 className="text-lg font-medium">Challenge Questions (Optional)</h3>
              <p className="text-sm text-muted-foreground">Add questions new members must answer to join.</p>
            </div>

            {fields.map((item, index) => (
                <div key={item.id} className="p-4 border rounded-md space-y-4 relative bg-card">
                     <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => remove(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <FormField
                        control={form.control}
                        name={`questions.${index}.question`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Question {index + 1}</FormLabel>
                                <FormControl><Input placeholder="e.g., What is our team's secret passphrase?" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name={`questions.${index}.correctAnswerIndex`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Options & Correct Answer</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2">
                                        <QuestionOptions control={form.control} nestIndex={index} />
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            ))}
             <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ question: '', options: [{ text: '' }, { text: '' }], correctAnswerIndex: '' })}
            >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Question
            </Button>
            
            {fields.length > 0 &&
                <FormField
                    control={form.control}
                    name="kickOnWrongAnswer"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <FormLabel>Kick on Wrong Answer</FormLabel>
                            </div>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        </FormItem>
                    )}
                />
            }

            <CardFooter className="p-0 pt-6">
                 <Button type="submit" className="w-full">
                    Start Chat <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </CardFooter>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function QuestionOptions({ nestIndex, control }: { nestIndex: number, control: any }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `questions.${nestIndex}.options`,
    });
    
    return (
        <>
            {fields.map((item, k) => (
                <FormField
                    key={item.id}
                    control={control}
                    name={`questions.${nestIndex}.options.${k}.text`}
                    render={({ field }) => (
                        <FormItem className="flex items-center space-x-3 space-y-0">
                             <FormControl>
                                <RadioGroupItem value={k.toString()} id={`${field.name}`} />
                             </FormControl>
                             <div className="flex w-full gap-2">
                                <Input {...field} placeholder={`Option ${k + 1}`} />
                                {fields.length > 2 && <Button type="button" size="icon" variant="ghost" onClick={() => remove(k)}><Trash2 className="h-4 w-4" /></Button>}
                             </div>
                        </FormItem>
                    )}
                />
            ))}
            <Button
                type="button"
                variant="link"
                size="sm"
                className="mt-1"
                onClick={() => append({ text: '' })}
            >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Option
            </Button>
        </>
    )
}
