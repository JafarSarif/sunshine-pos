import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { InfinatortPOSScreen } from './src/screens/InfinatortPOS';
import { AntigravityStockScreen } from './src/screens/AntigravityStock';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1e293b' },
          headerTintColor: '#f8fafc',
          headerTitleStyle: { fontWeight: '700' },
          tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
          tabBarActiveTintColor: '#06b6d4',
          tabBarInactiveTintColor: '#94a3b8',
        }}
      >
        <Tab.Screen
          name="Infinatort (POS)"
          component={InfinatortPOSScreen}
          options={{ title: '⚡ Infinatort POS' }}
        />
        <Tab.Screen
          name="Antigravity (Stock)"
          component={AntigravityStockScreen}
          options={{ title: '📦 Antigravity Inventory' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
