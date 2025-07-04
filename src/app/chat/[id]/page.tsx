import { ChatInterface } from '@/components/chat-interface';

type ChatPageProps = {
    params: { id: string }
}

export default function ChatPage({ params }: ChatPageProps) {
    return <ChatInterface sessionId={params.id} />;
}
