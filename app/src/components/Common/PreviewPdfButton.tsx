import { Button } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';

export function PreviewPdfButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Button
      className={`blinko-preview-pdf-button ${className}`}
      variant="flat"
      size="sm"
      startContent={<Icon icon="mdi:file-pdf-box" width="18" height="18" />}
      onPress={() => window.print()}
      aria-label={`${t('download')} PDF`}
    >
      {t('download')} PDF
    </Button>
  );
}
