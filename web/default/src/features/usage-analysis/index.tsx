/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { Brain, Eye, ListTodo, RefreshCw, Search, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import dayjs from '@/lib/dayjs'
import { formatNumber, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  DataTableColumnHeader,
  DataTablePage,
  DataTableRow,
  useDataTable,
} from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  createPromptLogAnalysis,
  getPromptLogAnalysisPrompt,
  getPromptLogAnalysisTask,
  getPromptLogAnalysisTasks,
  getPromptLogContent,
  getPromptLogs,
  resetPromptLogAnalysisPrompt,
  retryPromptLogAnalysisTask,
  updatePromptLogAnalysisPrompt,
} from './api'
import type {
  PageData,
  PromptLog,
  PromptLogAnalysisStatus,
  PromptLogAnalysisTask,
  PromptLogContent,
} from './types'

const route = getRouteApi('/_authenticated/usage-analysis/')

const DEFAULT_PROMPT_LOGS: PageData<PromptLog> = {
  page: 1,
  page_size: 20,
  total: 0,
  items: [],
}

const DEFAULT_ANALYSIS_TASKS: PageData<PromptLogAnalysisTask> = {
  page: 1,
  page_size: 20,
  total: 0,
  items: [],
}

const analysisStatusMeta: Record<
  PromptLogAnalysisStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  queued: { label: 'Queued', variant: 'outline' },
  running: { label: 'Running', variant: 'secondary' },
  succeeded: { label: 'Succeeded', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
}

function toDateValue(timestamp?: number): Date | undefined {
  return timestamp ? new Date(timestamp * 1000) : undefined
}

function toTimestamp(date?: Date): number | undefined {
  if (!date) return undefined
  if (Number.isNaN(date.getTime())) return undefined
  return Math.floor(date.getTime() / 1000)
}

function isInvalidTimeRange(start?: Date, end?: Date): boolean {
  return Boolean(start && end && start.getTime() > end.getTime())
}

function PromptDetailDialog({
  promptLog,
  open,
  onOpenChange,
}: {
  promptLog: PromptLog | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['prompt-log-content', promptLog?.id],
    queryFn: async () => {
      if (!promptLog) return null
      const result = await getPromptLogContent(promptLog.id)
      if (!result.success) {
        toast.error(result.message || '加载提示词详情失败')
        return null
      }
      return result.data ?? null
    },
    enabled: open && Boolean(promptLog?.id),
  })
  const content = data as PromptLogContent | null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[86vh] gap-3 sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>提示词详情</DialogTitle>
          <DialogDescription>
            {promptLog
              ? `日志 ID: ${promptLog.id} · 请求 ID: ${promptLog.request_id || '-'}`
              : '提示词日志内容'}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          readOnly
          value={
            isLoading
              ? '加载中...'
              : content?.content_text || '未找到提示词内容。'
          }
          className='min-h-[360px] resize-none font-mono text-xs leading-relaxed'
        />
      </DialogContent>
    </Dialog>
  )
}

function AnalysisPromptDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['prompt-log-analysis-prompt'],
    queryFn: async () => {
      const result = await getPromptLogAnalysisPrompt()
      if (!result.success) {
        toast.error(result.message || t('Failed to load analysis prompt'))
        return null
      }
      return result.data ?? null
    },
    enabled: open,
  })

  useEffect(() => {
    if (open && data?.prompt) setPrompt(data.prompt)
  }, [data?.prompt, open])

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await updatePromptLogAnalysisPrompt(prompt)
      if (!result.success) {
        toast.error(result.message || t('Failed to save analysis prompt'))
        return
      }
      toast.success(t('Analysis prompt saved'))
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      const result = await resetPromptLogAnalysisPrompt()
      if (!result.success) {
        toast.error(result.message || t('Failed to reset analysis prompt'))
        return
      }
      setPrompt(result.data?.prompt || '')
      await refetch()
      toast.success(t('Analysis prompt reset'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[86vh] gap-3 sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{t('Analysis Prompt')}</DialogTitle>
          <DialogDescription>
            {t('Template variables: username, user_id, start_time, end_time, log_count, prompt_logs')}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={isLoading ? t('Loading...') : prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className='min-h-[420px] resize-none font-mono text-xs leading-relaxed'
        />
        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={handleReset} disabled={saving}>
            <RefreshCw />
            {t('Restore Default')}
          </Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            {t('Save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AnalysisResultDialog({
  task,
  open,
  onOpenChange,
}: {
  task: PromptLogAnalysisTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['prompt-log-analysis-task', task?.id],
    queryFn: async () => {
      if (!task) return null
      const result = await getPromptLogAnalysisTask(task.id)
      if (!result.success) {
        toast.error(result.message || t('Failed to load analysis result'))
        return null
      }
      return result.data ?? null
    },
    enabled: open && Boolean(task?.id),
  })
  const detail = data || task

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[86vh] gap-3 sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{t('Analysis Result')}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${t('User')}: ${detail.username || '-'} · ${t('Start Time')}: ${formatTimestampToDate(detail.start_time)} · ${t('End Time')}: ${formatTimestampToDate(detail.end_time)} · ${t('Logs')}: ${detail.prompt_log_count || 0}`
              : t('Analysis task detail')}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          readOnly
          value={
            isLoading
              ? t('Loading...')
              : detail?.analysis_result ||
                detail?.error_message ||
                t('No analysis result found.')
          }
          className='min-h-[420px] resize-none text-sm leading-relaxed whitespace-pre-wrap'
        />
      </DialogContent>
    </Dialog>
  )
}

export function UsageAnalysis() {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const searchParams = route.useSearch()
  const navigate = route.useNavigate()
  const [selectedLog, setSelectedLog] = useState<PromptLog | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [analysisPromptOpen, setAnalysisPromptOpen] = useState(false)
  const [analysisQueueOpen, setAnalysisQueueOpen] = useState(false)
  const [analysisResultOpen, setAnalysisResultOpen] = useState(false)
  const [selectedAnalysisTask, setSelectedAnalysisTask] =
    useState<PromptLogAnalysisTask | null>(null)
  const [submittingAnalysis, setSubmittingAnalysis] = useState(false)
  const [userFilter, setUserFilter] = useState(searchParams.user ?? '')
  const [startTimeFilter, setStartTimeFilter] = useState<Date | undefined>(
    toDateValue(searchParams.startTime)
  )
  const [endTimeFilter, setEndTimeFilter] = useState<Date | undefined>(
    toDateValue(searchParams.endTime)
  )

  useEffect(() => {
    setUserFilter(searchParams.user ?? '')
    setStartTimeFilter(toDateValue(searchParams.startTime))
    setEndTimeFilter(toDateValue(searchParams.endTime))
  }, [searchParams.endTime, searchParams.startTime, searchParams.user])

  const {
    pagination,
    onPaginationChange,
    columnFilters,
    onColumnFiltersChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: searchParams,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 20 : 100 },
    globalFilter: { enabled: false },
  })

  const handleSearch = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (isInvalidTimeRange(startTimeFilter, endTimeFilter)) {
      toast.error(t('Start time cannot be later than end time'))
      return
    }
    navigate({
      search: (prev) => ({
        ...prev,
        page: undefined,
        user: userFilter.trim() || undefined,
        startTime: toTimestamp(startTimeFilter),
        endTime: toTimestamp(endTimeFilter),
      }),
    })
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'prompt-logs',
      pagination.pageIndex + 1,
      pagination.pageSize,
      searchParams.user,
      searchParams.startTime,
      searchParams.endTime,
    ],
    queryFn: async () => {
      const result = await getPromptLogs({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        user: searchParams.user,
        start_time: searchParams.startTime,
        end_time: searchParams.endTime,
      })
      if (!result.success) {
        toast.error(result.message || t('Failed to load logs'))
        return DEFAULT_PROMPT_LOGS
      }
      return result.data || DEFAULT_PROMPT_LOGS
    },
    placeholderData: (previousData) => previousData,
  })

  const {
    data: analysisTasks,
    isFetching: isFetchingAnalysisTasks,
    refetch: refetchAnalysisTasks,
  } = useQuery({
    queryKey: ['prompt-log-analysis-tasks'],
    queryFn: async () => {
      const result = await getPromptLogAnalysisTasks({
        p: 1,
        page_size: 20,
      })
      if (!result.success) {
        toast.error(result.message || t('Failed to load analysis tasks'))
        return DEFAULT_ANALYSIS_TASKS
      }
      return result.data || DEFAULT_ANALYSIS_TASKS
    },
    refetchInterval: 10000,
  })

  const handleCreateAnalysis = async () => {
    const user = userFilter.trim()
    if (!user) {
      toast.error(t('Please filter to exactly one user before submitting analysis'))
      return
    }
    if (isInvalidTimeRange(startTimeFilter, endTimeFilter)) {
      toast.error(t('Start time cannot be later than end time'))
      return
    }
    setSubmittingAnalysis(true)
    try {
      const result = await createPromptLogAnalysis({
        user,
        start_time: toTimestamp(startTimeFilter),
        end_time: toTimestamp(endTimeFilter),
      })
      if (!result.success) {
        toast.error(result.message || t('Failed to submit analysis task'))
        return
      }
      toast.success(t('Analysis task queued'))
      await refetchAnalysisTasks()
    } finally {
      setSubmittingAnalysis(false)
    }
  }

  const handleRetryAnalysisTask = async (task: PromptLogAnalysisTask) => {
    const result = await retryPromptLogAnalysisTask(task.id)
    if (!result.success) {
      toast.error(result.message || t('Failed to retry analysis task'))
      return
    }
    toast.success(t('Analysis task queued'))
    await refetchAnalysisTasks()
  }

  const renderAnalysisTasksTable = () => (
    <div className='overflow-x-auto'>
      <table className='w-full text-sm'>
        <thead className='text-muted-foreground border-b text-xs'>
          <tr>
            <th className='px-3 py-2 text-left font-medium'>{t('User')}</th>
            <th className='px-3 py-2 text-left font-medium'>
              {t('Time Range')}
            </th>
            <th className='px-3 py-2 text-left font-medium'>{t('Status')}</th>
            <th className='px-3 py-2 text-left font-medium'>{t('Logs')}</th>
            <th className='px-3 py-2 text-left font-medium'>
              {t('Created Time')}
            </th>
            <th className='px-3 py-2 text-left font-medium'>
              {t('Finished Time')}
            </th>
            <th className='px-3 py-2 text-left font-medium'>{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {(analysisTasks?.items ?? []).map((task) => {
            const meta = analysisStatusMeta[task.status]
            return (
              <tr key={task.id} className='border-b last:border-b-0'>
                <td className='px-3 py-2'>
                  <div className='font-medium'>{task.username || '-'}</div>
                  <div className='text-muted-foreground text-xs tabular-nums'>
                    ID: {task.user_id || '-'}
                  </div>
                </td>
                <td className='px-3 py-2 whitespace-nowrap tabular-nums'>
                  {formatTimestampToDate(task.start_time)} -{' '}
                  {formatTimestampToDate(task.end_time)}
                </td>
                <td className='px-3 py-2'>
                  <div className='flex flex-col items-start gap-1'>
                    <Badge variant={meta.variant}>{t(meta.label)}</Badge>
                    {task.status === 'succeeded' && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => {
                          setSelectedAnalysisTask(task)
                          setAnalysisResultOpen(true)
                        }}
                      >
                        <Eye />
                        {t('View Conclusion')}
                      </Button>
                    )}
                    {task.status === 'failed' && (
                      <div className='flex items-center gap-1'>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => {
                            setSelectedAnalysisTask(task)
                            setAnalysisResultOpen(true)
                          }}
                        >
                          <Eye />
                          {t('Failure Reason')}
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => handleRetryAnalysisTask(task)}
                        >
                          <RefreshCw />
                          {t('Retry')}
                        </Button>
                      </div>
                    )}
                  </div>
                </td>
                <td className='px-3 py-2 tabular-nums'>
                  {task.prompt_log_count || '-'}
                </td>
                <td className='px-3 py-2 whitespace-nowrap tabular-nums'>
                  {formatTimestampToDate(task.created_at)}
                </td>
                <td className='px-3 py-2 whitespace-nowrap tabular-nums'>
                  {task.finished_at
                    ? formatTimestampToDate(task.finished_at)
                    : '-'}
                </td>
                <td className='px-3 py-2'>
                  <div className='flex items-center gap-1'>
                    {task.status === 'succeeded' && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => {
                          setSelectedAnalysisTask(task)
                          setAnalysisResultOpen(true)
                        }}
                      >
                        <Eye />
                        {t('View Conclusion')}
                      </Button>
                    )}
                    {task.status === 'failed' && (
                      <>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => {
                            setSelectedAnalysisTask(task)
                            setAnalysisResultOpen(true)
                          }}
                        >
                          <Eye />
                          {t('Failure Reason')}
                        </Button>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => handleRetryAnalysisTask(task)}
                        >
                          <RefreshCw />
                          {t('Retry')}
                        </Button>
                      </>
                    )}
                    {task.status !== 'succeeded' && task.status !== 'failed' && (
                      <span className='text-muted-foreground text-xs'>-</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {(analysisTasks?.items ?? []).length === 0 && (
            <tr>
              <td
                colSpan={7}
                className='text-muted-foreground px-3 py-8 text-center'
              >
                {t('No analysis tasks found.')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  const columns = useMemo<ColumnDef<PromptLog>[]>(
    () => [
      {
        accessorKey: 'id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='ID' />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground tabular-nums'>
            {row.original.id}
          </span>
        ),
        enableSorting: false,
        size: 72,
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='创建时间' />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap tabular-nums'>
            {formatTimestampToDate(row.original.created_at)}
          </span>
        ),
        enableSorting: false,
        size: 170,
      },
      {
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='用户' />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='truncate font-medium'>
              {row.original.username || '-'}
            </div>
            <div className='text-muted-foreground text-xs tabular-nums'>
              用户 ID: {row.original.user_id || '-'}
            </div>
          </div>
        ),
        enableSorting: false,
        size: 160,
      },
      {
        accessorKey: 'model_name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='模型' />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col gap-1'>
            <span className='truncate'>{row.original.model_name || '-'}</span>
            <Badge variant='outline' className='w-fit max-w-full truncate'>
              {row.original.relay_format || '-'}
            </Badge>
          </div>
        ),
        enableSorting: false,
        size: 190,
      },
      {
        accessorKey: 'content_preview',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='提示词预览' />
        ),
        cell: ({ row }) => (
          <div className='line-clamp-2 max-w-[520px] text-sm whitespace-pre-wrap'>
            {row.original.content_preview || '-'}
          </div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'content_bytes',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='大小' />
        ),
        cell: ({ row }) => (
          <div className='flex items-center gap-2 whitespace-nowrap'>
            <span className='tabular-nums'>
              {formatNumber(row.original.content_bytes)} B
            </span>
            {row.original.truncated && (
              <Badge variant='secondary'>已截断</Badge>
            )}
          </div>
        ),
        enableSorting: false,
        size: 150,
      },
      {
        accessorKey: 'request_id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='请求 ID' />
        ),
        cell: ({ row }) => (
          <span className='text-muted-foreground block max-w-[180px] truncate font-mono text-xs'>
            {row.original.request_id || '-'}
          </span>
        ),
        enableSorting: false,
        size: 180,
      },
      {
        id: 'actions',
        header: () => <span>操作</span>,
        cell: ({ row }) => (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label='详情'
                    onClick={() => {
                      setSelectedLog(row.original)
                      setDetailOpen(true)
                    }}
                  />
                }
              >
                <Eye />
              </TooltipTrigger>
              <TooltipContent>详情</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
        enableSorting: false,
        size: 80,
      },
    ],
    []
  )

  const { table } = useDataTable({
    data: data?.items ?? [],
    columns: columns as ColumnDef<PromptLog, unknown>[],
    columnFilters,
    pagination,
    enableRowSelection: false,
    onPaginationChange,
    onColumnFiltersChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  const isLoadingData = isLoading || (isFetching && !data)

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>使用分析</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <form
            onSubmit={handleSearch}
            className='bg-card mb-3 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end'
          >
            <div className='min-w-0 flex-1 space-y-1.5'>
              <div className='text-muted-foreground text-xs'>{t('User')}</div>
              <Input
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
                placeholder={t('Username or user ID')}
                className='h-8'
              />
            </div>
            <div className='grid min-w-0 flex-[2] gap-2 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <div className='text-muted-foreground text-xs'>
                  {t('Start Time')}
                </div>
                <DateTimePicker
                  value={startTimeFilter}
                  onChange={setStartTimeFilter}
                  placeholder={t('Select start time')}
                  className='[&_button]:h-8 [&_input]:h-8'
                />
              </div>
              <div className='space-y-1.5'>
                <div className='text-muted-foreground text-xs'>
                  {t('End Time')}
                </div>
                <DateTimePicker
                  value={endTimeFilter}
                  placeholder={t('Select end time')}
                  onChange={setEndTimeFilter}
                  className='[&_button]:h-8 [&_input]:h-8'
                />
              </div>
            </div>
            <Button type='submit' className='h-8 gap-2 px-3'>
              <Search />
              {t('Search')}
            </Button>
            <Button
              type='button'
              variant='secondary'
              className='h-8 gap-2 px-3'
              disabled={submittingAnalysis}
              onClick={handleCreateAnalysis}
            >
              <Brain />
              {t('Analyze')}
            </Button>
            <Button
              type='button'
              variant='outline'
              className='h-8 gap-2 px-3'
              onClick={async () => {
                await refetchAnalysisTasks()
                setAnalysisQueueOpen(true)
              }}
            >
              <ListTodo />
              {t('Analysis Queue')}
            </Button>
            <Button
              type='button'
              variant='outline'
              className='h-8 gap-2 px-3'
              onClick={() => setAnalysisPromptOpen(true)}
            >
              <Settings />
              {t('Analysis Prompt')}
            </Button>
          </form>
          <DataTablePage
            table={table}
            columns={columns as ColumnDef<PromptLog, unknown>[]}
            isLoading={isLoadingData}
            isFetching={isFetching}
            emptyTitle='未找到提示词日志'
            emptyDescription='启用提示词日志并产生 API 请求后，提示词日志会显示在这里。'
            skeletonKeyPrefix='prompt-log-skeleton'
            applyHeaderSize
            tableClassName={cn(
              '[&_[data-slot=table]]:text-[13px] [&_[data-slot=table]_td]:text-[13px] [&_[data-slot=table]_th]:text-[13px]'
            )}
            renderRow={(row) => (
              <DataTableRow
                key={row.id}
                row={row}
                className='transition-colors'
              />
            )}
          />
          <div className='bg-card mt-4 rounded-lg border'>
            <div className='flex items-center justify-between gap-2 border-b px-3 py-2'>
              <div>
                <div className='text-sm font-medium'>
                  {t('Analysis Tasks')}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t('Queued and completed prompt log analysis tasks')}
                </div>
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={() => refetchAnalysisTasks()}
                disabled={isFetchingAnalysisTasks}
              >
                <RefreshCw />
                {t('Refresh')}
              </Button>
            </div>
            {renderAnalysisTasksTable()}
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <PromptDetailDialog
        promptLog={selectedLog}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <Dialog open={analysisQueueOpen} onOpenChange={setAnalysisQueueOpen}>
        <DialogContent className='max-h-[86vh] gap-3 sm:max-w-6xl'>
          <DialogHeader>
            <DialogTitle>{t('Analysis Queue')}</DialogTitle>
            <DialogDescription>
              {t('Queued and completed prompt log analysis tasks')}
            </DialogDescription>
          </DialogHeader>
          <div className='flex justify-end'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetchAnalysisTasks()}
              disabled={isFetchingAnalysisTasks}
            >
              <RefreshCw />
              {t('Refresh')}
            </Button>
          </div>
          <div className='max-h-[58vh] overflow-auto rounded-lg border'>
            {renderAnalysisTasksTable()}
          </div>
        </DialogContent>
      </Dialog>
      <AnalysisPromptDialog
        open={analysisPromptOpen}
        onOpenChange={setAnalysisPromptOpen}
      />
      <AnalysisResultDialog
        task={selectedAnalysisTask}
        open={analysisResultOpen}
        onOpenChange={setAnalysisResultOpen}
      />
    </>
  )
}
