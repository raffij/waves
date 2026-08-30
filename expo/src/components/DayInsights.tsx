import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { DayInsights as DayInsightsModel } from '../services/DayInsights';
import type { Colors } from '../theme';

interface Props {
  insights: DayInsightsModel;
}

// The "so what" line above the charts: a one-sentence read on the day and
// the best daylight window to be out on the pier.
export function DayInsights({ insights }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const hasWindow = insights.bestWindow.kind === 'window';

  return (
    <View>
      <Text style={styles.sentence}>{insights.summarySentence}</Text>

      <View style={styles.windowRow}>
        {hasWindow && <View style={styles.dot} />}
        <Text style={styles.window}>
          {hasWindow ? `Best window: ${insights.bestWindow.label}` : insights.bestWindow.label}
        </Text>
      </View>
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    sentence: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
    windowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    window: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  });
}
