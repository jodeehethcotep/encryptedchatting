import { JoinChallenge } from '@/components/join-challenge';

type JoinPageProps = {
    params: { id: string }
}

export default function JoinPage({ params }: JoinPageProps) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
            <JoinChallenge sessionId={params.id} />
        </div>
    );
}
