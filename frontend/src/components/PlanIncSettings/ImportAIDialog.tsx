import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { AiSettingStore } from '@/store/aiSettingStore';
import { DEFAULT_MODEL_TEMPLATES } from './AiSetting/constants';
import { Loader2 } from 'lucide-react';

interface AIConfig {
    baseUrl?: string;
    apiKey?: string;
    llmModel?: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
}

export const ImportAIDialog = observer(({ onSelectTab }: { onSelectTab?: (tab: string) => void } = {}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const planinc = RootStore.Get(PlanIncStore);
    const toast = RootStore.Get(ToastPlugin);
    const { t } = useTranslation();

    useEffect(() => {
        const encodedConfig = searchParams.get('v');
        if (encodedConfig) {
            try {
                const decodedConfig = JSON.parse(atob(encodedConfig));
                setAiConfig(decodedConfig);
                setIsOpen(true);

                if (onSelectTab) {
                    onSelectTab('ai');
                }
            } catch (error) {
                console.error('Failed to parse AI config:', error);
            }
        }
    }, [searchParams, onSelectTab]);

    const handleConfirm = async () => {
        if (!aiConfig) return;
        console.log(aiConfig);
        if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.llmModel || !aiConfig.embeddingModel || !aiConfig.embeddingDimensions) {
            toast.error(t('incomplete-ai-configuration'));
            return;
        }

        try {
            setIsLoading(true);
            const aiSettingStore = RootStore.Get(AiSettingStore);

            // Create OpenAI provider
            await aiSettingStore.createProvider.call({
                title: 'Imported OpenAI Provider',
                provider: 'openai',
                baseURL: aiConfig.baseUrl,
                apiKey: aiConfig.apiKey,
                config: {},
                sortOrder: 0
            });

            // Refresh providers to get the newly created one
            await aiSettingStore.aiProviders.call();
            const createdProvider = aiSettingStore.aiProviders.value?.find(p =>
                p.provider === 'openai' && p.baseURL === aiConfig.baseUrl
            );

            if (!createdProvider) {
                throw new Error('Failed to create provider');
            }

            // Create inference model
            const inferenceTemplate = DEFAULT_MODEL_TEMPLATES.find(t =>
                t.modelKey.toLowerCase() === aiConfig.llmModel?.toLowerCase()
            );
            const inferenceCapabilities = {
                inference: true,
                tools: false,
                image: false,
                imageGeneration: false,
                video: false,
                audio: false,
                embedding: false,
                rerank: false,
                ...inferenceTemplate?.capabilities
            };

            await aiSettingStore.createModel.call({
                title: aiConfig.llmModel,
                modelKey: aiConfig.llmModel,
                providerId: createdProvider.id,
                capabilities: inferenceCapabilities,
                config: {},
                sortOrder: 0
            });

            // Create embedding model
            const embeddingTemplate = DEFAULT_MODEL_TEMPLATES.find(t =>
                t.modelKey.toLowerCase() === aiConfig.embeddingModel?.toLowerCase()
            );
            const embeddingCapabilities = {
                inference: false,
                tools: false,
                image: false,
                imageGeneration: false,
                video: false,
                audio: false,
                embedding: true,
                rerank: false,
                ...embeddingTemplate?.capabilities
            };

            await aiSettingStore.createModel.call({
                title: aiConfig.embeddingModel,
                modelKey: aiConfig.embeddingModel,
                providerId: createdProvider.id,
                capabilities: embeddingCapabilities,
                config: { embeddingDimensions: aiConfig.embeddingDimensions },
                sortOrder: 1
            });

            // Refresh models
            await aiSettingStore.allModels.call();

            // Set the created models as default
            const createdModels = aiSettingStore.allModels.value?.filter(m => m.providerId === createdProvider.id);
            const inferenceModel = createdModels?.find(m => m.capabilities.inference);
            const embeddingModel = createdModels?.find(m => m.capabilities.embedding);

            if (inferenceModel) {
                await api.config.update.mutate({
                    key: 'mainModelId',
                    value: inferenceModel.id,
                });
            }

            if (embeddingModel) {
                await api.config.update.mutate({
                    key: 'embeddingModelId',
                    value: embeddingModel.id,
                });
            }

            toast.success(t('operation-success'));
            searchParams.delete('v');
            setSearchParams(searchParams);
            setIsOpen(false);
        } catch (error) {
            console.error('Failed to import AI config:', error);
            toast.error(t('operation-failed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        searchParams.delete('v');
        setSearchParams(searchParams);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <Icon icon="hugeicons:ai-beautify" className="text-primary" width={24} height={24} />
                        <DialogTitle>{t('import-ai-configuration')}</DialogTitle>
                    </div>
                </DialogHeader>
                <div className="py-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Icon icon="fluent:info-24-filled" className="text-primary" width={20} height={20} />
                            <p className="text-base">{t('detected-ai-configuration-to-import')}</p>
                        </div>
                        
                        {aiConfig && (
                            <div className="bg-muted border p-4 rounded-xl">
                                {aiConfig.baseUrl && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-muted-foreground">{t('api-endpoint')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-muted rounded-md">{aiConfig.baseUrl}</span>
                                    </div>
                                )}
                                {aiConfig.apiKey && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-muted-foreground">API Key:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-muted rounded-md">{'•'.repeat(16)}</span>
                                    </div>
                                )}
                                {aiConfig.llmModel && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-muted-foreground">{t('model')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-muted rounded-md">{aiConfig.llmModel}</span>
                                    </div>
                                )}
                                {aiConfig.embeddingModel && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-muted-foreground">{t('embedding-model')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-muted rounded-md">{aiConfig.embeddingModel}</span>
                                    </div>
                                )}
                                {aiConfig.embeddingDimensions && (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-muted-foreground">{t('embedding-dimensions')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-muted rounded-md">{aiConfig.embeddingDimensions}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        <div className="flex items-center gap-2 mt-2">
                            <Icon icon="mdi:help-circle-outline" className="text-amber-500" width={20} height={20} />
                            <p className="text-base">{t('would-you-like-to-import-this-configuration')}</p>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button 
                        variant="secondary" 
                        onClick={handleCancel} 
                        className="px-6"
                        disabled={isLoading}
                    >
                        {t('cancel')}
                    </Button>
                    <Button 
                        onClick={handleConfirm} 
                        className="px-6"
                        disabled={isLoading}
                    >
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {!isLoading && <Icon icon="material-symbols:download" width={18} height={18} className="mr-2" />}
                        {isLoading ? t('importing') : t('import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
