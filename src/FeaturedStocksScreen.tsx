import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, FlatList, PanResponder, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchFeaturedFeed, featuredNavigationTimeline, type DailyFeaturedStocks, type FeaturedNavigation, type FeaturedStock } from './featuredStocks';
import { isNewerPublication } from './editions';

const accent = '#F6DF83';
const rate = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
type Row = { id: string; name: string; weightedChangeRate?: number; judgment?: string; reason: string; sourceUrl?: string; individual?: boolean; stocks: FeaturedStock[] };

export function FeaturedStocksScreen() {
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [navigation, setNavigation] = useState<FeaturedNavigation>({previous:[],today:[],next:[]});
  const [now, setNow] = useState(Date.now());
  const [days, setDays] = useState<Record<string, DailyFeaturedStocks>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const choice = useRef<{ date: string; slot: string } | null>(null);
  const observedPublication = useRef<{ date: string; slot: string } | null>(null);
  const busy = useRef(false);
  const listRef = useRef<FlatList<Row>>(null);
  const offsets = useRef<Record<string, number>>({});
  const offset = useRef(0);
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const checked = Date.now();
      const feed = await fetchFeaturedFeed(checked);
      const data = feed.days;
      const timeline = featuredNavigationTimeline(feed.navigation, checked);
      const warnings = Object.values(data).flatMap(day => day.warnings || []);
      const saved = choice.current;
      const latestPublished = [...timeline].reverse().find(x => x.state === 'published');
      const publication = latestPublished ? {date:latestPublished.date,slot:latestPublished.slot} : null;
      const newer = isNewerPublication(publication, observedPublication.current);
      if (publication) observedPublication.current = publication;
      const retained = !newer && saved && timeline.some(x => x.date === saved.date && x.slot === saved.slot) ? saved : null;
      const today = new Date(checked + 9 * 3600000).toISOString().slice(0, 10);
      const selected = retained || latestPublished || timeline.find(x => x.date === today) || timeline[0];
      if (saved && !retained) choice.current = null;
      setNavigation(feed.navigation);
      setNow(checked);
      setDays(data);
      if (selected) { setDate(selected.date); setSlot(selected.slot); }
      setError(warnings.length ? warnings.join(' / ') : null);
    } catch (e) { setError(e instanceof Error ? e.message : '특징주를 불러오지 못했습니다.'); }
    finally { busy.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 60_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') { void load(); } });
    return () => { clearInterval(timer); sub.remove(); };
  }, [load]);
  const timeline = featuredNavigationTimeline(navigation, now);
  const visibleDate = date || timeline[0]?.date || '';
  const index = timeline.findIndex(entry => entry.date === visibleDate && entry.slot === slot);
  const currentNav = index >= 0 ? timeline[index] : undefined;
  const edition = visibleDate ? days[visibleDate]?.editions[slot] : undefined;
  const byCode = new Map(edition?.stocks.map(s => [s.code, s]) || []);
  const rows: Row[] = edition ? edition.themes.map(t => ({
    id: t.id, name: '테마 · '+t.name, sourceUrl: t.reason?.sourceUrl, weightedChangeRate: t.weightedChangeRate,
    reason: t.reason ? (t.reason.causality === 'related_fact_only' ? '상승 배경(추정): ' : '') + t.reason.summary : '당일 상승 이유 확인 안 됨',
    stocks: t.stockCodes.map(c => byCode.get(c)!),
  })) : [];
  if (edition?.schemaVersion === 1 && edition.unclassified.length) rows.push({ id: 'unclassified', name: '미분류', reason: '테마 관계 확인 안 됨', stocks: edition.unclassified.map(c => byCode.get(c)!) });
  if (edition?.schemaVersion === 3) edition.individualStocks?.forEach(x => rows.push({id:'individual-'+x.code, name:'개별 특징주 · '+byCode.get(x.code)!.name, individual:true, sourceUrl:x.reason?.sourceUrl, reason:x.reason ? (x.reason.causality==='related_fact_only'?'상승 배경(추정): ':'')+x.reason.summary : '당일 상승 이유 확인 안 됨', stocks:[byCode.get(x.code)!]}));
  const select = (d: string, s: string) => { choice.current = { date: d, slot: s }; setDate(d); setSlot(s); };
  const navigate = (delta: number) => {
    if (index < 0) return;
    const target = timeline[index + delta];
    if (!target || loading) return;
    offsets.current[visibleDate + slot] = offset.current;
    select(target.date, target.slot);
    const restored = offsets.current[target.date + target.slot] || 0;
    offset.current = restored;
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: restored, animated: false }));
  };
  const gesture = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8) navigate(g.dx > 0 ? -1 : 1);
    },
  });
  // Server navigation owns published/scheduled/skipped/missing/failed status.
  return <View style={{ flex: 1 }} {...gesture.panHandlers}>
    <View style={styles.basisRow}>
      <Text style={styles.dataBasis}>데이터 기준: {visibleDate.replaceAll('-', '.')}. (KST)</Text>
      <View style={styles.dial}>
        {[-1, 0, 1].map(delta => { const entry = timeline[index + delta]; return <TouchableOpacity key={delta} disabled={!entry || delta === 0 || loading} onPress={() => navigate(delta)} accessibilityRole="button" accessibilityLabel={entry ? entry.slot + ' 특징주 ' + entry.state : '이동 끝'} accessibilityState={{ selected: delta === 0, disabled: !entry || loading }} style={styles.slotButton}>
          <Text style={[
            styles.slotText,
            delta === 0 ? styles.slotSelected : styles.slotFaded,
            entry?.state === 'failed' || entry?.state === 'missing' ? styles.slotProblem : undefined,
            entry?.state === 'skipped' ? styles.slotSkipped : undefined,
          ]}>{entry?.slot.replace(/^0/, '') || '　'}</Text>
        </TouchableOpacity>; })}
      </View>
    </View>
    <FlatList ref={listRef} data={rows} keyExtractor={r => r.id} contentContainerStyle={styles.content}
      {...gesture.panHandlers}
      onScroll={e => { offset.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={accent} colors={[accent]} />}
      ListHeaderComponent={<View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!edition && <><Text style={styles.text}>시세 관측: {new Date(Date.parse(edition.asOf) + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ')} (KST)</Text>
          {!!edition.publishedAt && <Text style={styles.note}>예약 {slot} KST · 발행 {new Date(Date.parse(edition.publishedAt)+9*3600000).toISOString().slice(11,19)} KST</Text>}
          <Text style={styles.note}>{edition.schemaVersion === 3 ? 'KRX+NXT 통합 거래대금 상위 100종목' : edition.schemaVersion === 2 ? 'KRX 거래대금 상위 100종목 · NXT 미합산' : '통합거래대금 상위 50종목'} · KRX 전일 종가 대비 등락률</Text>
          <Text style={styles.note}>{edition.schemaVersion === 3 ? '테마 가중 상승률: Top100 중 +4% 이상 포함 종목 기준 · 전체 업종 지수 아님' : edition.schemaVersion === 2 ? '종목 확산·상승 강도·거래대금·재료 확인도 종합 순위 · 테마 개수 제한 없음' : '테마 등락률: 상위 50종목 내 거래대금 가중평균'}</Text></>}
      </View>}
      ListEmptyComponent={<View style={styles.empty}>{loading ? <ActivityIndicator color={accent} /> : <>
        <Text style={styles.title}>{
          error && !edition ? '특징주 조회 실패' :
          edition ? edition.schemaVersion === 3 ? '+4% 이상 종목 없음' : '선정 기준을 충족한 테마 없음' :
          currentNav?.state === 'scheduled' ? '특징주 예정' :
          currentNav?.state === 'skipped' ? '건너뜀' :
          currentNav?.state === 'failed' ? '특징주 발행 실패' :
          currentNav?.state === 'missing' ? '특징주 미발행' : '특징주 없음'
        }</Text>
        <Text style={styles.note}>{
          error && !edition ? '연결 또는 데이터 검증 오류입니다. 새로고침으로 다시 확인하세요.' :
          edition ? '해당 회차 자료는 정상 수신했습니다.' :
          currentNav?.reason || currentNav?.errorCode ||
          (currentNav?.state === 'scheduled' ? visibleDate.replaceAll('-', '.') + ' ' + slot + ' KST 예정 회차입니다.' : '서버에 해당 회차 자료가 없습니다.')
        }</Text>
      </>}</View>}
      renderItem={({ item }) => <View style={styles.theme}>
        <Text style={styles.title}>{item.name}{item.judgment || item.weightedChangeRate === undefined ? '' : '  ' + rate(item.weightedChangeRate)}</Text>
        {!!item.judgment && <Text style={styles.note}>{item.judgment} · 참고 가중 등락률 {rate(item.weightedChangeRate || 0)}</Text>}
        <Text style={styles.reason}>{item.reason}</Text>
        {!!item.sourceUrl && <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL(item.sourceUrl!).catch(() => setError("출처 링크를 열지 못했습니다.")); }}><Text style={[styles.text,styles.active]}>상승 이유 원문</Text></TouchableOpacity>}
        {item.stocks.map(s => <View key={s.code} style={styles.stock}><Text style={styles.text}>{s.name}</Text><Text style={styles.text}>{rate(s.changeRate)} · {((s.integratedTradeAmount ?? s.tradeAmount ?? 0)/100000000).toLocaleString("ko-KR",{maximumFractionDigits:1})}억원</Text></View>)}
      </View>} />
  </View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 28, flexGrow: 1 },
  basisRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, gap: 6, flexWrap: 'wrap' },
  dataBasis: { color: '#FFFFFF', fontSize: 10, lineHeight: 18 },
  dial: { flexDirection: 'row', flex: 1, minWidth: 150, justifyContent: 'center', alignItems: 'center' },
  slotButton: { minHeight: 44, minWidth: 50, alignItems: 'center', justifyContent: 'center' },
  slotText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  slotSelected: { color: accent, fontSize: 17, fontWeight: '700' },
  slotFaded: { opacity: 0.4 },
  slotProblem: { textDecorationLine: 'underline' },
  slotSkipped: { opacity: 0.25 },
  text: { color: '#FFFFFF', fontSize: 12, lineHeight: 20 },
  active: { color: accent, fontWeight: '700' },
  title: { color: accent, fontSize: 19, fontWeight: '700', lineHeight: 28 },
  reason: { color: '#FFFFFF', fontSize: 14, lineHeight: 23, marginVertical: 10 },
  note: { color: '#FFFFFF', fontSize: 11, lineHeight: 20, marginTop: 6 },
  error: { color: accent, fontSize: 12, lineHeight: 20, marginVertical: 8 },
  theme: { borderBottomWidth: 1, borderColor: '#FFFFFF', paddingVertical: 18 },
  stock: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  empty: { alignItems: 'center', marginTop: 40 },
});

