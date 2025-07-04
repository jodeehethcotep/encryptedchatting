import { CreateChatForm } from '@/components/create-chat-form';

export default function CreatePage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
            <CreateChatForm />
        </div>
    );
}
