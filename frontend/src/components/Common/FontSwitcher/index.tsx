import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2 } from 'lucide-react';
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from '@/lib/trpc';
import { FontManager, FontMetadata } from '@/lib/fontManager';

interface FontSwitcherProps {
  fontname?: string;
  onChange?: (fontname: string) => void;
}

const FontSwitcher = ({ fontname = 'default', onChange }: FontSwitcherProps) => {
  const [fonts, setFonts] = useState<FontMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFont, setLoadingFont] = useState<string | null>(null);

  // Fetch font metadata from database on mount (no binary data - fast!)
  useEffect(() => {
    const fetchFonts = async () => {
      try {
        if (!api.fonts) {
          throw new Error('Font API not available');
        }
        // This only fetches metadata, not binary data
        const fontList = await api.fonts.list.query();
        setFonts(fontList);
        // Initialize the FontManager with metadata only
        FontManager.initializeRegistry(fontList);
      } catch (error) {
        console.error('Failed to fetch fonts:', error);
        // Fallback to default font if API fails
        setFonts([
          { id: 0, name: 'default', displayName: 'Default (System)', url: null, isLocal: false, weights: [400], category: 'sans-serif', isSystem: true, sortOrder: 0 }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchFonts();
  }, []);

  // Load the current font on mount if not default
  useEffect(() => {
    if (fontname && fontname !== 'default' && fonts.length > 0) {
      // Apply font immediately (will load in background)
      FontManager.applyFont(fontname).catch((error) => {
        console.warn('Failed to apply font on mount:', error);
      });
    }
  }, [fontname, fonts]);

  const handleFontSelect = async (selectedFont: string) => {
    if (selectedFont === fontname) return;

    setLoadingFont(selectedFont);

    try {
      // Load and apply the font
      await FontManager.applyFont(selectedFont);
      onChange?.(selectedFont);
    } catch (error) {
      console.error('Failed to apply font:', error);
    } finally {
      setLoadingFont(null);
    }
  };



  const currentFont = fonts.find(f => f.name === fontname);

  if (loading) {
    return (
      <Button variant="ghost" loading>
        Loading...
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          {currentFont?.displayName || fontname || 'Select Font'}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="p-2 max-h-[400px] overflow-y-auto"
        aria-label="Font selection"
      >
        {fonts.map((font) => (
          <DropdownMenuItem
            key={font.name}
            className="flex items-center justify-between cursor-pointer"
            onSelect={() => handleFontSelect(font.name)}
          >
            <span
              className="flex-1"
              style={{
                fontFamily: font.isSystem ? undefined : `"${font.name}", ${font.category}`
              }}
            >
              {font.displayName}
            </span>
            {loadingFont === font.name ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : fontname === font.name ? (
              <Icon icon="mingcute:check-fill" width="18" height="18" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default FontSwitcher;
