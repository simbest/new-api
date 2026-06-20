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

export interface PromptLog {
  id: number
  user_id: number
  username: string
  request_id?: string
  model_name: string
  relay_format: string
  content_preview: string
  content_bytes: number
  truncated: boolean
  created_at: number
}

export interface PromptLogContent {
  id: number
  prompt_log_id: number
  content_text: string
  created_at: number
}

export type PromptLogAnalysisStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'

export interface PromptLogAnalysisTask {
  id: number
  user_id: number
  username: string
  filter_user: string
  start_time: number
  end_time: number
  status: PromptLogAnalysisStatus
  prompt_log_count: number
  content_bytes: number
  analysis_model: string
  analysis_prompt: string
  analysis_result: string
  error_message: string
  created_at: number
  started_at: number
  finished_at: number
}

export interface PromptLogAnalysisPrompt {
  prompt: string
  default_prompt: string
}

export interface PageData<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data?: T
}

export interface GetPromptLogsParams {
  p?: number
  page_size?: number
  user?: string
  start_time?: number
  end_time?: number
}

export interface GetPromptLogAnalysisTasksParams {
  p?: number
  page_size?: number
  user?: string
  status?: PromptLogAnalysisStatus | ''
  start_time?: number
  end_time?: number
}
