import { useMemo } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Pad } from '../pads';
import { nextAvailableBoardSlot, type BoardAssignments } from './assignments';
import type { LocalClip } from '../editor/library';
import { MAX_SOUNDBITES } from '../limits';

interface PadPickerProps {
  clip: LocalClip;
  basePads: Pad[];
  clips: LocalClip[];
  assignments: BoardAssignments;
  onCancel: () => void;
  onAppend: () => void;
  onSelect: (slotIndex: number) => void;
}

export function PadPicker({ clip, basePads, clips, assignments, onCancel, onAppend, onSelect }: PadPickerProps) {
  const clipsById = useMemo(() => new Map(clips.map((item) => [item.id, item])), [clips]);
  let appendDisabled = false;
  try {
    nextAvailableBoardSlot(assignments);
  } catch {
    appendDisabled = true;
  }

  const chooseSlot = (slotIndex: number) => {
    const existingId = assignments.slots[slotIndex];
    const currentClip = existingId ? clipsById.get(existingId) : undefined;
    const currentClipAvailable = Boolean(currentClip && !currentClip.missing && currentClip.uri);
    const defaultName = basePads[slotIndex]?.name ?? `Pad ${slotIndex + 1}`;
    const currentName = existingId
      ? currentClipAvailable && currentClip
        ? currentClip.title
        : `${defaultName} (original sound; assigned local clip is missing)`
      : `${defaultName} (original sound)`;
    Alert.alert(
      'Replace this pad?',
      `Pad ${slotIndex + 1} currently uses “${currentName}”. Replace it with “${clip.title}”? The existing library clip will stay on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', onPress: () => onSelect(slotIndex) },
      ],
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.scrim}>
        <View style={styles.panel}>
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>ADD TO BOARD</Text>
              <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>{clip.title}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel adding to board" onPress={onCancel} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Keep this soundbite in your library and add it to the board as a new sound.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: appendDisabled }}
            disabled={appendDisabled}
            onPress={onAppend}
            style={[styles.appendButton, appendDisabled && styles.disabled]}
          >
            <Text style={styles.appendButtonTitle}>＋  ADD AS NEW SOUND</Text>
            <Text style={styles.appendButtonHelp}>Keeps every existing pad in place</Text>
          </Pressable>
          {appendDisabled ? (
            <Text style={styles.fullMessage}>The board is full at {MAX_SOUNDBITES} soundbites. Remove an added sound to make room.</Text>
          ) : null}
          <Text style={styles.secondaryHint}>Or replace one of the original 16 pads:</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {[0, 4, 8, 12].map((start) => (
              <View key={start} style={styles.row}>
                {basePads.slice(start, start + 4).map((pad, offset) => {
                  const index = start + offset;
                  const assignedId = assignments.slots[index];
                  const assignedClip = assignedId ? clipsById.get(assignedId) : undefined;
                  const missing = Boolean(assignedId && (!assignedClip || assignedClip.missing || !assignedClip.uri));
                  const label = assignedClip && !missing ? assignedClip.title : pad.name;
                  return (
                    <Pressable
                      key={index}
                      accessibilityRole="button"
                      accessibilityLabel={`Pad ${index + 1}, ${label}${assignedId && !missing ? ', local clip assigned' : ', original sound'}${missing ? ', assigned clip missing and original sound restored' : ''}`}
                      onPress={() => chooseSlot(index)}
                      style={[styles.pad, { backgroundColor: pad.color }]}
                    >
                      <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
                      <Text style={styles.padLabel} numberOfLines={2}>{label}</Text>
                      {assignedId ? <Text style={styles.assigned}>{missing ? 'MISSING · DEFAULT' : 'LOCAL'}</Text> : null}
                      {!assignedId ? <Text style={styles.assigned}>DEFAULT</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)', padding: 16 },
  panel: { maxHeight: '92%', borderRadius: 22, backgroundColor: '#191d22', padding: 18, borderWidth: 1, borderColor: '#343b40' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1, gap: 4 },
  eyebrow: { color: '#7ddcb8', letterSpacing: 2, fontSize: 9, fontWeight: '800' },
  title: { color: '#f4f5f6', fontSize: 20, fontWeight: '700' },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#292e33' },
  closeText: { color: '#cdd2d5', fontSize: 26, lineHeight: 29 },
  hint: { color: '#939da2', fontSize: 12, lineHeight: 18, marginTop: 10, marginBottom: 12 },
  appendButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#6fdfb7', marginBottom: 8 },
  appendButtonTitle: { color: '#10251d', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  appendButtonHelp: { color: '#1d4938', fontSize: 10, marginTop: 4 },
  disabled: { opacity: 0.4 },
  fullMessage: { color: '#f2b7b9', fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 8 },
  secondaryHint: { color: '#8d999d', fontSize: 10, letterSpacing: 0.8, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  grid: { gap: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  pad: { flex: 1, minWidth: 0, minHeight: 78, borderRadius: 12, padding: 7, alignItems: 'center', justifyContent: 'center' },
  number: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  padLabel: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  assigned: { color: '#e0ffef', fontSize: 7, fontWeight: '800', letterSpacing: 1.1, marginTop: 4 },
  cancelButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#3d474b' },
  cancelText: { color: '#b4c0c4', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
});
