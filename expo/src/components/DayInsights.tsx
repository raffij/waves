import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { DayInsights as DayInsightsModel } from '../services/DayInsights';
import type { Colors } from '../theme';

interface Props {
  insights: DayInsightsModel;
}

// The "so what" above the charts: one description covering the day's wind,
// rain, sun and feel plus what to wear, and — underneath it — how rain, sun
// and feel change over the course of the day.
export function DayInsights({ insights }: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);

  return (
    <View>
      <Text style={styles.sentence}>{insights.summary}</Text>
      {insights.outlook && <Text style={styles.outlook}>{insights.outlook}</Text>}
    </View>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    sentence: { color: colors.textPrimary, fontSize: 14, lineHeight: 19, fontFamily: fonts.mono },
    outlook: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4, fontFamily: fonts.mono },
  });
}
