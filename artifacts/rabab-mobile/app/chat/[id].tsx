import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatScreen } from '@/src/screens/ChatScreen';

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const consultationId = Number(id);
  if (!consultationId) return null;

  return (
    <ChatScreen
      consultationId={consultationId}
      onBack={() => router.back()}
      onNewConversation={() => router.replace('/consultation/new' as any)}
    />
  );
}
