import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExpiryWarningGate } from '@/components/ExpiryWarningGate';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'magnifyingglass', selected: 'magnifyingglass.circle.fill' }} />
        <Label>البحث</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="circulars">
        <Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} />
        <Label>التعاميم</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="legal-assistant">
        <Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
        <Label>مساعد</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="consultation">
        <Icon sf={{ default: 'message', selected: 'message.fill' }} />
        <Label>استشارة</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>حسابي</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark' || true; // always dark brand
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: isWeb ? 0 : insets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'البحث',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="magnifyingglass" tintColor={color} size={size} />
            ) : (
              <Ionicons name="search-outline" size={size ?? 22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="circulars"
        options={{
          title: 'التعاميم',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="doc.text" tintColor={color} size={size} />
            ) : (
              <Ionicons name="document-text-outline" size={size ?? 22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="legal-assistant"
        options={{
          title: 'مساعد',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="sparkles" tintColor={color} size={size} />
            ) : (
              <Ionicons name="sparkles-outline" size={size ?? 22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="consultation"
        options={{
          title: 'استشارة',
          tabBarIcon: () => (
            <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
          ),
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...(props as any)}
              style={{
                top: -22,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              activeOpacity={0.85}
            >
              <View style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#1a56db',
                borderWidth: 3,
                borderColor: '#60a5fa',
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: '#1a56db',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.5,
                shadowRadius: 10,
                elevation: 10,
              }}>
                <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={size} />
            ) : (
              <Ionicons name="person-outline" size={size ?? 22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <>
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
      <ExpiryWarningGate />
    </>
  );
}
