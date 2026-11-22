import { create } from 'zustand';
import {
  DEFAULT_READER_SETTINGS,
  sanitizeReaderSettings,
  type ReaderSettings,
} from '../domain/settings/readerSettings';
import { settingsRepository } from '../services/storage/settingsRepository';

interface SettingsState {
  reader: ReaderSettings;
  loaded: boolean;
  load: () => Promise<void>;
  /** Re-read from storage (after restoring a backup). */
  reload: () => Promise<void>;
  updateReader: (patch: Partial<ReaderSettings>) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useSettings = create<SettingsState>((set, get) => ({
  reader: DEFAULT_READER_SETTINGS,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      set({ reader: await settingsRepository.loadReader(), loaded: true });
    } catch {
      set({ loaded: true }); // fall back to defaults; never block reading
    }
  },
  reload: async () => {
    set({ loaded: false });
    await get().load();
  },
  updateReader: (patch) => {
    const reader = sanitizeReaderSettings({ ...get().reader, ...patch });
    set({ reader });
    // Slider drags fire many updates; persist once things settle.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void settingsRepository.saveReader(reader).catch(() => {}), 300);
  },
}));
