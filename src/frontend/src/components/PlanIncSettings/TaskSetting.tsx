import { observer } from "mobx-react-lite";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";
import { PromiseCall } from "@/store/standard/PromiseState";
import { helper } from "@/lib/helper";
import dayjs from "@/lib/dayjs";
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from "@/lib/trpc";
import { Item } from "./Item";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { _ } from "@/lib/lodash";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { downloadFromLink } from '@/lib/tauriHelper';
import { getPlanIncEndpoint } from '@/lib/planincEndpoint';
import { PromiseState } from "@/store/standard/PromiseState";
import { Loader2 } from "lucide-react";

const UpdateDebounceCall = _.debounce((v) => {
  return PromiseCall(api.config.update.mutate({ key: 'autoArchivedDays', value: Number(v) }))
}, 500)

export const TaskSetting = observer(() => {
  const planinc = RootStore.Get(PlanIncStore)
  const [autoArchivedDays, setAutoArchivedDays] = useState("90")
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (planinc.config.value?.autoArchivedDays) {
      setAutoArchivedDays(String(planinc.config.value?.autoArchivedDays))
    }
  }, [planinc.config.value?.autoArchivedDays])

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (polling) {
      timer = setInterval(() => {
        planinc.task.call();
      }, 1000);
    }
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [polling]);

  const { t } = useTranslation()
  return (
    <CollapsibleCard
      icon="tabler:clock"
      title={t('schedule-task')}
    >
      {/* TODO: Temporarily disabled backup database feature
      <Item
        leftContent={<>{t('schedule-back-up')}</>}
        rightContent={
          <Switch
            thumbIcon={planinc.updateDBTask.loading.value ? <Icon icon="eos-icons:three-dots-loading" width="24" height="24" /> : null}
            isDisabled={planinc.updateDBTask.loading.value}
            isSelected={planinc.DBTask?.isRunning}
            onChange={async e => {
              setPolling(true);
              await planinc.updateDBTask.call(e.target.checked);
              setPolling(false);
            }}
          />} />
      */}
      <Item
        leftContent={<>{t('schedule-archive-planinc')}</>}
        rightContent={
          <div className="flex gap-4">
            <div className="relative w-[120px]">
              <Input
                value={autoArchivedDays}
                onChange={e => {
                  setAutoArchivedDays(e.target.value)
                  UpdateDebounceCall(e.target.value)
                }}
                type="number"
                min={1}
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                {t('days')}
              </span>
            </div>
            <Switch
              disabled={planinc.updateArchiveTask.loading.value}
              checked={planinc.ArchiveTask?.isRunning}
              onCheckedChange={async (checked) => {
                await planinc.updateArchiveTask.call(checked)
              }}
            />
          </div>} />
      <AITasksPanel />
    </CollapsibleCard>
  );
})

const AITasksPanel = observer(() => {
  const { t } = useTranslation()
  const [aiTasks, setAiTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadTasks = async () => {
    setLoading(true)
    try {
      const tasks = await api.aiTask.list.query()
      setAiTasks(tasks)
    } catch (e) {
      console.error('Failed to load AI tasks:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const handleToggle = async (taskId: number, enabled: boolean) => {
    await PromiseCall(api.aiTask.toggle.mutate({ id: taskId, enabled }))
    loadTasks()
  }

  const handleDelete = async (taskId: number) => {
    await PromiseCall(api.aiTask.delete.mutate({ id: taskId }))
    loadTasks()
  }

  const handleRunNow = async (taskId: number) => {
    await PromiseCall(api.aiTask.runNow.mutate({ id: taskId }))
    loadTasks()
  }

  if (loading && aiTasks.length === 0) {
    return <div className="flex justify-center py-4">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  }

  if (aiTasks.length === 0) {
    return <div className="text-center py-4 text-muted-foreground text-sm">
      <Icon icon="mdi:robot-outline" width="32" height="32" className="mx-auto mb-2 opacity-50" />
      <p>{t('no-ai-tasks')}</p>
      <p className="text-xs mt-1">{t('ai-task-hint')}</p>
    </div>
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon icon="mdi:robot" width="20" height="20" />
        <span className="font-medium">{t('ai-scheduled-tasks')}</span>
        <Badge variant="secondary" className="text-xs">{aiTasks.length}</Badge>
      </div>
      <div className="border rounded-lg mb-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-2 font-medium">{t('name-db')}</th>
              <th className="text-left p-2 font-medium">{t('schedule')}</th>
              <th className="text-left p-2 font-medium">{t('last-run')}</th>
              <th className="text-left p-2 font-medium">{t('status')}</th>
              <th className="text-left p-2 font-medium">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {aiTasks.map(task => (
              <tr key={task.id} className="border-b last:border-b-0">
                <td className="p-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">{task.name}</span>
                    </TooltipTrigger>
                    <TooltipContent>{task.prompt}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="p-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {task.schedule}
                  </code>
                </td>
                <td className="p-2">
                  {task.lastRun ? dayjs(task.lastRun).fromNow() : '-'}
                </td>
                <td className="p-2">
                  <div className={`${task.isEnabled ? 'text-green-500' : 'text-gray-400'} flex items-center`}>
                    <Icon icon="bi:dot" width="24" height="24" />
                    <span>{task.isEnabled ? t('enabled') : t('disabled')}</span>
                  </div>
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleToggle(task.id, !task.isEnabled)}
                        >
                          <Icon 
                            icon={task.isEnabled ? "mdi:pause" : "mdi:play"} 
                            width="18" 
                            height="18" 
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{task.isEnabled ? t('disable') : t('enable')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleRunNow(task.id)}
                        >
                          <Icon icon="mdi:lightning-bolt" width="18" height="18" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('run-now')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Icon icon="mdi:delete-outline" width="18" height="18" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('delete')}</TooltipContent>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})

const TasksPanel = observer(() => {
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore)
  return <> {planinc.task.value && <div className="border rounded-lg mb-2">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="text-left p-2 font-medium">{t('name-db')}</th>
          <th className="text-left p-2 font-medium">{t('schedule')}</th>
          <th className="text-left p-2 font-medium">{t('last-run')}</th>
          <th className="text-left p-2 font-medium">{t('backup-file')}</th>
          <th className="text-left p-2 font-medium">{t('status')}</th>
        </tr>
      </thead>
      <tbody>
        {
          planinc.task.value!.filter(i => i.name != 'rebuildEmbedding').map(i => {
            const progress = i.output?.progress;
            return <tr key={i.name} className="border-b last:border-b-0">
              <td className="p-2">{t(`task-name-${i.name}`)}</td>
              <td className="p-2">
                <Select
                  value={i.schedule}
                  onValueChange={async (value) => {
                    await PromiseCall(api.task.upsertTask.mutate({
                      time: value,
                      type: 'update',
                      task: i.name as any
                    }))
                    planinc.task.call()
                  }}
                >
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {helper.cron.cornTimeList.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {t(item.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="p-2">{dayjs(i?.lastRun).fromNow()}</td>
              <td className="p-2">
                <div className="flex items-center gap-1">
                  {
                    i.output?.filePath && <>
                      {/* @ts-ignore  */}
                      {i.output?.filePath}
                      {/* @ts-ignore  */}
                      <Icon className='cursor-pointer' onClick={e => downloadFromLink(getPlanIncEndpoint(i?.output?.filePath))} icon="tabler:download" width="24" height="24" />
                    </>
                  }
                  {progress && !i.output?.filePath && (
                    <div className="w-full max-w-[200px]">
                      <Progress
                        value={progress.percent}
                        className="max-w-md h-4"
                      />
                      <div className="text-xs text-gray-500">
                        {`${(progress.processedBytes / (1024 * 1024)).toFixed(2)} MB`}
                      </div>
                    </div>
                  )}
                </div>
              </td>
              <td className="p-2">
                <div className={`${i?.isRunning ? 'text-green-500' : 'text-red-500'} flex items-center `}>
                  <Icon icon="bi:dot" width="24" height="24" />
                  <div className="min-w-[50px]">
                    {i?.isRunning ? (
                      progress ? `${t('running')}` : t('running')
                    ) : t('stopped')}
                  </div>
                </div>
              </td>
            </tr>
          })
        }
      </tbody>
    </table>
  </div>
  } </>
})
