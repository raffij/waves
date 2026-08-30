import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { DayInsights as DayInsightsModel } from '../services/DayInsights';
import type { Colors } from '../theme';

interface Props {
  insights: DayInsightsModel;
}

// The "so what" line above the charts: a one-sentence read on the day,
// and — when it's wet — what to take out on the pier.
export function DayInsights({ insights }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.sentence}>{insights.summarySentence}</Text>

      {insights.gearAdvice && (
        <View style={styles.gearRow}>
          <View style={styles.dot} />
          <Text style={styles.gear}>{insights.gearAdvice}</Text>
        </View>
      )}
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    sentence: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
    gearRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    gear: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  });
}
