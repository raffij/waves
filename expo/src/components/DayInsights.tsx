import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { DayInsightsReadout } from '../services/dayInsights';
import type { Colors } from '../theme';

interface Props {
  insights: DayInsightsReadout;
}

// The "so what" above the charts: one deliberately wordy description that
// covers the day's conditions, how they develop, and what to wear.
export function DayInsights({ insights }: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);

  return (
    <View>
      <Text style={styles.sentence}>{insights.summary}</Text>
    </View>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    sentence: { color: colors.textPrimary, fontSize: 12, lineHeight: 16, fontFamily: fonts.mono },
  });
}
