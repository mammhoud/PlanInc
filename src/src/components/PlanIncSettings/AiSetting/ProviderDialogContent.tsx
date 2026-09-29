import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { ProviderIcon } from '@/components/PlanIncSettings/AiSetting/AIIcon';
import { AiProvider, AiSettingStore } from '@/store/aiSettingStore';
import { PROVIDER_TEMPLATES } from './constants';
import { Copy } from '@/components/Common/Copy';

interface ProviderDialogContentProps {
  provider?: AiProvider;
}

// Steps indicator component
const StepsIndicator = ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => {
  return (
    <div className="flex items-center justify-center mb-8">
      {Array.from({ length: totalSteps }, (_, index) => (
        <div key={index} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${index + 1 <= currentStep
              ? 'bg-primary text-primary-foreground'
              : 'bg-default-100 text-default-500'
              }`}
          >
            {index + 1}
          </div>
          {index < totalSteps - 1 && (
            <div
              className={`w-12 h-0.5 mx-2 transition-all ${index + 1 < currentStep ? 'bg-primary' : 'bg-default-200'
                }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default observer(function ProviderDialogContent({ provider }: ProviderDialogContentProps) {
  const { t } = useTranslation();
  const aiSettingStore = RootStore.Get(AiSettingStore);
  const [currentStep, setCurrentStep] = useState(provider ? 2 : 1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(provider?.provider || '');

  const [editingProvider, setEditingProvider] = useState<Partial<AiProvider>>(() => {
    if (provider) {
      return { ...provider };
    }
    return {
      id: 0,
      title: '',
      provider: '',
      baseURL: '',
      apiKey: '',
      sortOrder: 0,
      models: []
    };
  });

  // Initialize editing mode if provider exists
  useEffect(() => {
    if (provider) {
      setCurrentStep(2);
      setSelectedTemplate(provider.provider);
    }
  }, [provider]);

  const handleTemplateSelect = (templateValue: string) => {
    if (templateValue === 'custom') {
      setSelectedTemplate('custom');
      setEditingProvider(prev => ({
        ...prev,
        provider: 'custom',
        title: 'Custom Provider',
        baseURL: 'https://api.example.com/v1'
      }));
    } else {
      const template = PROVIDER_TEMPLATES.find(t => t.value === templateValue);
      if (template) {
        setSelectedTemplate(templateValue);
        setEditingProvider(prev => ({
          ...prev,
          provider: template.value,
          title: template.defaultName,
          baseURL: template.defaultBaseURL
        }));
      }
    }
    setCurrentStep(2);
  };

  const handleSaveProvider = async () => {
    if (!editingProvider) return;

    if (editingProvider.id) {
      await aiSettingStore.updateProvider.call(editingProvider as any);
    } else {
      await aiSettingStore.createProvider.call(editingProvider as any);
    }
    RootStore.Get(DialogStore).close();
  };

  // Step 1: Provider Selection
  const renderProviderSelection = () => (
    <div className="space-y-6">
      {/* Custom Configuration Option */}
      <Card
        className="hover:bg-default-50 transition-colors cursor-pointer bg-secondbackground w-full"
        onClick={() => handleTemplateSelect('custom')}
      >
        <CardContent className="flex flex-row items-center gap-4 p-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center relative">
              <ProviderIcon provider="openai" className="w-6 h-6 text-primary" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                <Icon icon="hugeicons:settings-03" className="w-2.5 h-2.5 text-primary" />
              </div>
            </div>
          </div>
          <div className="flex-1">
            <h4 className="font-medium">{t('custom-configuration')}</h4>
            <p className="text-sm text-default-500">{t('configure-your-own-api-endpoint')}</p>
          </div>
          <Icon icon="hugeicons:arrow-right-02" className="w-5 h-5 text-default-400" />
        </CardContent>
      </Card>

      {/* Provider Templates */}
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PROVIDER_TEMPLATES.map((template) => {
            return (
              <Card
                key={template.value}
                className="hover:bg-default-50 transition-colors cursor-pointer bg-secondbackground"
                onClick={() => handleTemplateSelect(template.value)}
              >
                <CardContent className="flex flex-row items-center gap-3 p-4">
                  <div className="flex-shrink-0">
                    <ProviderIcon provider={template.value} className="w-8 h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-medium truncate">{template.label}</h5>
                    <p className="text-xs text-default-500 line-clamp-2">{template.description}</p>
                  </div>
                  <Icon icon="hugeicons:arrow-right-02" className="w-4 h-4 text-default-400" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Step 2: Configuration
  const renderConfiguration = () => {
    const template = PROVIDER_TEMPLATES.find(t => t.value === selectedTemplate);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-3 mb-6">
          <ProviderIcon provider={selectedTemplate} className="w-8 h-8" />
          <h3 className="text-lg font-semibold">
            {selectedTemplate === 'custom' ? t('custom-configuration') : template?.label}
          </h3>
        </div>

        <div className="space-y-1.5">
          <Label>{t('provider-name')}</Label>
          <Input
            placeholder={t('enter-provider-name')}
            value={editingProvider.title || ''}
            onChange={(e) => {
              setEditingProvider(prev => ({ ...prev, title: e.target.value }));
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('base-url')}</Label>
          <Input
            placeholder={t('enter-api-base-url')}
            value={editingProvider.baseURL || ''}
            onChange={(e) => {
              setEditingProvider(prev => ({ ...prev, baseURL: e.target.value }));
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('api-key')}</Label>
          <div className="relative">
            <Input
              placeholder={t('enter-api-key')}
              type="password"
              className="pr-10"
              value={editingProvider.apiKey || ''}
              onChange={(e) => {
                setEditingProvider(prev => ({ ...prev, apiKey: e.target.value }));
              }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2"><Copy size={20} content={editingProvider.apiKey ?? ''} /></span>
          </div>
        </div>

        {(editingProvider.provider === 'azure' || editingProvider.provider === 'azureopenai') && (
          <div className="space-y-1.5">
            <Label>{t('api-version')}</Label>
            <Input
              placeholder="Enter API version (e.g., 2024-02-01)"
              value={editingProvider.config?.apiVersion || ''}
              onChange={(e) => {
                const value = e.target.value;
                setEditingProvider(prev => ({
                  ...prev,
                  config: {
                    ...prev.config,
                    apiVersion: value
                  }
                }));
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full">
      {/* Steps Indicator */}
      <StepsIndicator currentStep={currentStep} totalSteps={2} />

      {/* Content */}
      <div className="min-h-[400px]">
        {currentStep === 1 && renderProviderSelection()}
        {currentStep === 2 && renderConfiguration()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-6 border-t border-default-200">
        <div>
          {currentStep > 1 && (
            <Button
              variant="ghost"
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              <Icon icon="hugeicons:arrow-left-02" width="16" height="16" />
              {t('back')}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {currentStep === 2 && (
            <Button onClick={handleSaveProvider}>
              {editingProvider.id ? t('update') : t('create')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
