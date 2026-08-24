/**
 * الباحثة القانونية الذكية — Expo Router screen
 * Wraps the existing KnowledgeSearchScreen from src/screens/
 */
import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { KnowledgeSearchScreen } from '@/src/screens/KnowledgeSearchScreen';

export default function LegalResearchScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'الباحثة القانونية الذكية',
          headerShown: Platform.OS !== 'web',
          headerStyle: { backgroundColor: '#0f1c3a' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontFamily: 'Cairo_700Bold', fontSize: 16 },
          headerBackTitle: 'رجوع',
        }}
      />
      <KnowledgeSearchScreen />
    </>
  );
}
