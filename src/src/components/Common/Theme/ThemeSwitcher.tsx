import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';

interface ThemeSwitcherProps {
  onChange?: (theme: string) => Promise<any>;
}

const ThemeSwitcher = observer(({ onChange }: ThemeSwitcherProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const handleSelect = async (key: string) => {
    await onChange?.(key);
    if (key === 'system') {
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    } else {
      setTheme(key)
    }
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="py-2 transition duration-300 ease-in-out cursor-pointer"
          >
            {theme === 'dark' ? (
              <Icon icon="line-md:moon-alt-loop" width="24" height="24" />
            ) : (
              <Icon icon="line-md:sun-rising-loop" width="24" height="24" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => handleSelect('light')}>
            <Icon icon="line-md:sun-rising-loop" />
            {t('light-mode')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSelect('dark')}>
            <Icon icon="line-md:moon-alt-loop" />
            {t('dark-mode')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSelect('system')}>
            <Icon icon="mdi:theme-light-dark" />
            {t('follow-system')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

export default ThemeSwitcher;
