import { observer } from 'mobx-react-lite';
import { Slider, Button, Input } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { AiSettingStore } from '@/store/aiSettingStore';
import { DEFAULT_MODEL_TEMPLATES } from './constants';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { Item, ItemWithTooltip } from '../Item';
import TagSelector from '@/components/Common/TagSelector';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { ShowRebuildEmbeddingProgressDialog } from '@/components/Common/RebuildEmbeddingProgress';
import { useSideNav } from '@/platform/PlatformProvider';

/** Known dimensions for a model key: per-model config first, then the shared template table. */
export function resolveAutoEmbeddingDimensions(modelKey?: string, modelConfigDims?: number): number {
  if (modelConfigDims && modelConfigDims > 0) return modelConfigDims;
  if (!modelKey) return 0;
  const key = modelKey.toLowerCase();
  const template = DEFAULT_MODEL_TEMPLATES.find(t => key.includes(t.modelKey.toLowerCase()));
  return template?.config?.embeddingDimensions ?? 0;
}

export const EmbeddingSettingsSection = observer(function EmbeddingSettingsSection() {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const aiSettingStore = RootStore.Get(AiSettingStore);
  const isPc = useSideNav();

  const [localState, setLocalState] = useState({
    embeddingTopK: planinc.config.value?.embeddingTopK ?? 5,
    embeddingScore: planinc.config.value?.embeddingScore ?? 0.6,
    embeddingDimensions: (planinc.config.value as any)?.embeddingDimensions ?? 0,
    rerankTopK: (planinc.config.value as any)?.rerankTopK ?? 3,
    rerankScore: (planinc.config.value as any)?.rerankScore ?? 0.5,
    excludeEmbeddingTagId: planinc.config.value?.excludeEmbeddingTagId
  });
  const [dimsError, setDimsError] = useState('');

  // The selected embedding model determines the auto-detected dimensions.
  useEffect(() => {
    if (!aiSettingStore.allModels.value) void aiSettingStore.allModels.call();
  }, []);
  const embeddingModel = aiSettingStore.allModels.value?.find(
    m => m.id === (planinc.config.value as any)?.embeddingModelId,
  ) as any;
  const autoDimensions = resolveAutoEmbeddingDimensions(
    embeddingModel?.modelKey, (embeddingModel?.config as any)?.embeddingDimensions,
  );
  const effectiveDimensions = localState.embeddingDimensions || autoDimensions;

  // Rebuild embedding state
  const [rebuildProgress, setRebuildProgress] = useState<{ percentage: number; isRunning: boolean } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRebuildProgress = async () => {
    try {
      const data = await api.ai.rebuildEmbeddingProgress.query();
      if (data) {
        setRebuildProgress({
          percentage: data.percentage,
          isRunning: data.isRunning,
        });

        if (data.isRunning && !pollingIntervalRef.current) {
          startPolling();
        } else if (!data.isRunning && pollingIntervalRef.current) {
          stopPolling();
        }
      }
    } catch (error) {
      console.error('Error fetching rebuild progress:', error);
    }
  };

  const startPolling = () => {
    if (pollingIntervalRef.current) return;
    pollingIntervalRef.current = setInterval(fetchRebuildProgress, 2000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    fetchRebuildProgress();
    return () => stopPolling();
  }, []);


  const handleRebuildClick = async () => {
    try {
      // Inline validation first: an unknown model with no manual dimensions
      // would otherwise fail deep in the rebuild job.
      if (!effectiveDimensions || effectiveDimensions <= 0) {
        setDimsError(
          t('embedding-dimensions-required', 'Set the embedding dimensions below before rebuilding — the selected model has no known dimensions.'),
        );
        return;
      }
      setDimsError('');
      // Check the latest status from database
      const latestProgress = await api.ai.rebuildEmbeddingProgress.query();

      if (latestProgress?.isRunning) {
        // Task is already running, show progress dialog
        setRebuildProgress({
          percentage: latestProgress.percentage,
          isRunning: true,
        });
        ShowRebuildEmbeddingProgressDialog(true);
        startPolling();
      } else {
        // No task running, show confirmation dialog for new rebuild
        showTipsDialog({
          title: t('force-rebuild-embedding-index'),
          content: t('if-you-have-a-lot-of-notes-you-may-consume-a-certain-number-of-tokens'),
          onConfirm: async () => {
            ShowRebuildEmbeddingProgressDialog(true);
            await api.ai.rebuildEmbeddingStart.mutate({ force: true, incremental: false });
            setRebuildProgress({
              percentage: 0,
              isRunning: true,
            });
            startPolling();
          },
        });
      }
    } catch (error) {
      console.error('Failed to check rebuild status:', error);
    }
  };


  return (
    <CollapsibleCard icon="mingcute:vector-line" title="Embedding Management">
      <div className="space-y-4">
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <ItemWithTooltip
              content={<>Top K</>}
              toolTipContent={
                <div className="md:w-[300px] flex flex-col gap-2">
                  <div>{t('top-k-description')}</div>
                </div>
              }
            />
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto justify-start">
              <Slider
                onChangeEnd={(value) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'embeddingTopK',
                      value: localState.embeddingTopK,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(value) => {
                  const newValue = Number(value);
                  setLocalState(prev => ({ ...prev, embeddingTopK: newValue }));
                }}
                value={localState.embeddingTopK}
                size="md"
                step={1}
                color="foreground"
                label={'value'}
                showSteps={false}
                maxValue={20}
                minValue={1}
                defaultValue={5}
                className="w-full"
              />
            </div>
          }
        />

        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <ItemWithTooltip
              content={<>Score</>}
              toolTipContent={
                <div className="md:w-[300px] flex flex-col gap-2">
                  <div>{t('embedding-score-description')}</div>
                </div>
              }
            />
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto justify-start">
              <Slider
                onChangeEnd={(value) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'embeddingScore',
                      value: localState.embeddingScore,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(value) => {
                  const newValue = Number(value);
                  setLocalState(prev => ({ ...prev, embeddingScore: newValue }));
                }}
                value={localState.embeddingScore}
                size="md"
                step={0.01}
                color="foreground"
                label={'value'}
                showSteps={false}
                maxValue={1.0}
                minValue={0}
                defaultValue={0.6}
                className="w-full"
              />
            </div>
          }
        />

        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <div className="flex flex-col gap-1">
              <ItemWithTooltip
                content={<>{t('exclude-tag-from-embedding')}</>}
                toolTipContent={t('exclude-tag-from-embedding-tip')}
              />
              <div className="text-desc text-xs">{t('exclude-tag-from-embedding-desc')}</div>
            </div>
          }
          rightContent={
            <TagSelector
              selectedTag={localState.excludeEmbeddingTagId?.toString() || null}
              onSelectionChange={(key) => {
                const newValue = key ? Number(key) : null;
                setLocalState(prev => ({ ...prev, excludeEmbeddingTagId: newValue }));
                PromiseCall(
                  api.config.update.mutate({
                    key: 'excludeEmbeddingTagId',
                    value: newValue,
                  }),
                  { autoAlert: false },
                );
              }}
            />
          }
        />

        {/* Embedding dimensions: auto-detected from the model, manual override when unknown */}
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <div className="flex flex-col gap-1">
              <ItemWithTooltip
                content={<>{t('embedding-dimensions', 'Embedding Dimensions')}</>}
                toolTipContent={t('embedding-dimensions-tip', 'Vector size of the embedding model. Auto-detected for known models — set manually for custom ones. 0 means auto.')}
              />
              <div className="text-desc text-xs">
                {autoDimensions > 0
                  ? t('embedding-dimensions-auto', `Auto-detected: ${autoDimensions} (${embeddingModel?.title ?? embeddingModel?.modelKey ?? ''})`)
                  : t('embedding-dimensions-unknown', 'Unknown model — manual dimensions required.')}
              </div>
            </div>
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto flex-col gap-1">
              <Input
                type="number"
                placeholder="0 (auto)"
                value={String(localState.embeddingDimensions ?? 0)}
                min={0}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  setLocalState(prev => ({ ...prev, embeddingDimensions: Number.isNaN(next) ? 0 : next }));
                  if (dimsError) setDimsError('');
                }}
                onBlur={(e) => {
                  const next = parseInt(e.target.value, 10) || 0;
                  if (next !== 0 && (next < 128 || next > 4096)) {
                    setDimsError(t('embedding-dimensions-range', 'Dimensions must be 0 (auto) or between 128 and 4096.'));
                    return;
                  }
                  setDimsError('');
                  PromiseCall(
                    api.config.update.mutate({ key: 'embeddingDimensions', value: next }),
                    { autoAlert: false },
                  );
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t('embedding-dimensions-hint', 'Common values: 384, 512, 768, 1024, 1536, 3072. Effective: ')}
                <span className="font-medium">{effectiveDimensions || '—'}</span>
              </p>
              {dimsError && <p className="text-xs text-destructive">{dimsError}</p>}
            </div>
          }
        />

        {/* Rerank tuning: model is picked in Default Models; thresholds live here */}
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <ItemWithTooltip
              content={<>{t('rerank-top-k', 'Rerank Top K')}</>}
              toolTipContent={
                <div className="md:w-[300px] flex flex-col gap-2">
                  <div>{t('rerank-top-k-description', 'Candidates passed to the rerank model (1–20).')}</div>
                </div>
              }
            />
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto justify-start">
              <Slider
                onChangeEnd={() => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'rerankTopK',
                      value: localState.rerankTopK,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(value) => {
                  const newValue = Number(value);
                  setLocalState(prev => ({ ...prev, rerankTopK: newValue }));
                }}
                value={localState.rerankTopK}
                size="md"
                step={1}
                color="foreground"
                label={'value'}
                showSteps={false}
                maxValue={20}
                minValue={1}
                defaultValue={3}
                className="w-full"
              />
            </div>
          }
        />

        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <ItemWithTooltip
              content={<>{t('rerank-score', 'Rerank Score')}</>}
              toolTipContent={
                <div className="md:w-[300px] flex flex-col gap-2">
                  <div>{t('rerank-score-description', 'Minimum rerank score for a candidate to be kept (0.0–1.0).')}</div>
                </div>
              }
            />
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto justify-start">
              <Slider
                onChangeEnd={() => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'rerankScore',
                      value: localState.rerankScore,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(value) => {
                  const newValue = Number(value);
                  setLocalState(prev => ({ ...prev, rerankScore: newValue }));
                }}
                value={localState.rerankScore}
                size="md"
                step={0.01}
                color="foreground"
                label={'value'}
                showSteps={false}
                maxValue={1.0}
                minValue={0}
                defaultValue={0.5}
                className="w-full"
              />
            </div>
          }
        />

        {/* Rebuild Embedding Section */}
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <div className="flex flex-col gap-1">
              <ItemWithTooltip
                content={<>{t('rebuild-embedding-index')}</>}
                toolTipContent={t('if-you-have-a-lot-of-notes-you-may-consume-a-certain-number-of-tokens')}
              />
              <div className="text-desc text-xs">{t('notes-imported-by-other-means-may-not-have-embedded-vectors')}</div>
            </div>
          }
          rightContent={
            <Button
              color="danger"
              variant="flat"
              startContent={
                rebuildProgress?.isRunning ? (
                  <div className="flex items-center gap-1">
                    <Icon icon="line-md:loading-twotone-loop" width="16" height="16" />
                    {rebuildProgress?.percentage || 0}%
                  </div>
                ) : (
                  <Icon icon="mingcute:refresh-4-ai-line" width="16" height="16" />
                )
              }
              onPress={handleRebuildClick}
            >
              {rebuildProgress?.isRunning ? t('rebuild-in-progress') : t('force-rebuild')}
            </Button>
          }
        />
      </div>
    </CollapsibleCard>
  );
});