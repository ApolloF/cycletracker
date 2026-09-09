import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Sheet({ title, children, open, onClose, description }: { title: string; children: ReactNode; open: boolean; onClose(): void; description?: string }) {
  return <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}><Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className="sheet"><div className="row spread"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close"><X size={20}/></Dialog.Close></div><Dialog.Description className="muted">{description ?? 'Changes are saved only when you submit this form.'}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><h3>{title}</h3><p>{children}</p></div>; }
export const formatTime = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const formatDate = (at: string) => new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
