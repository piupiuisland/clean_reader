import { create } from 'zustand';

export type DialogActionStyle = 'default' | 'primary' | 'danger' | 'cancel';

export interface DialogAction {
  label: string;
  value: string;
  style?: DialogActionStyle;
}

export interface DialogOptions {
  title: string;
  message?: string;
  input?: { initial: string; placeholder?: string };
  actions: DialogAction[];
  /** 'alert' = centered card, 'sheet' = iOS-style action sheet from the bottom. */
  variant?: 'alert' | 'sheet';
}

export interface DialogResult {
  /** Chosen action value, or null if dismissed. */
  action: string | null;
  text: string;
}

interface DialogState {
  current: (DialogOptions & { resolve: (r: DialogResult) => void }) | null;
  ask: (opts: DialogOptions) => Promise<DialogResult>;
  close: (r: DialogResult) => void;
}

export const useDialog = create<DialogState>((set, get) => ({
  current: null,
  ask: (opts) =>
    new Promise<DialogResult>((resolve) => {
      get().current?.resolve({ action: null, text: '' });
      set({ current: { ...opts, resolve } });
    }),
  close: (r) => {
    const cur = get().current;
    set({ current: null });
    cur?.resolve(r);
  },
}));

export const ask = (opts: DialogOptions) => useDialog.getState().ask(opts);

interface ToastState {
  message: string | null;
  tone: 'info' | 'error';
  show: (message: string, tone?: 'info' | 'error') => void;
  hide: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  show: (message, tone = 'info') => {
    clearTimeout(toastTimer);
    set({ message, tone });
    toastTimer = setTimeout(() => set({ message: null }), tone === 'error' ? 6000 : 2500);
  },
  hide: () => set({ message: null }),
}));

export const toast = (message: string, tone?: 'info' | 'error') => useToast.getState().show(message, tone);
