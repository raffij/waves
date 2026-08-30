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
        Add your TideCheck API key to see live tide, wave, wind, and rain conditions for Hastings and Morecambe.
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
        style={({ pressed }) => [styles.button, (!value.trim() || pressed) && styles.buttonDisabled]}
        disabled={!value.trim()}
        onPress={() => onSubmit(value.trim())}
      >
        <Text style={styles.buttonText}>Save &amp; Continue</Text>
      </Pressable>
      <Pressable onPress={() => Linking.openURL('https://tidecheck.com/developers')}>
        <Text style={styles.link}>Get a free API key →</Text>
      </Pressable>
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
    title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginBottom: 8 },
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.textPrimary,
      fontSize: 15,
      marginBottom: 12,
    },
    button: {
      minHeight: 48,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
    link: { color: colors.primary, textAlign: 'center', marginTop: 12, fontSize: 13, fontWeight: '600' },
  });
}
