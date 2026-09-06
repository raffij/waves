import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Fonts } from '../fonts';
import { useTheme } from '../hooks/useTheme';
import type { WaterQualityResult, WaterQualityStatus } from '../services/WaterQualityClient';
import type { Colors } from '../theme';

// Bathing-water pollution status for the current location, shown as a single
// line under the forecast list. It's the location's one reading regardless
// of which forecast day is selected, so it sits outside the per-day
// current-conditions card and charts rather than inside them.
//
// Icon/colour/label are ordered worst-first so a reader scanning down never
// mistakes an EA outage ('unknown') for a clean bill of health ('clear') —
// see WaterQualityClient's own comment on never guessing 'clear'.
export function WaterQualityLine({ waterQuality }: { waterQuality: WaterQualityResult | null }) {
  const { colors, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, fonts), [colors, fonts]);

  if (!waterQuality) return null;

  const config: Record<WaterQualityStatus, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
    flagged: { icon: 'warning-outline', color: colors.falling, label: 'Flagged' },
    clear: { icon: 'checkmark-circle-outline', color: colors.rising, label: 'Clear' },
    unknown: { icon: 'help-circle-outline', color: colors.textSecondary, label: 'Unknown' },
  };
  const { icon, color, label } = config[waterQuality.status];

  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        Water quality: {label}
        {waterQuality.siteName ? ` (${waterQuality.siteName})` : ''}
      </Text>
    </View>
  );
}

function getStyles(colors: Colors, fonts: Fonts) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    text: { fontSize: 11, fontWeight: '600', fontFamily: fonts.mono, flexShrink: 1 },
  });
}
