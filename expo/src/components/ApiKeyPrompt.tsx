import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { Colors } from '../theme';

interface Props {
  onSubmit: (key: string) => void;
}

export function ApiKeyPrompt({ onSubmit }: Props) {
  const [value, setValue] = useState('');
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect TideCheck</Text>
      <Text style={styles.body}>
        Enter your TideCheck API key to show live tide data for Hastings Pier. Get a free key at
        tidecheck.com/developers.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="tc_live_..."
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={setValue}
      />
      <Pressable
        style={[styles.button, !value && styles.buttonDisabled]}
        disabled={!value}
        onPress={() => onSubmit(value.trim())}
      >
        <Text style={styles.buttonText}>Save & Continue</Text>
      </Pressable>
      <Pressable onPress={() => Linking.openURL('https://tidecheck.com/developers')}>
        <Text style={styles.link}>Get a free API key →</Text>
      </Pressable>
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 24 },
    title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', marginBottom: 12 },
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
    input: {
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: 12,
      padding: 14,
      color: colors.textPrimary,
      fontSize: 15,
      marginBottom: 16,
    },
    button: { backgroundColor: colors.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
    link: { color: colors.primary, textAlign: 'center', marginTop: 16, fontSize: 13 },
  });
}
