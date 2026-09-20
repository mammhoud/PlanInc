import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { PlanIncStore } from '@/store/planincStore';
import { UserStore } from '@/store/user';
import ProviderCard from './ProviderCard';
import ProviderDialogContent from './ProviderDialogContent';
import { DefaultModelsSection } from './DefaultModelsSection';
import { GlobalPromptSection } from './GlobalPromptSection';
import { AiPostProcessingSection } from './AiPostProcessingSection';
import { AiToolsSection } from './AiToolsSection';
import { EmbeddingSettingsSection } from './EmbeddingSettingsSection';
import ModelDialogContent from './ModelDialogContent';
import { McpServersSection } from './McpServersSection';
import { AgentDirectorySetting } from '../AgentDirectorySetting';
import { AiSettingStore } from '@/store/aiSettingStore';
import { Copy } from '../../Common/Copy';
import { MarkdownRender } from '../../Common/MarkdownRender';
import { getPlanIncEndpoint } from '@/lib/planincEndpoint';


type McpTransportExample = 'streamable-http' | 'sse'

export default observer(function AiSetting() {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiSettingStore);
  const planinc = RootStore.Get(PlanIncStore);
  const user = RootStore.Get(UserStore);
  const [selectedTransport, setSelectedTransport] = useState<McpTransportExample>('streamable-http');
  const streamableHttpEndpoint = getPlanIncEndpoint('/mcp');
  const sseEndpoint = getPlanIncEndpoint('/sse');
  const selectedEndpoint = selectedTransport === 'streamable-http'
    ? streamableHttpEndpoint
    : sseEndpoint;
  const mcpClientConfig = JSON.stringify({
    mcpServers: {
      planinc: {
        url: selectedEndpoint,
        headers: {
          Authorization: `Bearer ${user.userInfo.value?.token || ''}`,
        },
      },
    },
  }, null, 2);

  useEffect(() => {
    planinc.config.call();
    aiStore.aiProviders.call();
  }, []);

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard icon="hugeicons:ai-magic" title="AI Providers & Models">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button
              className='ml-auto'
              onClick={() => {
                RootStore.Get(DialogStore).setData({
                  isOpen: true,
                  size: '2xl',
                  title: 'Add Provider',
                  content: <ProviderDialogContent />,
                });
              }}
            >
              <Icon icon="iconamoon:cloud-add-light" width="20" height="20" className="mr-2" />
              {t('add-provider')}
            </Button>
          </div>

          {aiStore.aiProviders.value?.map(provider => (
            <ProviderCard key={provider.id} provider={provider as any} />
          ))}
        </div>
      </CollapsibleCard>

      <DefaultModelsSection />

      <EmbeddingSettingsSection />


      <GlobalPromptSection />

      <AiPostProcessingSection />

      <AiToolsSection />

      <McpServersSection />

      <AgentDirectorySetting />

      <CollapsibleCard icon="hugeicons:api" title="MCP Integration">
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            {t('mcp-integration-desc', 'Model Context Protocol (MCP) integration allows AI assistants to connect to PlanInc and use its tools.')}
          </div>

          <div className="space-y-3">
            <div>
              <Label>Streamable HTTP Endpoint URL</Label>
              <div className="relative mt-1">
                <Input
                  value={streamableHttpEndpoint}
                  readOnly
                  className="pr-10"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Copy size={20} content={streamableHttpEndpoint} />
                </div>
              </div>
              <p className="mt-1 text-xs text-green-600">
                {t('mcp-streamable-http-recommended', 'Recommended for modern MCP clients.')}
              </p>
            </div>

            <div>
              <Label>Legacy SSE Endpoint URL</Label>
              <div className="relative mt-1">
                <Input
                  value={sseEndpoint}
                  readOnly
                  className="pr-10"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Copy size={20} content={sseEndpoint} />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('mcp-sse-legacy-desc', 'Use this only if your MCP client does not support Streamable HTTP yet.')}
              </p>
            </div>

            <div>
              <Label>Authorization Token</Label>
              <div className="relative mt-1">
                <Input
                  value={user.userInfo.value?.token || ''}
                  readOnly
                  type="password"
                  className="pr-10"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Copy size={20} content={user.userInfo.value?.token ?? ''} />
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <Label>MCP Client Configuration</Label>
                <Select
                  value={selectedTransport}
                  onValueChange={(value) => setSelectedTransport(value as McpTransportExample)}
                >
                  <SelectTrigger className="w-full sm:max-w-xs h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="streamable-http">Streamable HTTP (Recommended)</SelectItem>
                    <SelectItem value="sse">SSE (Legacy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Copy size={20} content={mcpClientConfig} className="absolute top-4 right-2 z-10" />
                <MarkdownRender content={`\`\`\`json
${mcpClientConfig}
\`\`\``} />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleCard>
    </div>
  );
});
