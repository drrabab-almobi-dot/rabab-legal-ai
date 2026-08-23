/**
 * useContractFileUpload — CONTRACT SCREENS ONLY
 *
 * Encapsulates DocumentPicker + /api/contract/extract so that file-upload
 * logic is colocated with the contract namespace and cannot accidentally
 * leak into consultation screens.
 *
 * ⚠️  Do NOT import this hook from any consultation screen.
 *     Consultation chat is intentionally text-only.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { getBaseUrl, getStoredToken } from '@/contexts/AuthContext';

export interface ContractAttachment {
  fileName: string;
  extractedText: string;
  wasTruncated: boolean;
}

interface UseContractFileUploadOptions {
  /** Maximum allowed file size in bytes. Defaults to 10 MB. */
  maxBytes?: number;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

/**
 * Returns a `pickAndExtract` function that opens the system document picker,
 * uploads the chosen file to `/api/contract/extract`, and returns the result.
 *
 * Returns `null` if the user cancelled or an error occurred (an Alert is shown).
 */
export function useContractFileUpload(
  options: UseContractFileUploadOptions = {},
): { pickAndExtract: () => Promise<ContractAttachment | null>; isExtracting: boolean } {
  const { maxBytes = 10 * 1024 * 1024 } = options;
  const [isExtracting, setIsExtracting] = useState(false);

  const pickAndExtract = useCallback(async (): Promise<ContractAttachment | null> => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [...ACCEPTED_TYPES],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return null;

      const asset = picked.assets[0];
      if (asset.size != null && asset.size > maxBytes) {
        const sizeMB = (asset.size / (1024 * 1024)).toFixed(1);
        const limitMB = (maxBytes / (1024 * 1024)).toFixed(0);
        Alert.alert(
          'الملف كبير جداً',
          `حجم الملف (${sizeMB} ميغابايت) يتجاوز الحد المسموح به (${limitMB} ميغابايت).\n\nيرجى استخدام ملف أصغر حجماً.`,
          [{ text: 'حسناً' }],
        );
        return null;
      }

      setIsExtracting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      } as any);

      // Must NOT use apiFetch here — it forces Content-Type: application/json,
      // which breaks multipart/form-data boundary parsing on the server.
      const token = await getStoredToken();
      const res = await fetch(`${getBaseUrl()}/api/contract/extract`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      const data: { extractedText: string; wasTruncated?: boolean; filename?: string } = json;
      return {
        fileName: data.filename ?? asset.name,
        extractedText: data.extractedText ?? '',
        wasTruncated: !!data.wasTruncated,
      };
    } catch (e: any) {
      Alert.alert('خطأ في استخراج الملف', e?.message ?? 'تعذّر قراءة الملف');
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, [maxBytes]);

  return { pickAndExtract, isExtracting };
}
