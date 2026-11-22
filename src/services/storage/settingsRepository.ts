import {
  sanitizeReaderSettings,
  type ReaderSettings,
} from '../../domain/settings/readerSettings';
import { db as defaultDb, type ReaderDB } from './db';

const READER_KEY = 'reader';

export function createSettingsRepository(db: ReaderDB = defaultDb) {
  return {
    async loadReader(): Promise<ReaderSettings> {
      return sanitizeReaderSettings((await db.settings.get(READER_KEY))?.value);
    },
    async saveReader(settings: ReaderSettings): Promise<void> {
      await db.settings.put({ key: READER_KEY, value: settings });
    },
  };
}

export const settingsRepository = createSettingsRepository();
