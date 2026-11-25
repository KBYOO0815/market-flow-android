import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSelection, type BriefingSelection } from './editions';

const KEY = 'market-flow.briefing-selection.v1';
let writes = Promise.resolve();

export async function readSelection(now = Date.now()): Promise<BriefingSelection | null> {
  return parseSelection(await AsyncStorage.getItem(KEY), now);
}

export function saveSelection(selection: BriefingSelection | null): Promise<void> {
  // Serialize rapid dial gestures so an older write cannot win after a newer one.
  writes = writes.catch(() => {}).then(() => selection
    ? AsyncStorage.setItem(KEY, JSON.stringify(selection)) : AsyncStorage.removeItem(KEY));
  return writes;
}
