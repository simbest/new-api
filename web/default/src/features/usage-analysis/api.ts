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

import { api } from '@/lib/api'
import type {
  ApiResponse,
  GetPromptLogAnalysisTasksParams,
  GetPromptLogsParams,
  PageData,
  PromptLogAnalysisPrompt,
  PromptLogAnalysisTask,
  PromptLog,
  PromptLogContent,
} from './types'

export async function getPromptLogs(
  params: GetPromptLogsParams = {}
): Promise<ApiResponse<PageData<PromptLog>>> {
  const query = new URLSearchParams()
  query.set('p', String(params.p ?? 1))
  query.set('page_size', String(params.page_size ?? 20))
  if (params.user?.trim()) query.set('user', params.user.trim())
  if (params.start_time) query.set('start_time', String(params.start_time))
  if (params.end_time) query.set('end_time', String(params.end_time))
  const res = await api.get(`/api/prompt_log/?${query.toString()}`)
  return res.data
}

export async function getPromptLogContent(
  promptLogId: number
): Promise<ApiResponse<PromptLogContent>> {
  const res = await api.get(`/api/prompt_log/${promptLogId}/content`)
  return res.data
}

export async function createPromptLogAnalysis(
  params: GetPromptLogsParams = {}
): Promise<ApiResponse<PromptLogAnalysisTask>> {
  const query = new URLSearchParams()
  if (params.user?.trim()) query.set('user', params.user.trim())
  if (params.start_time) query.set('start_time', String(params.start_time))
  if (params.end_time) query.set('end_time', String(params.end_time))
  const res = await api.post(`/api/prompt_log/analysis?${query.toString()}`)
  return res.data
}

export async function getPromptLogAnalysisTasks(
  params: GetPromptLogAnalysisTasksParams = {}
): Promise<ApiResponse<PageData<PromptLogAnalysisTask>>> {
  const query = new URLSearchParams()
  query.set('p', String(params.p ?? 1))
  query.set('page_size', String(params.page_size ?? 10))
  if (params.user?.trim()) query.set('user', params.user.trim())
  if (params.status) query.set('status', params.status)
  if (params.start_time) query.set('start_time', String(params.start_time))
  if (params.end_time) query.set('end_time', String(params.end_time))
  const res = await api.get(`/api/prompt_log/analysis?${query.toString()}`)
  return res.data
}

export async function getPromptLogAnalysisTask(
  taskId: number
): Promise<ApiResponse<PromptLogAnalysisTask>> {
  const res = await api.get(`/api/prompt_log/analysis/${taskId}`)
  return res.data
}

export async function retryPromptLogAnalysisTask(
  taskId: number
): Promise<ApiResponse<PromptLogAnalysisTask>> {
  const res = await api.post(`/api/prompt_log/analysis/${taskId}/retry`)
  return res.data
}

export async function getPromptLogAnalysisPrompt(): Promise<
  ApiResponse<PromptLogAnalysisPrompt>
> {
  const res = await api.get('/api/prompt_log/analysis/prompt')
  return res.data
}

export async function updatePromptLogAnalysisPrompt(
  prompt: string
): Promise<ApiResponse<{ prompt: string }>> {
  const res = await api.put('/api/prompt_log/analysis/prompt', { prompt })
  return res.data
}

export async function resetPromptLogAnalysisPrompt(): Promise<
  ApiResponse<{ prompt: string }>
> {
  const res = await api.post('/api/prompt_log/analysis/prompt/reset')
  return res.data
}
