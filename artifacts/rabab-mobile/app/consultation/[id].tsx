import { useLocalSearchParams, Redirect } from 'expo-router';

/**
 * Redirect /consultation/[id] → /chat/[id] so all entry points
 * (list, new-consultation creation, deep links) land on the unified
 * ChatScreen that contains the task-params summary bar and edit modal.
 *
 * NOTE: File upload (DocumentPicker / useContractFileUpload) is intentionally
 * absent from consultation screens. It belongs exclusively to the contract
 * namespace (app/contract/drafter.tsx + hooks/useContractFileUpload.ts).
 */
export default function ConsultationRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/chat/${id}` as any} />;
}
