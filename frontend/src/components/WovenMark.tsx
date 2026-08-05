import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

const PALETTE = [colors.kenteGold, colors.terracotta, colors.savanna, colors.baobab];

type Segment = {
  width: number;
  color: string;
};

function weaveRow(offset: number): Segment[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const color = PALETTE[(i + offset) % PALETTE.length];
    return { width: 34, color };
  });
}

export function WovenMark({ size = 96 }: { size?: number }) {
  const segmentHeight = size * 0.16;
  return (
    <View style={[styles.wrap, { width: size, height: size * 0.46 }]} aria-hidden>
      <View style={[styles.row, { top: 0 }]}>
        {weaveRow(0).map((seg, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { width: seg.width, height: segmentHeight, backgroundColor: seg.color },
            ]}
          />
        ))}
      </View>
      <View style={[styles.row, { top: segmentHeight * 0.72 }]}>
        {weaveRow(2).map((seg, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { width: seg.width, height: segmentHeight, backgroundColor: seg.color, opacity: 0.9 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    position: 'absolute',
    left: 0,
  },
  segment: {
    borderRadius: 6,
    marginHorizontal: 3,
  },
});
