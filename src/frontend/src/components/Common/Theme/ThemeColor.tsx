/**
 * Colour swatch picker for the persisted `themeColor` / `themeForegroundColor`
 * settings. Selecting a swatch writes it straight to the config.
 *
 * tokens-ignore-file: the accent swatch list is user-pickable colour DATA, not a
 * design decision — the chosen hex is persisted as the `themeColor` config value
 * and is therefore a stored contract, not something a token can rename. The
 * token layer governs the palette itself; see `lib/themePalettes.ts` for the
 * token-backed theme picker. Follow-up: fold these swatches into that picker
 * (PI-011 §6 P4) rather than growing this list further.
 */
import { observer } from "mobx-react-lite";
import { Button } from "@heroui/react";

const colors = [
  { name: 'default', background: '', foreground: '' },
  { name: 'rose', background: '#e11d48', foreground: 'var(--primary-foreground)' },
  { name: 'orange', background: '#ea580c', foreground: 'var(--primary-foreground)' },
  { name: 'lime', background: '#65a30d', foreground: 'var(--primary-foreground)' },
  { name: 'green', background: '#16a34a', foreground: 'var(--primary-foreground)' },
  { name: 'teal', background: '#0d9488', foreground: 'var(--primary-foreground)' },
  { name: 'cyan', background: '#0891b2', foreground: 'var(--primary-foreground)' },
  { name: 'blue', background: '#2563eb', foreground: 'var(--primary-foreground)' },
  { name: 'violet', background: '#7c3aed', foreground: 'var(--primary-foreground)' },
  { name: 'purple', background: '#9333ea', foreground: 'var(--primary-foreground)' }
];

interface Props {
  onChange?: (background: string, foreground: string) => Promise<any>;
  value?: string;
}

export const ThemeColor = observer(({ onChange, value = colors[0]?.background }: Props) => {
  return (
    <div className="flex gap-1 flex-wrap w-[250px] md:w-auto">
      {colors.map((color) => (
        <Button
          key={color.name}
          isIconOnly
          className={`w-8 h-8 min-w-8 rounded-full border-2 border-foreground`}
          style={{
            background: color.background || 'gray',
            backgroundImage: color.background.includes('gradient') ? color.background : 'none',
            border: value === color.background ? '2px solid var(--foreground)' : 'none'
          }}
          onPress={() => onChange?.(color.background, color.foreground)}
        />
      ))}
    </div>
  );
});
