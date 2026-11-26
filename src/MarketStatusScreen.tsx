import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, PanResponder, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchMarketStatus, type MarketContentItem, type MarketDisplayMetric, type MarketStatusEdition, type MarketStatusNavigation, type MarketStatusNavigationEntry } from './marketStatus';
import { isNewerPublication, visibleNavigationTimeline } from './editions';

const Y = '#F6DF83';
const KST = 9 * 3600000;
const kstDate = (now: number) => new Date(now + KST).toISOString().slice(0, 10);
type Selection = { date: string; slot: string };
const key = (e: Selection) => e.date + ' ' + e.slot;
const hhmm = (iso?: string) => iso?.match(/T(\d{2}:\d{2})/)?.[1] || '--:--';
const metricValue = (value: MarketDisplayMetric['value']) =>
  value === null ? '미확인' : typeof value === 'number' ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : value;
const changeText = (value?: number | null) =>
  value === null || value === undefined ? '' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export function marketNavigationTimeline(navigation: MarketStatusNavigation, now = Date.now()): MarketStatusNavigationEntry[] {
  return visibleNavigationTimeline(navigation, now);
}

function MetricsSection({ title, items }: { title?: string; items: MarketDisplayMetric[] }) {
  return <View style={s.section}>
    {!!title && <Text style={s.sectionTitle}>{title}</Text>}
    {items.map((item, i) => <View key={(title || 'metric') + i} style={s.metricRow}>
      <View style={s.metricLeft}>
        <Text style={s.metricLabel}>{item.label}</Text>
        {!!item.note && <Text style={s.metricNote}>{item.note}</Text>}
      </View>
      <View style={s.metricRight}>
        <Text style={s.metricValue}>{metricValue(item.value)}</Text>
        {!!changeText(item.changePct) && <Text style={s.metricChange}>{changeText(item.changePct)}</Text>}
      </View>
    </View>)}
  </View>;
}

function ContentSection({ item }: { item: MarketContentItem }) {
  if (item.type === 'metric') return <MetricsSection title={item.title} items={item.items} />;
  if (item.type === 'text') return <View style={s.section}>
    {!!item.title && <Text style={s.sectionTitle}>{item.title}</Text>}
    <Text style={s.body}>{item.text}</Text>
  </View>;
  if (item.type === 'list') return <View style={s.section}>
    {!!item.title && <Text style={s.sectionTitle}>{item.title}</Text>}
    {item.items.map((value, i) => <Text key={(item.title || 'list') + i} style={s.bullet}>• {value}</Text>)}
  </View>;
  if (item.type === 'table') return <View style={s.section}>
    {!!item.title && <Text style={s.sectionTitle}>{item.title}</Text>}
    <View style={s.tableRow}>{item.columns.map((column, i) => <Text key={'h'+i} style={[s.tableCell,s.tableHeader]}>{column}</Text>)}</View>
    {item.rows.map((row, ri) => <View key={'r'+ri} style={s.tableRow}>
      {item.columns.map((_, ci) => <Text key={'c'+ci} style={s.tableCell}>{metricValue(row[ci] ?? null)}</Text>)}
    </View>)}
  </View>;
  return <View style={s.section}>
    {!!item.title && <Text style={s.sectionTitle}>{item.title}</Text>}
    <TouchableOpacity accessibilityRole="link" accessibilityLabel={item.label + ' 원문 열기'}
      onPress={() => void Linking.openURL(item.url).catch(() => undefined)} style={s.sourceRow}>
      <Text style={[s.sourceName,s.link]}>{item.label} ↗</Text>
      {!!item.checkedAt && <Text style={s.sourceTime}>{hhmm(item.checkedAt)} 확인</Text>}
    </TouchableOpacity>
  </View>;
}

export function MarketStatusScreen() {
  const [days, setDays] = useState<Awaited<ReturnType<typeof fetchMarketStatus>>['days']>([]);
  const [navigation, setNavigation] = useState<MarketStatusNavigation>({previous:[],today:[],next:[]});
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<Selection | null>(null);
  const manual = useRef(false);
  const observedPublication = useRef<Selection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<MarketStatusEdition>>(null);
  const offsets = useRef<Record<string, number>>({});
  const offset = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async (refresh = false) => {
    if (busy.current) return;
    busy.current = true;
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const next = await fetchMarketStatus();
      const at = Date.now();
      setDays(next.days);
      setNavigation(next.navigation);
      setNow(at);
      setError(null);
      const timeline = marketNavigationTimeline(next.navigation, at);
      const latestPublished = [...timeline].reverse().find(item => item.state === 'published') || null;
      const publication = latestPublished ? {date:latestPublished.date,slot:latestPublished.slot} : null;
      const newer = isNewerPublication(publication, observedPublication.current);
      if (publication) observedPublication.current = publication;
      setSelected(old => {
        if (!newer && manual.current && old && timeline.some(item => key(item) === key(old))) return old;
        manual.current = false;
        return latestPublished ? {date:latestPublished.date,slot:latestPublished.slot}
          : timeline.find(item => item.date === kstDate(at)) || timeline[0] || null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '시황을 불러오지 못했습니다.');
    } finally {
      busy.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(true); }, 60000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void load(true); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [load]);

  const timeline = marketNavigationTimeline(navigation, now);
  const current = selected && timeline.some(item => key(item) === key(selected))
    ? selected
    : (() => {
        const latest = [...timeline].reverse().find(item => item.state === 'published');
        return latest ? {date:latest.date,slot:latest.slot}
          : timeline.find(item => item.date === kstDate(now)) || timeline[0] || null;
      })();
  const index = current ? timeline.findIndex(item => key(item) === key(current)) : -1;
  const currentNav = index >= 0 ? timeline[index] : undefined;
  const edition = current ? days.find(d => d.date === current.date)?.editions[current.slot] : undefined;

  const navigate = (step: number) => {
    const target = timeline[index + step];
    if (!target || !current || loading) return;
    offsets.current[key(current)] = offset.current;
    manual.current = true;
    setSelected(target);
    const restored = offsets.current[key(target)] || 0;
    offset.current = restored;
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: restored, animated: false }));
  };
  const gesture = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8) navigate(g.dx > 0 ? -1 : 1);
    },
  });

  const renderLegacy = (e: MarketStatusEdition) => {
    const regions = [e.us, e.kr].filter(Boolean);
    return <View>
      <Text style={s.headline}>{e.highlights[0] || '시황'}</Text>
      {regions.map((region, r) => region && <View key={r} style={s.section}>
        {!!region.indices?.length && <>
          <Text style={s.sectionTitle}>{e.scope === 'US_KR' ? (r === 0 ? '미국 주요 지수' : '한국 주요 지수') : '주요 지수'}</Text>
          {region.indices.map((v, i) => <View key={i} style={s.metricRow}>
            <Text style={s.metricLabel}>{v.name}</Text>
            <Text style={s.metricValue}>{v.value === null ? '미확인' : v.value.toLocaleString('ko-KR')} {changeText(v.changePct)}</Text>
          </View>)}
        </>}
        {region.themes?.map((x, i) => <Text key={'t' + i} style={s.bullet}>• {x}</Text>)}
      </View>)}
      {e.highlights.slice(1).map((h, i) => <Text key={i} style={s.bullet}>• {h}</Text>)}
    </View>;
  };

  return <View style={s.root} {...gesture.panHandlers}>
    <View style={s.basisRow}>
      <Text style={s.dataBasis}>데이터 기준: {(current?.date || kstDate(now)).replaceAll('-', '.')}. (KST)</Text>
      <View style={s.dial}>
        {[-1, 0, 1].map(delta => {
          const entry = index < 0 ? undefined : timeline[index + delta];
          const disabled = !entry || delta === 0 || loading;
          return <TouchableOpacity key={delta} disabled={disabled} onPress={() => navigate(delta)}
            accessibilityRole="button" accessibilityLabel={entry ? entry.slot + ' 시황 ' + entry.state : '이동 끝'}
            accessibilityState={{ selected: delta === 0, disabled }}
            style={s.slotButton}>
            <Text style={[
              s.slotText,
              delta === 0 ? s.slotSelected : s.slotFaded,
              entry?.state === 'failed' || entry?.state === 'missing' ? s.slotProblem : undefined,
              entry?.state === 'skipped' ? s.slotSkipped : undefined,
            ]}>{entry?.slot.replace(/^0/, '') || '　'}</Text>
          </TouchableOpacity>;
        })}
      </View>
    </View>
    <FlatList ref={listRef} data={edition ? [edition] : []} keyExtractor={e => e.date + e.slot}
      contentContainerStyle={s.content} {...gesture.panHandlers}
      onScroll={e => { offset.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Y} colors={[Y]} />}
      ListHeaderComponent={<View>
        {!!error && <Text style={s.warning}>{error} · 마지막 수신 데이터 유지</Text>}
        {loading && <ActivityIndicator color={Y} />}
      </View>}
      ListEmptyComponent={<View style={s.empty}>
        <Text style={s.sectionTitle}>{
          loading ? '시황을 조회하는 중' :
          currentNav?.state === 'scheduled' ? '시황 예정' :
          currentNav?.state === 'skipped' ? '건너뜀' :
          currentNav?.state === 'failed' ? '시황 발행 실패' :
          currentNav?.state === 'missing' ? '시황 미발행' : '시황 없음'
        }</Text>
        <Text style={s.muted}>{
          loading ? '서버 시간축을 불러오고 있습니다.' :
          currentNav?.reason || currentNav?.errorCode ||
          (currentNav?.state === 'scheduled'
            ? currentNav.date.replaceAll('-', '.') + ' ' + currentNav.slot + ' KST 예정 회차입니다.'
            : '서버에 이 회차의 발행 데이터가 없습니다.')
        }</Text>
      </View>}
      renderItem={({ item: e }) => <View>
        <Text style={s.meta}>관측 {hhmm(e.display?.observedAt || e.asOf)} · 발행 {hhmm(e.publishedAt)}</Text>
        {e.display ? <>
          {!!e.display.headline && <Text style={s.headline}>{e.display.headline}</Text>}
          {!!e.display.badges?.length && <View style={s.badges}>
            {e.display.badges.map((badge,i)=><View key={i} style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>)}
          </View>}
        </> : null}
        {e.content.map((item,i)=><ContentSection key={item.type+'-'+i} item={item} />)}
        {!!e.contentWarnings && <Text style={s.warning}>일부 시황 항목을 지원하지 않아 건너뛰었습니다. ({e.contentWarnings})</Text>}
        {!e.display && e.content.length===0 && renderLegacy(e)}
        {!!e.sources.length && <View style={s.section}>
          <Text style={s.sectionTitle}>출처</Text>
          {e.sources.map((source, i) => <TouchableOpacity key={i} onPress={() => void Linking.openURL(source.url)} style={s.sourceRow}
            accessibilityRole="link" accessibilityLabel={source.name + ' 원문 열기'}>
            <Text style={s.sourceName}>{source.name} ↗</Text>
            <Text style={s.sourceTime}>{hhmm(source.checkedAt)} 확인</Text>
          </TouchableOpacity>)}
        </View>}
      </View>}
    />
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  basisRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, gap: 6, flexWrap: 'wrap' },
  dataBasis: { color: '#fff', fontSize: 10, lineHeight: 18 },
  dial: { flexDirection: 'row', flex: 1, minWidth: 150, justifyContent: 'center', alignItems: 'center' },
  slotButton: { minHeight: 44, minWidth: 50, alignItems: 'center', justifyContent: 'center' },
  slotText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  slotSelected: { color: Y, fontSize: 17, fontWeight: '700' },
  slotFaded: { opacity: 0.4 },
  slotProblem: { textDecorationLine: 'underline' },
  slotSkipped: { opacity: 0.25 },
  content: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  warning: { color: Y, fontSize: 12, marginBottom: 8 },
  meta: { color: '#888', fontSize: 11, marginTop: 4, marginBottom: 10 },
  headline: { color: '#fff', fontSize: 22, lineHeight: 31, fontWeight: '700', marginBottom: 10 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  badge: { borderWidth: 1, borderColor: '#3A3A3A', backgroundColor: '#151515', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { color: '#D6D6D6', fontSize: 11, fontWeight: '600' },
  section: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343434', paddingVertical: 14 },
  sectionTitle: { color: Y, fontSize: 17, lineHeight: 24, fontWeight: '700', marginBottom: 8 },
  body: { color: '#F1F1F1', fontSize: 14, lineHeight: 23 },
  bullet: { color: '#F1F1F1', fontSize: 14, lineHeight: 23, marginVertical: 2 },
  metricRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 7 },
  metricLeft: { flex: 1 },
  metricRight: { alignItems: 'flex-end' },
  metricLabel: { color: '#F3F3F3', fontSize: 14, fontWeight: '600' },
  metricNote: { color: '#777', fontSize: 10, marginTop: 3 },
  metricValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  metricChange: { color: Y, fontSize: 12, fontWeight: '700', marginTop: 2 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 42, paddingVertical: 5 },
  sourceName: { color: '#D8D8D8', fontSize: 12, flex: 1 },
  link: { color: Y },
  sourceTime: { color: '#666', fontSize: 10 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343434' },
  tableCell: { color: '#F1F1F1', flex: 1, paddingHorizontal: 5, paddingVertical: 9, fontSize: 12 },
  tableHeader: { color: Y, fontWeight: '700' },
  muted: { color: '#888', fontSize: 12, lineHeight: 20 },
  empty: { alignItems: 'center', marginTop: 40 },
});

