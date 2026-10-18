import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { filterMemes, loadPopularMemes, type MemeImage } from '../media/memeSearch';
import { disposeDraftArtwork, prepareMemeArtwork, type DraftArtwork } from '../media/artwork';
import type { Theme } from './theme';

export function ArtworkPicker({ visible, theme, onClose, onSelect, onPreparingChange }: {
  visible: boolean;
  theme: Theme;
  onClose: () => void;
  onSelect: (artwork: DraftArtwork) => void;
  onPreparingChange: (preparing: boolean) => void;
}) {
  const [items, setItems] = useState<MemeImage[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const selectionGenerationRef = useRef(0);
  const filtered = useMemo(() => filterMemes(items, query), [items, query]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      selectionGenerationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  async function load(retry = false) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    if (retry) setItems([]);
    try {
      const result = await loadPopularMemes(controller.signal);
      if (!controller.signal.aborted && mountedRef.current) setItems(result);
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current) setError(cause instanceof Error ? cause.message : 'Could not load popular memes.');
    } finally {
      if (!controller.signal.aborted && mountedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible) {
      controllerRef.current?.abort();
      selectionGenerationRef.current += 1;
      setSelectedId(null);
      setLoading(false);
      onPreparingChange(false);
      return;
    }
    void load();
    return () => controllerRef.current?.abort();
  }, [visible]);

  async function choose(meme: MemeImage) {
    if (selectedId) return;
    Keyboard.dismiss();
    const controller = new AbortController();
    const generation = ++selectionGenerationRef.current;
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setSelectedId(meme.id);
    onPreparingChange(true);
    setError('');
    let preparedDraft: DraftArtwork | null = null;
    try {
      preparedDraft = await prepareMemeArtwork(meme, controller.signal);
      if (controller.signal.aborted || !mountedRef.current || generation !== selectionGenerationRef.current) {
        disposeDraftArtwork(preparedDraft);
        preparedDraft = null;
        return;
      }
      onSelect(preparedDraft);
      preparedDraft = null;
      setSelectedId(null);
      onPreparingChange(false);
      onClose();
    } catch (cause) {
      if (preparedDraft) disposeDraftArtwork(preparedDraft);
      if (!controller.signal.aborted && mountedRef.current && generation === selectionGenerationRef.current) setError(cause instanceof Error ? cause.message : 'Could not prepare that image. Try another one.');
    } finally {
      if (mountedRef.current && generation === selectionGenerationRef.current) {
        setSelectedId(null);
        onPreparingChange(false);
      }
    }
  }

  const close = () => {
    Keyboard.dismiss();
    controllerRef.current?.abort();
    selectionGenerationRef.current += 1;
    setSelectedId(null);
    onPreparingChange(false);
    onClose();
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close meme image picker" style={[styles.close, { borderColor: theme.border }]}><Text style={{ color: theme.text, fontSize: 22 }}>‹</Text></Pressable>
        <Text style={{ flex: 1, color: theme.text, fontSize: 20, fontWeight: '800' }}>Popular memes</Text>
      </View>
      <View style={styles.body}>
        <Text style={{ color: theme.muted, lineHeight: 20 }}>Choose from Imgflip’s popular meme templates. Search filters this list by name.</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search popular memes" placeholderTextColor={theme.muted} accessibilityLabel="Search popular memes" returnKeyType="search" style={[styles.search, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]} />
        {loading ? <View style={styles.state}><ActivityIndicator color={theme.primary} /><Text style={{ color: theme.muted }}>Loading popular memes…</Text></View> : null}
        {error ? <View style={[styles.error, { borderColor: theme.danger }]}><Text accessibilityLiveRegion="polite" style={{ color: theme.danger }}>{error}</Text><Pressable onPress={() => void load(true)} accessibilityRole="button" accessibilityLabel="Retry loading memes" style={[styles.retry, { backgroundColor: theme.raised, borderColor: theme.border }]}><Text style={{ color: theme.text, fontWeight: '700' }}>Retry</Text></Pressable></View> : null}
        {!loading && !error && filtered.length === 0 ? <Text style={[styles.stateText, { color: theme.muted }]}>{items.length ? 'No popular memes match that name.' : 'No popular memes are available right now.'}</Text> : null}
        <FlatList data={filtered} keyExtractor={(item) => item.id} numColumns={2} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.grid} columnWrapperStyle={styles.row} windowSize={5} initialNumToRender={6} maxToRenderPerBatch={6} removeClippedSubviews renderItem={({ item }) => <Pressable onPress={() => void choose(item)} disabled={Boolean(selectedId)} accessibilityRole="button" accessibilityLabel={`Choose image ${item.name}`} style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border, opacity: selectedId && selectedId !== item.id ? 0.55 : 1 }]}>
          <Image source={{ uri: item.url }} style={styles.image} resizeMode="cover" resizeMethod="resize" accessibilityLabel={item.name} />
          <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '700', padding: 9 }}>{selectedId === item.id ? 'Preparing…' : item.name}</Text>
          {selectedId === item.id ? <View style={styles.tileBusy}><ActivityIndicator color="#fff" /></View> : null}
        </Pressable>} />
      </View>
      <View style={[styles.attribution, { borderTopColor: theme.border }]}><Text style={{ color: theme.muted }}>Images provided by </Text><Pressable onPress={() => void Linking.openURL('https://imgflip.com').catch(() => {})} accessibilityRole="link" accessibilityLabel="Visit Imgflip" style={styles.attributionLink}><Text style={{ color: theme.focus, textDecorationLine: 'underline' }}>Imgflip</Text></Pressable></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth }, close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1 }, body: { flex: 1, gap: 12, paddingHorizontal: 16, paddingTop: 14 }, search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 }, grid: { gap: 12, paddingBottom: 16 }, row: { gap: 12 }, tile: { flex: 1, borderRadius: 16, borderWidth: 1, overflow: 'hidden' }, image: { width: '100%', aspectRatio: 1 }, tileBusy: { ...StyleSheet.absoluteFill, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center' }, state: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 8 }, stateText: { textAlign: 'center', padding: 18 }, error: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 }, retry: { minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, attribution: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth }, attributionLink: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
