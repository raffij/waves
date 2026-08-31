import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { DayInsights as DayInsightsModel } from '../services/DayInsights';
import type { Colors } from '../theme';

interface Props {
  insights: DayInsightsModel;
}

// The "so what" line above the charts: a one-sentence read on the day, and
// the call on what to wear — a garment ("Waterproof shell", "Warm layer",
// "Umbrella"…) with the rain / wind / light reading behind it, skipped once
// the day is over.
export function DayInsights({ insights }: Props) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);

  return (
    <View>
      <Text style={styles.sentence}>{insights.summarySentence}</Text>

      {insights.clothing && (
        <View style={styles.gearRow}>
          <View style={styles.dot} />
          <Text style={styles.gear}>
            {insights.clothing.garment}
            {insights.clothing.reason ? <Text style={styles.gearReason}> · {insights.clothing.reason}</Text> : null}
          </Text>
        </View>
      )}
    </View>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    sentence: { color: colors.textPrimary, fontSize: 14, lineHeight: 19, fontFamily: fonts.mono },
    gearRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    // flexShrink lets the reason wrap under a narrow column instead of
    // pushing the garment off the row.
    gear: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', flexShrink: 1, fontFamily: fonts.mono },
    gearReason: { color: colors.textSecondary, fontWeight: '400' },
  });
}
