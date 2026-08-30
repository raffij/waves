import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import type { DayInsights as DayInsightsModel } from '../services/DayInsights';
import type { Colors } from '../theme';

interface Props {
  insights: DayInsightsModel;
}

// The "so what" line under the charts: a one-sentence read on the day, the
// best daylight window to be out on the pier, and the supporting numbers.
export function DayInsights({ insights }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const valuesLabel = insights.values.map((v) => `${v.label} ${v.value}`).join(', ');
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

      {insights.values.length > 0 && (
        <View style={styles.valuesRow} accessibilityLabel={valuesLabel}>
          {insights.values.map((v, i) => (
            <Text key={v.label} style={styles.valueText}>
              {i > 0 ? <Text style={styles.sep}>{'   ·   '}</Text> : null}
              {v.label} {v.value}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function getStyles(colors: Colors) {
  return StyleSheet.create({
    sentence: { color: colors.textPrimary, fontSize: 14, lineHeight: 19 },
    windowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    window: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
    valuesRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    valueText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
    sep: { color: colors.textSecondary },
  });
}
