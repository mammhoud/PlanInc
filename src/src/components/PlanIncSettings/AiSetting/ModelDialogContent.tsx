import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { RootStore } from '@/store';
import { AiSettingStore, AiModel, ModelCapabilities, ProviderModel } from '@/store/aiSettingStore';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { CAPABILITY_ICONS, CAPABILITY_LABELS, CAPABILITY_COLORS, DEFAULT_MODEL_TEMPLATES } from './constants';
import { ProviderIcon, ModelIcon } from '@/components/PlanIncSettings/AiSetting/AIIcon';
import { api } from '@/lib/trpc';

// Utility function to format test connection results
const formatTestResults = (result: any, t: (key: string) => string): string => {
  const details: string[] = [];
  const latency = (ms: unknown) => (typeof ms === 'number' ? ` (${ms}ms)` : '');

  if (result?.capabilities?.inference?.success) {
    const response = result.capabilities.inference.response || '';
    details.push(`Chat: ✅ ${response}${latency(result.capabilities.inference.latencyMs)}`);
  }

  if (result?.capabilities?.embedding?.success) {
    const dimensions = result.capabilities.embedding.dimensions || 0;
    details.push(`Embedding: ✅ ${dimensions} dimensions${latency(result.capabilities.embedding.latencyMs)}`);
  }

  if (result?.capabilities?.audio?.success) {
    const message = result.capabilities.audio.message || '';
    details.push(`Audio: ✅ ${message}`);
  }

  return `${t('check-connect-success')} - ${details.join(', ')}`;
};

const capabilityBadgeVariant = (color: string): 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' => {
  switch (color) {
    case 'primary': return 'default';
    case 'secondary': return 'secondary';
    case 'success': return 'success';
    case 'warning': return 'warning';
    case 'danger': return 'destructive';
    default: return 'secondary';
  }
};

interface ModelDialogContentProps {
  model?: AiModel;
}

export default observer(function ModelDialogContent({ model }: ModelDialogContentProps) {
  const { t } = useTranslation()
  const aiSettingStore = RootStore.Get(AiSettingStore);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [editingModel, setEditingModel] = useState<Partial<AiModel>>(() => {
    if (model) {
      return { ...model };
    }
    return {
      id: 0,
      providerId: aiSettingStore.aiProviders.value?.[0]?.id || 0,
      title: '',
      modelKey: '',
      capabilities: {
        inference: true,
        tools: false,
        image: false,
        imageGeneration: false,
        video: false,
        audio: false,
        embedding: false,
        rerank: false
      },
      config: {
        embeddingDimensions: 0
      },
      sortOrder: 0
    };
  });

  const selectedProvider = aiSettingStore.aiProviders.value?.find(p => p.id === editingModel.providerId);

  const getProviderModels = (): ProviderModel[] => {
    if (!selectedProvider) return [];
    return aiSettingStore.getProviderModels(selectedProvider.id);
  };

  const fetchProviderModels = async () => {
    if (!selectedProvider) return;

    try {
      await aiSettingStore.fetchProviderModels.call(selectedProvider as any);
    } catch (error) {
      console.error('Failed to fetch provider models:', error);
    }
  };

  const handleModelSelect = (modelKey: string) => {
    const providerModels = getProviderModels();
    const providerModel = providerModels.find(m => m.id === modelKey);
    const defaultTemplate = DEFAULT_MODEL_TEMPLATES.find(t => modelKey.toLowerCase().includes(t.modelKey.toLowerCase()));

    if (providerModel) {
      // Use provider model data, but enhance with template capabilities if available
      const capabilities = defaultTemplate?.capabilities || aiSettingStore.inferModelCapabilities(modelKey);
      const config = defaultTemplate?.config || {};

      setEditingModel(prev => ({
        ...prev,
        modelKey: providerModel.id,
        title: providerModel.name,
        capabilities: capabilities as ModelCapabilities,
        config: {
          ...prev.config,
          ...config
        }
      }));
    } else {
      // Fallback for manual input
      const capabilities = defaultTemplate?.capabilities || aiSettingStore.inferModelCapabilities(modelKey);
      const title = defaultTemplate?.title || modelKey;
      const config = defaultTemplate?.config || {};

      setEditingModel(prev => ({
        ...prev,
        modelKey,
        title,
        capabilities: capabilities as ModelCapabilities,
        config: {
          ...prev.config,
          ...config
        }
      }));
    }
  };

  const handleManualModelKeyChange = (value: string) => {
    // Find matching template for the input value
    const defaultTemplate = DEFAULT_MODEL_TEMPLATES.find(t =>
      value.toLowerCase().includes(t.modelKey.toLowerCase())
    );

    const capabilities = defaultTemplate?.capabilities || aiSettingStore.inferModelCapabilities(value);
    const config = defaultTemplate?.config || {};

    setEditingModel(prev => ({
      ...prev,
      modelKey: value,
      capabilities: capabilities,
      config: config
    }));

    // Clear error message
    if (errors.modelKey) {
      setErrors(prev => ({ ...prev, modelKey: '' }));
    }
  };

  const getAllAvailableModels = () => {
    const providerModels = getProviderModels();
    return providerModels.map(m => ({ id: m.id, name: m.name, source: 'provider' as const }));
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!editingModel.providerId) {
      newErrors.providerId = 'Please select a provider';
    }

    if (!editingModel.title?.trim()) {
      newErrors.title = 'Model name is required';
    }

    if (!editingModel.modelKey?.trim()) {
      newErrors.modelKey = 'Model key is required';
    }


    const hasCapabilities = editingModel.capabilities &&
      Object.values(editingModel.capabilities).some(cap => cap === true);
    if (!hasCapabilities) {
      newErrors.capabilities = 'Please select at least one capability';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const testModelConnection = async () => {
    if (!editingModel.modelKey || !selectedProvider || !editingModel.capabilities) return;

    try {
      RootStore.Get(ToastPlugin).promise(
        api.ai.testConnect.mutate({
          providerId: selectedProvider.id,
          modelKey: editingModel.modelKey,
          capabilities: editingModel.capabilities
        }),
        {
          loading: t('loading'),
          success: (result: any) => {
            console.log(result);
            return formatTestResults(result, t);
          },
          error: (error: any) => {
            return `${t('check-connect-error')}: ${error.message}`;
          },
        }
      );
    } catch (error) {
      console.error('Test connection failed:', error);
    }
  };

  const handleSaveModel = async () => {
    if (!editingModel) return;

    if (!validateForm()) {
      return;
    }

    if (editingModel.id) {
      await aiSettingStore.updateModel.call(editingModel as any);
    } else {
      await aiSettingStore.createModel.call(editingModel as any);
    }
    RootStore.Get(DialogStore).close();

  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>Provider</Label>
        <Select
          value={editingModel.providerId ? String(editingModel.providerId) : ''}
          onValueChange={(value) => {
            setEditingModel(prev => ({ ...prev, providerId: Number(value) }));
            // Clear error message
            if (errors.providerId) {
              setErrors(prev => ({ ...prev, providerId: '' }));
            }
          }}
        >
          <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
          <SelectContent>
            {(aiSettingStore.aiProviders.value || []).map(provider => (
              <SelectItem
                key={provider.id}
                value={String(provider.id)}
              >
                <span className="flex items-center gap-2">
                  <ProviderIcon provider={provider.provider} className="w-4 h-4" />
                  {provider.title}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.providerId && <p className="text-xs text-destructive">{errors.providerId}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>{t('model-name')}</Label>
        <Input
          placeholder="Enter display name"
          value={editingModel.title || ''}
          onChange={(e) => {
            const value = e.target.value;
            setEditingModel(prev => ({ ...prev, title: value }));
            // Clear error message
            if (errors.title) {
              setErrors(prev => ({ ...prev, title: '' }));
            }
          }}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-semibold text-default-600">{t('model-selection')}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchProviderModels}
            disabled={!selectedProvider}
          >
            {aiSettingStore.fetchProviderModels.loading.value ? (
              <Icon icon="line-md:loading-twotone-loop" width="14" height="14" className="animate-spin" />
            ) : (
              <Icon icon="famicons:sync" width="14" height="14" />
            )}
            {t('refresh-model-list')}
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select
            value={editingModel.modelKey || ''}
            onValueChange={(key) => {
              if (key) {
                handleModelSelect(key);
                // Clear error message
                if (errors.modelKey) {
                  setErrors(prev => ({ ...prev, modelKey: '' }));
                }
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Select or enter model" /></SelectTrigger>
            <SelectContent>
              {getAllAvailableModels().map(model => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                >
                  <span className="flex items-center gap-2">
                    <ModelIcon modelName={model.id} className="w-4 h-4" />
                    {model.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Or enter a custom model key"
            value={editingModel.modelKey || ''}
            onChange={(e) => handleManualModelKeyChange(e.target.value)}
          />
          {errors.modelKey && <p className="text-xs text-destructive">{errors.modelKey}</p>}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-default-600">{t('model-capabilities')}</p>
          <p className="text-xs text-default-500 mt-1 flex items-center">
            <Icon icon="hugeicons:alert-circle" width="12" height="12" className="inline mr-1 text-warning" />
            <span>{t('model-cap-desc')}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-4 bg-default-50 rounded-lg">
          {Object.entries(CAPABILITY_LABELS).map(([key, label]) => {
            const isSelected = editingModel.capabilities?.[key as keyof ModelCapabilities] || false;
            return (
              <Badge
                key={key}
                variant={isSelected ? capabilityBadgeVariant(CAPABILITY_COLORS[key as keyof ModelCapabilities]) : 'outline'}
                className="cursor-pointer transition-all hover:scale-105 gap-1"
                onClick={() => {
                  setEditingModel(prev => ({
                    ...prev,
                    capabilities: {
                      ...prev.capabilities,
                      [key]: !isSelected
                    }
                  }));
                  // Clear error message
                  if (errors.capabilities) {
                    setErrors(prev => ({ ...prev, capabilities: '' }));
                  }
                }}
              >
                {CAPABILITY_ICONS[key as keyof ModelCapabilities]}
                {label}
              </Badge>
            );
          })}
        </div>
        {errors.capabilities && (
          <p className="text-sm text-destructive">{errors.capabilities}</p>
        )}

        {/* Audio capability warning */}
        {editingModel.capabilities?.audio && (
          <div className="mt-2 p-3 bg-warning-50 border border-warning-200 rounded-lg">
            <p className="text-sm text-warning-700">
              <Icon icon="hugeicons:alert-circle" width="14" height="14" className="inline mr-2" />
              Currently only OpenAI-compatible audio models are supported.
            </p>
          </div>
        )}
      </div>

      {/* Embedding Dimensions - Only show for embedding models */}
      {editingModel.capabilities?.embedding && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon icon="hugeicons:search-list-02" width="16" height="16" />
            <p className="text-sm font-semibold text-default-600">Embedding Dimensions</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex"><Icon icon="proicons:info" width="14" height="14" /></span>
              </TooltipTrigger>
              <TooltipContent>Specify the dimensions for this embedding model. Leave 0 for auto-detection.</TooltipContent>
            </Tooltip>
          </div>
          <div className="space-y-1.5">
            <Label>Dimensions</Label>
            <Input
              type="number"
              placeholder="0 (auto-detect)"
              value={String(editingModel.config?.embeddingDimensions || 0)}
              onChange={(e) => {
                const dimensions = parseInt(e.target.value) || 0;
                setEditingModel(prev => ({
                  ...prev,
                  config: {
                    ...prev.config,
                    embeddingDimensions: dimensions
                  }
                }));
              }}
            />
            <p className="text-xs text-muted-foreground">Common values: 384, 512, 768, 1024, 1536, 3072. Set to 0 for auto-detection.</p>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-6 border-t border-default-200">
        <Button
          variant='ghost'
          onClick={testModelConnection}
          disabled={!editingModel.modelKey || !selectedProvider}
        >
          <Icon icon="hugeicons:connect" width="16" height="16" />
          {t('test-connection')}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => RootStore.Get(DialogStore).close()}>
            Cancel
          </Button>
          <Button onClick={handleSaveModel}>
            {editingModel.id ? t('update') : t('create')}
          </Button>
        </div>
      </div>
    </div>
  );
});
