import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

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
        <p className="text-sm text-muted-foreground">{t('workspace-logo-description')}</p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border bg-muted">
            {url
              ? <img src={url} alt={t('workspace-logo')} className="h-14 w-14 rounded-lg object-contain" />
              : <Icon icon="tabler:photo-off" width="22" height="22" className="text-muted-foreground" />}
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="space-y-1">
              <Label>{t('logo-url')}</Label>
              <Input
                value={url.startsWith('data:') ? t('logo-generated-inline') : url}
                disabled={url.startsWith('data:')}
                onChange={(e) => saveUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('logo-url-description')}</p>
            </div>
          </div>
          {url && <Button size="sm" variant="destructive" onClick={() => saveUrl('')}>{t('remove-logo')}</Button>}
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('search-logo-resources')}</h3>
          <div className="relative">
            <Icon icon="mdi:magnify" width="18" height="18" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="h-9 pl-10"
              placeholder={t('search')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); void loadImages(e.target.value); }}
            />
          </div>
          {isLoading && <p className="text-xs text-muted-foreground">{t('in-progress')}</p>}
          {!isLoading && !images.length && <p className="text-xs text-muted-foreground">{t('no-image-resources')}</p>}
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                title={image.name}
                onClick={() => saveUrl(image.url)}
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border bg-muted hover:border-primary"
              >
                <img src={image.url} alt={image.name} className="h-12 w-12 object-cover" />
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('generate-logo')}</h3>
          <div className="space-y-1">
            <Label>{t('logo-prompt')}</Label>
            <Textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('logo-prompt-description')}</p>
          </div>
          <Button
            className="self-start"
            size="sm"
            disabled={!prompt.trim()}
            onClick={generate}
          >
            {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
            {!isGenerating && <Icon icon="tabler:sparkles" width="16" height="16" />}
            {t('generate-logo')}
          </Button>
        </section>

        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </div>
    </CollapsibleCard>
  );
});
