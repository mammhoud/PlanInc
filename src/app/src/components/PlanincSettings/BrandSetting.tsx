import { observer } from 'mobx-react-lite';
import { Button, Image, Input, Textarea } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../Common/CollapsibleCard';

type ResourceImage = { id: number; name: string; path: string; url: string };

/**
 * Workspace logo.
 *
 * The logo can be pasted, picked from an existing image resource, or generated
 * with the configured image model — so a workspace never has to leave the app to
 * get a mark.
 */
export const BrandSetting = observer(() => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [search, setSearch] = useState('');
  const [images, setImages] = useState<ResourceImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const loadImages = async (query = '') => {
    try {
      setImages(await api.branding.searchImages.query({ query }) as ResourceImage[]);
    } catch (cause) {
      console.error('Failed to search image resources', cause);
      setImages([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const branding = await api.branding.get.query();
        setUrl(branding.url);
        setPrompt(branding.prompt);
      } catch (cause) {
        console.error('Failed to load branding', cause);
      } finally {
        setIsLoading(false);
      }
      await loadImages();
    })();
  }, []);

  const saveUrl = async (next: string) => {
    setUrl(next);
    try {
      await api.branding.setLogo.mutate({ url: next });
      setError('');
    } catch (cause) {
      setError((cause as Error)?.message ?? t('operation-failed'));
    }
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError('');
    try {
      const result = await api.branding.generateLogo.mutate({ prompt: prompt.trim() });
      setUrl(result.url);
    } catch (cause) {
      console.error('Logo generation failed', cause);
      setError((cause as Error)?.message ?? t('operation-failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <CollapsibleCard icon="tabler:photo" title={t('workspace-logo')}>
      <div className="flex flex-col gap-4 p-1">
        <p className="text-sm text-default-500">{t('workspace-logo-description')}</p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-divider bg-content2">
            {url
              ? <Image src={url} alt={t('workspace-logo')} className="h-14 w-14 rounded-lg object-contain" />
              : <Icon icon="tabler:photo-off" width="22" height="22" className="text-default-400" />}
          </div>
          <div className="min-w-[220px] flex-1">
            <Input
              label={t('logo-url')}
              description={t('logo-url-description')}
              value={url.startsWith('data:') ? t('logo-generated-inline') : url}
              isDisabled={url.startsWith('data:')}
              onValueChange={saveUrl}
            />
          </div>
          {url && <Button size="sm" variant="flat" color="danger" onPress={() => saveUrl('')}>{t('remove-logo')}</Button>}
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('search-logo-resources')}</h3>
          <Input
            size="sm"
            placeholder={t('search')}
            value={search}
            onValueChange={(value) => { setSearch(value); void loadImages(value); }}
            startContent={<Icon icon="mdi:magnify" width="18" height="18" />}
          />
          {isLoading && <p className="text-xs text-default-400">{t('in-progress')}</p>}
          {!isLoading && !images.length && <p className="text-xs text-default-400">{t('no-image-resources')}</p>}
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                title={image.name}
                onClick={() => saveUrl(image.url)}
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-divider bg-content2 hover:border-primary"
              >
                <Image src={image.url} alt={image.name} className="h-12 w-12 object-cover" />
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('generate-logo')}</h3>
          <Textarea
            minRows={2}
            label={t('logo-prompt')}
            description={t('logo-prompt-description')}
            value={prompt}
            onValueChange={setPrompt}
          />
          <Button
            className="self-start"
            size="sm"
            color="primary"
            isLoading={isGenerating}
            isDisabled={!prompt.trim()}
            startContent={<Icon icon="tabler:sparkles" width="16" height="16" />}
            onPress={generate}
          >
            {t('generate-logo')}
          </Button>
        </section>

        {error && <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger">{error}</p>}
      </div>
    </CollapsibleCard>
  );
});
