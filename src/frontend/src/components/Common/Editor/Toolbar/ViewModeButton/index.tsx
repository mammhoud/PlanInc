import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { eventBus } from '@/lib/event';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useSideNav } from '@/platform/PlatformProvider';

interface Props {
  viewMode: "wysiwyg" | "sv" | "ir" | "raw";
}

export const ViewModeButton = ({ viewMode }: Props) => {
  const { t } = useTranslation();
  const isPc = useSideNav();
  const modes = [
    {
      key: 'ir',
      label: t('live-preview'),
      icon: 'tabler:eye',
    },
    {
      key: 'sv',
      label: t('split-view'),
      icon: 'tabler:layout-columns',
    },
    {
      key: 'raw',
      label: t('raw-markdown'),
      icon: 'tabler:code',
    },
    ...(isPc ? [{
      key: 'wysiwyg',
      label: t('rich-text'),
      icon: 'tabler:eye-edit',
    }] : [])
  ];

  const getCurrentMode = () => {
    return modes.find(mode => mode.key === viewMode) || modes[0];
  };

  const handleModeChange = (key: string) => {
    eventBus.emit('editor:setViewMode', key);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="hover:bg-default-100 rounded-md">
          <IconButton
            tooltip="View Mode"
            icon={getCurrentMode().icon}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Editor view mode">
        {modes.map((mode) => (
          <DropdownMenuItem
            key={mode.key}
            onSelect={() => {
              if (mode.key !== viewMode) {
                handleModeChange(mode.key);
              }
            }}
          >
            <div className="flex items-center">
              <i className={`${mode.icon} text-lg`} />
            </div>
            {mode.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}; 