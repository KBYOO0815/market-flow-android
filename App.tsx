import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, FlatList, Modal, Pressable, RefreshControl,
  PanResponder, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { fetchBriefingFeed } from './src/feed';
import { kstDate, editionItems, briefingNavigationTimeline, isNewerPublication, type BriefingNavigation, type BriefingSelection, type Slot, type DailyBriefings } from './src/editions';
import { readSelection, saveSelection } from './src/selectionStorage';
import { FeaturedStocksScreen } from './src/FeaturedStocksScreen';
import { MarketStatusScreen } from './src/MarketStatusScreen';
import type { MorningCatalyst } from './src/types';

const C = { background: '#000000', white: '#FFFFFF', accent: '#F6DF83' };
const tabs = ['시황', '뉴스', '특징주', '기업분석'] as const;
type Tab = typeof tabs[number];

function NewsCard({ item }: { item: MorningCatalyst }) {
  return <View style={styles.card}>
    <Text style={styles.title}>{item.title}</Text>
    <Text style={styles.summary}>{item.summary}</Text>
  </View>;
}

function MarketFlow() {
  const [tab, setTab] = useState<Tab>('시황');
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigation, setNavigation] = useState<BriefingNavigation>({ previous: [], today: [], next: [] });
  const [selected, setSelected] = useState<Slot | null>(null);
  const selectedRef = useRef<Slot | null>(null);
  const manualSelectionRef = useRef<BriefingSelection | null>(null);
  const observedPublicationRef = useRef<BriefingSelection | null>(null);
  const hasPreviousData = useRef(false);
  const storageLoaded = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [history, setHistory] = useState<DailyBriefings[]>([]);
  const [viewDate, setViewDate] = useState(kstDate());
  const viewDateRef = useRef(kstDate());
  const offsets = useRef<Record<string, number>>({});
  const offset = useRef(0);
  const timeline = briefingNavigationTimeline(navigation);
  const displayDay: DailyBriefings = history.find(d => d.date === viewDate) || { date: viewDate, editions: {} };
  const activeSlot = selected || timeline[0]?.slot || '';
  const index = timeline.findIndex(e => e.date === viewDate && e.slot === activeSlot);
  const currentNav = index >= 0 ? timeline[index] : undefined;
  const state = currentNav?.state;
  const feed = displayDay.editions[activeSlot];
  const visibleItems = state === 'published' && feed ? editionItems(feed) : [];
  const listRef = useRef<FlatList<MorningCatalyst>>(null);
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      if (!storageLoaded.current) {
        try {
          const saved = await readSelection();
          if (saved) {
            manualSelectionRef.current = saved;
          }
        } catch { setStorageError('저장된 회차 선택을 불러오지 못했습니다.'); }
        storageLoaded.current = true;
      }
      const checkedAt = Date.now();
      const result = await fetchBriefingFeed(checkedAt);
      const days = result.days;
      const entries = briefingNavigationTimeline(result.navigation, checkedAt);
      const saved = manualSelectionRef.current;
      const latestPublished = [...entries].reverse().find(e => e.state === 'published');
      const publication = latestPublished ? {date:latestPublished.date,slot:latestPublished.slot} : null;
      const newer = isNewerPublication(publication, observedPublicationRef.current);
      if (publication) observedPublicationRef.current = publication;
      const retained = !newer && saved && entries.some(e => e.date === saved.date && e.slot === saved.slot) ? saved : null;
      const fallback = latestPublished ? { date: latestPublished.date, slot: latestPublished.slot }
        : entries.find(e => e.date === kstDate(checkedAt)) || entries[0] || null;
      const selection = retained || fallback;
      if (saved && !retained) {
        manualSelectionRef.current = null;
        void saveSelection(null).catch(() => setStorageError('회차 선택을 저장하지 못했습니다.'));
      }
      hasPreviousData.current = days.some(day => Object.keys(day.editions).length > 0);
      setNavigation(result.navigation);
      if (selection) {
        const nextDate = selection.date;
        const nextSlot = selection.slot;
        if (viewDateRef.current !== nextDate || selectedRef.current !== nextSlot) {
          offset.current = offsets.current[nextDate + nextSlot] || 0;
          requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: offset.current, animated: false }));
        }
        selectedRef.current = nextSlot;
        viewDateRef.current = nextDate;
        setSelected(nextSlot);
        setViewDate(nextDate);
      }
      setHistory(days);
      setError(null);
    } catch (e) {
      setError(hasPreviousData.current ? '최신 데이터 확인 실패 · 이전 데이터 표시 중'
        : e instanceof Error ? e.message : '브리핑을 불러오지 못했습니다.');
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(true); }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { void load(true); }
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [load]);

  const navigate = (delta: number) => {
    if (index < 0) return;
    const target = timeline[index + delta];
    if (!target || loading) return;
    offsets.current[viewDate + activeSlot] = offset.current;
    manualSelectionRef.current = target;
    selectedRef.current = target.slot;
    viewDateRef.current = target.date;
    setViewDate(target.date);
    setSelected(target.slot);
    void saveSelection(target).then(() => setStorageError(null)).catch(() => setStorageError('회차 선택을 저장하지 못했습니다.'));
    const restored = offsets.current[target.date + target.slot] || 0;
    offset.current = restored;
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: restored, animated: false }));
  };
  const gesture = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8) navigate(g.dx > 0 ? -1 : 1); },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.toolbar}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="메뉴 열기" onPress={() => setMenuOpen(true)} style={styles.iconButton}>
          <View style={styles.menuIcon}><View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLineShort} /></View>
        </TouchableOpacity>
        <Text style={styles.brand}>Market Flow</Text>
        <View style={styles.avatar} accessibilityLabel="Market Flow 앱 아이콘"><Text style={styles.avatarText}>MF</Text></View>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((name) => <TouchableOpacity key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.tabActive]}>
          <Text style={[styles.tabText, tab === name && styles.tabTextActive]}>{name}</Text>
        </TouchableOpacity>)}
      </View>
      {tab === '뉴스' ? <View style={{ flex: 1 }} {...gesture.panHandlers}>
        <View style={styles.basisRow}>
          <Text style={styles.dataBasis}>데이터 기준: {displayDay.date.replaceAll('-', '.')}. (KST)</Text>
          <View style={styles.dial}>
    {[-1, 0, 1].map(delta => { const entry = index < 0 ? undefined : timeline[index + delta]; return <TouchableOpacity key={delta} disabled={!entry || delta === 0} onPress={() => navigate(delta)} accessibilityRole="button" accessibilityLabel={entry ? entry.slot + ' 뉴스 ' + entry.state : '이동 끝'} accessibilityState={{ selected: delta === 0, disabled: !entry }} style={styles.slotButton}>
              <Text style={[
                styles.slotText,
                delta === 0 ? styles.slotSelected : styles.slotFaded,
                entry?.state === 'failed' || entry?.state === 'missing' ? styles.slotProblem : undefined,
                entry?.state === 'skipped' ? styles.slotSkipped : undefined,
              ]}>{entry?.slot.replace(/^0/, '') || '　'}</Text>
            </TouchableOpacity>; })}
          </View>
        </View>
        {!!error && <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text>}
        <FlatList
        ref={listRef}
        onScroll={e => { offset.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        data={visibleItems}
        removeClippedSubviews={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={visibleItems.length ? <View style={styles.separator} /> : undefined}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NewsCard item={item} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={C.accent} colors={[C.accent]} refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListHeaderComponent={<View>
          {feed?.statusNotes?.map((note,i)=><Text key={'status-'+i} style={styles.errorText}>{note}</Text>)}
          {!!storageError && <Text style={styles.errorText}>{storageError}</Text>}
        </View>}
        ListEmptyComponent={<View style={styles.empty}>
          {loading && <ActivityIndicator color={C.accent} />}
          <Text style={styles.emptyTitle}>{
            loading ? '뉴스 불러오는 중' :
            state === 'scheduled' ? '뉴스 예정' :
            state === 'skipped' ? '건너뜀' :
            state === 'failed' ? '뉴스 발행 실패' :
            state === 'missing' ? activeSlot + ' 뉴스 미발행' :
            state === 'published' ? '이 회차에 공개된 뉴스가 없습니다' : '뉴스 없음'
          }</Text>
          <Text style={styles.emptyText}>{
            loading ? '서버 시간축을 불러오고 있습니다.' :
            currentNav?.reason || currentNav?.errorCode ||
            (state === 'scheduled'
              ? displayDay.date.replaceAll('-', '.') + ' ' + activeSlot.replace(/^0/, '') + ' KST 예정 회차입니다.'
              : '서버에 해당 회차 자료가 없습니다.')
          }</Text>
        </View>}
      /></View> : tab === '시황' ? <MarketStatusScreen /> : tab === '특징주' ? <FeaturedStocksScreen /> : <View style={styles.placeholder}>
        <Text style={styles.emptyTitle}>{tab} 준비 중</Text>
        <Text style={styles.emptyText}>기업별 재무분석 데이터 연동 전입니다.</Text>
      </View>}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="메뉴 닫기" onPress={() => setMenuOpen(false)} />
          <View style={styles.menuPanel} accessibilityViewIsModal>
            <Text style={styles.section}>Market Flow</Text>
            <Text style={styles.menuDescription}>버전 00.39 · 시황 / 뉴스 / 특징주 / 기업분석</Text>
            <Text style={styles.menuDescription}>뉴스 발행시간은 서버 시간축 기준 · 최근 2일 보관</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="뉴스 새로고침" onPress={() => { setTab('뉴스'); setMenuOpen(false); void load(true); }} style={styles.menuAction}><Text style={styles.sourceAction}>뉴스 새로고침</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => setMenuOpen(false)} style={styles.menuAction}><Text style={styles.emptyTitle}>닫기</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><MarketFlow /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  toolbar: { height: 68, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { width: 18, gap: 4 },
  menuLine: { width: 18, height: 1.5, backgroundColor: C.accent },
  menuLineShort: { width: 12, height: 1.5, backgroundColor: C.accent },
  brand: { color: C.white, fontWeight: '700', fontSize: 20 },
  avatar: { width: 26, height: 26, marginHorizontal: 9, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 9, fontWeight: '700', color: C.background },
  tabs: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 18 },
  tab: { backgroundColor: C.white, borderRadius: 24, paddingHorizontal: 15, minHeight: 44, justifyContent: 'center' },
  tabActive: { backgroundColor: C.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: C.background },
  tabTextActive: { color: C.background },
  content: { paddingHorizontal: 16, paddingBottom: 28, flexGrow: 1 },
  basisRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, gap: 6, flexWrap: 'wrap' },
  dataBasis: { color: C.white, fontSize: 10, lineHeight: 18 },
  dial: { flexDirection: 'row', flex: 1, minWidth: 150, justifyContent: 'center', alignItems: 'center' },
  slotFaded: { opacity: 0.4 },
  slotProblem: { textDecorationLine: 'underline' },
  slotSkipped: { opacity: 0.25 },
  slotButton: { minHeight: 44, minWidth: 50, alignItems: 'center', justifyContent: 'center' },
  slotText: { color: C.white, fontSize: 11, fontWeight: '600' },
  slotSelected: { color: C.accent, fontSize: 17, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '700', color: C.accent },
  errorText: { color: C.accent, fontSize: 12, marginVertical: 8, lineHeight: 19 },
  card: { backgroundColor: C.background, paddingVertical: 18 },
  separator: { height: 1, backgroundColor: C.white },
  title: { color: C.accent, fontSize: 19, lineHeight: 27, fontWeight: '700' },
  summary: { color: C.white, fontSize: 14, lineHeight: 23, marginTop: 9 },
  sourceAction: { color: C.accent, fontWeight: '600', fontSize: 12, paddingVertical: 10 },
  empty: { padding: 24, marginTop: 14, alignItems: 'center' },
  emptyTitle: { color: C.white, fontWeight: '600', fontSize: 15 },
  emptyText: { color: C.white, fontSize: 12, marginTop: 10, textAlign: 'center', lineHeight: 20 },
  placeholder: { flex: 1, alignItems: 'center', paddingTop: 70, paddingHorizontal: 24 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: C.background },
  menuPanel: { backgroundColor: C.background, borderRadius: 18, padding: 24, borderWidth: 1, borderColor: C.white },
  menuDescription: { color: C.white, fontSize: 12, lineHeight: 21, marginTop: 8 },
  menuAction: { minHeight: 44, justifyContent: 'center', marginTop: 12 },
});

